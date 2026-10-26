"""Fits and tests quality-aware calibration (component C). Needs a GPU: notebook 02.

Training pairs come from LFW people with at least two photos. The first photo
of each person is the clean enrollment; the others become probes, degraded to
a random face height, blur and brightness. Genuine pairs compare a probe with
its own person, impostor pairs with 20 other people. People are split 70/30,
so the calibrator is tested on people it never saw.

Tests:
  LFW held-out: TAR per face-height bin at one global 1% false accept rate,
    thresholding the raw score versus the calibrated probability.
  TinyFace open set (native low-resolution faces, cached embeddings from
    notebook 01): DIR at 1% and 0.1% FAR, raw versus calibrated.

    QUICKPIC_DEVICE=cuda python -m experiments.calibration \\
        --lfw /content/lfw --tinyface /content/tinyface --cache "$QP/cache"
"""

import argparse
from pathlib import Path

import cv2
import numpy as np

from experiments.common import RESULTS_DIR, save_results
from experiments.public_benchmarks import embed_paths, pad_to_square, read_mat
from quickpic.align import align, crop_box
from quickpic.calibrate import Calibrator
from quickpic.degrade import blur, downscale, gamma
from quickpic.match import UNKNOWN, Gallery
from quickpic.metrics import open_set_identification, threshold_at_far
from quickpic.quality import sharpness
from quickpic.zoo import load_detector, load_embedder

HEIGHTS = [12, 16, 20, 24, 32, 48, 64, 112]
IMPOSTORS_PER_PROBE = 20
PROBES_PER_PERSON = 3
FAR = 0.01


def lfw_people(root: Path) -> dict[str, list[Path]]:
    people = {}
    for folder in sorted((root / "lfw").iterdir()):
        photos = sorted(folder.glob("*.jpg"))
        if len(photos) >= 2:
            people[folder.name] = photos[: 1 + PROBES_PER_PERSON]
    return people


def aligned(path: Path, detector) -> np.ndarray:
    image = cv2.imread(str(path))
    faces = detector.detect(image)
    if not faces:
        return crop_box(image, np.array([68, 68, 182, 182]))
    centre = np.array(image.shape[1::-1]) / 2
    return align(
        image, min(faces, key=lambda f: np.linalg.norm(f.box[:2] + f.box[2:] - 2 * centre))
    )


def degrade_probe(crop: np.ndarray, rng) -> tuple[np.ndarray, float]:
    height = int(rng.choice(HEIGHTS))
    out = crop if height >= 112 else downscale(crop, height)
    sigma = float(rng.choice([0.0, 0.8, 1.5]))
    if sigma:
        out = blur(out, sigma)
    out = gamma(out, float(rng.choice([0.6, 1.0, 1.0, 1.8])))
    return out, float(height)


def build_pairs(people, embedder, detector, seed=0):
    """Returns (scores, same, heights, sharpness, is_train) for all genuine and impostor pairs."""
    rng = np.random.default_rng(seed)
    names = list(people)
    train_names = set(rng.permutation(names)[: int(0.7 * len(names))])
    crops = {name: [aligned(p, detector) for p in photos] for name, photos in people.items()}
    enrolled = {name: embedder.embed([c[0]])[0] for name, c in crops.items()}

    rows = []
    for name in names:
        split = name in train_names
        others = [n for n in names if (n in train_names) == split and n != name]
        for crop in crops[name][1:]:
            probe, height = degrade_probe(crop, rng)
            vector = embedder.embed([probe])[0]
            sharp = sharpness(probe)
            rows.append((float(vector @ enrolled[name]), True, height, sharp, split))
            for other in rng.choice(others, min(IMPOSTORS_PER_PROBE, len(others)), replace=False):
                rows.append((float(vector @ enrolled[other]), False, height, sharp, split))
    return [np.array(column) for column in zip(*rows, strict=True)]


def lfw_by_height(calibrator, scores, same, heights, sharp) -> dict:
    p = calibrator.probability(scores[:, None], heights, sharp)[:, 0]
    raw_t, cal_t = threshold_at_far(scores[~same], FAR), threshold_at_far(p[~same], FAR)
    table = {}
    for h in HEIGHTS:
        rows = heights == h
        g, i = rows & same, rows & ~same
        table[str(h)] = {
            "pairs": int(rows.sum()),
            "tar_raw": rate(scores[g] >= raw_t),
            "tar_calibrated": rate(p[g] >= cal_t),
            "far_raw": rate(scores[i] >= raw_t),
            "far_calibrated": rate(p[i] >= cal_t),
        }
    table["all"] = {
        "tar_raw": float(np.mean(scores[same] >= raw_t)),
        "tar_calibrated": float(np.mean(p[same] >= cal_t)),
    }
    return table


def rate(accepted: np.ndarray) -> float | None:
    return float(np.mean(accepted)) if accepted.size else None


def tinyface_open_set(root: Path, embedder, cache: Path, calibrator) -> dict:
    test = root / "Testing_Set"
    probe_names, probe_ids = read_mat(test / "probe_img_ID_pairs.mat", "probe")
    gallery_names, gallery_ids = read_mat(test / "gallery_match_img_ID_pairs.mat", "gallery")
    probe_paths = [test / "Probe" / n for n in probe_names] + sorted(
        (test / "Gallery_Distractor").glob("*.jpg")
    )

    def embed(name, paths):
        file = cache / f"tinyface_{name}_{embedder.name}.npy"
        return embed_paths(embedder, paths, pad_to_square, file)

    probes = np.vstack(
        [
            embed("probe", probe_paths[: len(probe_names)]),
            embed("distractor", probe_paths[len(probe_names) :]),
        ]
    )
    gallery = embed("gallery", [test / "Gallery_Match" / n for n in gallery_names])
    heights, sharp = [], []
    for path in probe_paths:
        image = cv2.imread(str(path))
        heights.append(image.shape[0])
        sharp.append(sharpness(pad_to_square(image)))
    heights, sharp = np.array(heights, float), np.array(sharp)

    identities = np.unique(gallery_ids)
    results = {"raw": [], "calibrated": []}
    for seed in range(5):
        enrolled = np.random.default_rng(seed).permutation(identities)[: len(identities) // 2]
        column = {identity: n for n, identity in enumerate(enrolled)}
        bank = Gallery.from_dict({i: gallery[gallery_ids == i] for i in enrolled})
        truth = np.array([column.get(i, UNKNOWN) for i in probe_ids])
        truth = np.concatenate([truth, np.full(len(probes) - len(probe_ids), UNKNOWN)])
        scores = np.vstack([bank.scores(probes[i : i + 8192]) for i in range(0, len(probes), 8192)])
        p = calibrator.probability(scores, heights, sharp)
        for far in (1e-2, 1e-3):
            results["raw"].append((far, open_set_identification(scores, truth, far)["dir"]))
            results["calibrated"].append((far, open_set_identification(p, truth, far)["dir"]))
    return {
        kind: {
            f"dir_at_far_{far:g}": float(np.mean([d for f, d in runs if f == far]))
            for far in (1e-2, 1e-3)
        }
        for kind, runs in results.items()
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--lfw", type=Path, required=True)
    parser.add_argument("--tinyface", type=Path)
    parser.add_argument("--cache", type=Path, required=True)
    parser.add_argument("--embedders", nargs="+", default=["arcface_mbf", "arcface_r50", "sface"])
    parser.add_argument("--align-detector", default="scrfd_10g", help="scrfd_500m is faster on CPU")
    args = parser.parse_args()

    detector = load_detector(args.align_detector)
    people = lfw_people(args.lfw)
    for name in args.embedders:
        embedder = load_embedder(name)
        scores, same, heights, sharp, train = build_pairs(people, embedder, detector)
        calibrator = Calibrator.fit(scores[train], same[train], heights[train], sharp[train])
        calibrator.save(RESULTS_DIR / f"calibrator_{name}.json")
        test = ~train
        results = {
            "embedder": name,
            "weights": dict(
                zip(
                    ["bias", "score", "log_h", "log_sharp", "score_x_log_h"],
                    [calibrator.bias, *calibrator.weights.tolist()],
                    strict=True,
                )
            ),
            "lfw_test_by_height": lfw_by_height(
                calibrator, scores[test], same[test], heights[test], sharp[test]
            ),
            "pairs": {"train": int(train.sum()), "test": int(test.sum())},
        }
        if args.tinyface:
            results["tinyface_open_set"] = tinyface_open_set(
                args.tinyface, embedder, args.cache, calibrator
            )
        print(name, results, flush=True)
        config = {"heights": HEIGHTS, "far": FAR, "impostors_per_probe": IMPOSTORS_PER_PROBE}
        print(save_results(f"calibration_{name}", config, results))


if __name__ == "__main__":
    main()
