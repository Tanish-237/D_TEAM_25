"""Public benchmarks for the embedder comparison (Table IV): LFW and TinyFace.

Embeds about 175k images per embedder, so it is meant for a Colab GPU via
notebooks/01_public_benchmarks.ipynb. Embeddings are cached, so a rerun only
recomputes the metrics.

    QUICKPIC_DEVICE=cuda python -m experiments.public_benchmarks \\
        --lfw /content/lfw --tinyface /content/tinyface \\
        --cache /content/drive/MyDrive/QuickPic/cache

LFW: the standard 6,000 pairs in 10 folds. Each 250x250 image is detected
with SCRFD-10GF and aligned; the face nearest the centre is used.

TinyFace (Cheng et al., ACCV 2018): faces are about 20x16 pixels, too small to
detect landmarks, so each is padded to a square and resized to 112x112.
  closed set: the official protocol, every probe against all 4,443 mated
    gallery images plus 153,428 distractors; rank-k image retrieval.
  open set: half the test identities are enrolled (seeded, 5 repeats). Probes
    of the other half and all distractor images must be rejected as unknown.
"""

import argparse
import time
from pathlib import Path

import cv2
import numpy as np
import scipy.io

from experiments.common import save_results
from quickpic.align import align, crop_box
from quickpic.embed import Embedder
from quickpic.face import Face
from quickpic.match import UNKNOWN, Gallery
from quickpic.metrics import open_set_identification, tar_at_far, verification_accuracy
from quickpic.zoo import EMBEDDERS, load_detector, load_embedder

BATCH = 256
OPEN_SET_SEEDS = range(5)
FARS = (1e-2, 1e-3)


def embed_paths(embedder: Embedder, paths: list[Path], prepare, cache: Path) -> np.ndarray:
    """Embeds images in batches, caching the result as a .npy file."""
    if cache.exists():
        return np.load(cache).astype(np.float32)
    vectors, start = [], time.perf_counter()
    for begin in range(0, len(paths), BATCH):
        crops = [prepare(cv2.imread(str(p))) for p in paths[begin : begin + BATCH]]
        vectors.append(embedder.embed(crops))
        if begin // BATCH % 50 == 0:
            done = begin + len(crops)
            rate = done / (time.perf_counter() - start)
            print(f"  {cache.stem}: {done}/{len(paths)} ({rate:.0f} img/s)", flush=True)
    result = np.vstack(vectors).astype(np.float32)
    cache.parent.mkdir(parents=True, exist_ok=True)
    np.save(cache, result.astype(np.float16))
    return result


def pad_to_square(image: np.ndarray, size: int = 112) -> np.ndarray:
    h, w = image.shape[:2]
    side = max(h, w)
    top, left = (side - h) // 2, (side - w) // 2
    square = cv2.copyMakeBorder(
        image, top, side - h - top, left, side - w - left, cv2.BORDER_REPLICATE
    )
    return cv2.resize(square, (size, size), interpolation=cv2.INTER_CUBIC)


def lfw(root: Path, embedder: Embedder, cache: Path) -> dict:
    pairs = read_lfw_pairs(root / "pairs.txt")
    names = sorted({p for pair in pairs for p in (pair[0], pair[1])})
    index = {name: i for i, name in enumerate(names)}
    crops = lfw_aligned_crops(root, names, cache / "lfw_aligned_crops.npy")
    file = cache / f"lfw_{embedder.name}.npy"
    if file.exists():
        vectors = np.load(file).astype(np.float32)
    else:
        vectors = np.vstack(
            [embedder.embed(list(crops[i : i + BATCH])) for i in range(0, len(crops), BATCH)]
        )
        np.save(file, vectors.astype(np.float16))
    scores = np.array([vectors[index[a]] @ vectors[index[b]] for a, b, _, _ in pairs])
    same = np.array([s for _, _, s, _ in pairs])
    folds = np.array([f for _, _, _, f in pairs])
    return {
        "accuracy": verification_accuracy(scores, same, folds),
        "tar_at_far_1e-3": tar_at_far(scores[same], scores[~same], 1e-3),
        "pairs": len(pairs),
    }


def lfw_aligned_crops(root: Path, names: list[str], cache: Path) -> np.ndarray:
    """Detects and aligns every LFW image once; the crops are shared by all embedders."""
    if cache.exists():
        return np.load(cache)
    detector = load_detector("scrfd_10g")
    crops = []
    for n, name in enumerate(names):
        image = cv2.imread(str(root / "lfw" / name))
        faces = detector.detect(image)
        if faces:
            centre = np.array(image.shape[1::-1]) / 2
            nearest = min(faces, key=lambda f: np.linalg.norm(box_centre(f) - centre))
            crops.append(align(image, nearest))
        else:
            crops.append(crop_box(image, np.array([68, 68, 182, 182])))
        if n % 2000 == 0:
            print(f"  aligning LFW: {n}/{len(names)}", flush=True)
    result = np.stack(crops)
    cache.parent.mkdir(parents=True, exist_ok=True)
    np.save(cache, result)
    return result


def read_lfw_pairs(path: Path) -> list[tuple[str, str, bool, int]]:
    lines = path.read_text().split("\n")
    folds, per_fold = map(int, lines[0].split())
    pairs = []
    for row, line in enumerate(lines[1 : 1 + folds * 2 * per_fold]):
        parts = line.split()
        if len(parts) == 3:
            name, i, j = parts
            a, b, same = image_name(name, i), image_name(name, j), True
        else:
            n1, i, n2, j = parts
            a, b, same = image_name(n1, i), image_name(n2, j), False
        pairs.append((a, b, same, row // (2 * per_fold)))
    return pairs


def image_name(person: str, number: str) -> str:
    return f"{person}/{person}_{int(number):04d}.jpg"


def box_centre(face: Face) -> np.ndarray:
    return np.array([(face.box[0] + face.box[2]) / 2, (face.box[1] + face.box[3]) / 2])


def tinyface(root: Path, embedder: Embedder, cache: Path) -> dict:
    test = root / "Testing_Set"
    probe_names, probe_ids = read_mat(test / "probe_img_ID_pairs.mat", "probe")
    gallery_names, gallery_ids = read_mat(test / "gallery_match_img_ID_pairs.mat", "gallery")
    distractors = sorted((test / "Gallery_Distractor").glob("*.jpg"))

    def embed(name, paths):
        return embed_paths(
            embedder, paths, pad_to_square, cache / f"tinyface_{name}_{embedder.name}.npy"
        )

    probes = embed("probe", [test / "Probe" / n for n in probe_names])
    gallery = embed("gallery", [test / "Gallery_Match" / n for n in gallery_names])
    distractor = embed("distractor", distractors)

    return {
        "closed_set": tinyface_closed_set(probes, probe_ids, gallery, gallery_ids, distractor),
        "open_set": tinyface_open_set(probes, probe_ids, gallery, gallery_ids, distractor),
    }


def read_mat(path: Path, prefix: str) -> tuple[list[str], np.ndarray]:
    mat = scipy.io.loadmat(path)
    names = [str(cell[0][0]) for cell in mat[f"{prefix}_set"]]
    return names, mat[f"{prefix}_ids"].ravel().astype(int)


def tinyface_closed_set(probes, probe_ids, gallery, gallery_ids, distractor) -> dict:
    """Official protocol: rank of the first correct image among gallery and distractor images."""
    everything = np.vstack([gallery, distractor])
    ids = np.concatenate([gallery_ids, np.full(len(distractor), -100)])
    ranks = []
    for begin in range(0, len(probes), 512):
        sims = probes[begin : begin + 512] @ everything.T
        for row, probe_id in zip(sims, probe_ids[begin : begin + 512], strict=True):
            best_correct = row[ids == probe_id].max()
            ranks.append(int(np.sum(row > best_correct)) + 1)
    ranks = np.array(ranks)
    result = {f"rank{k}": float(np.mean(ranks <= k)) for k in (1, 5, 20)}
    result["distractor_images"] = len(distractor)
    return result


def tinyface_open_set(probes, probe_ids, gallery, gallery_ids, distractor) -> dict:
    """Half the identities enrolled; all other probes and every distractor must be rejected."""
    identities = np.unique(gallery_ids)
    runs = []
    for seed in OPEN_SET_SEEDS:
        enrolled = np.random.default_rng(seed).permutation(identities)[: len(identities) // 2]
        column = {identity: n for n, identity in enumerate(enrolled)}
        bank = Gallery.from_dict({i: gallery[gallery_ids == i] for i in enrolled})
        truth = np.array([column.get(i, UNKNOWN) for i in probe_ids])
        scores = np.vstack([bank.scores(probes), chunked_scores(bank, distractor)])
        truth = np.concatenate([truth, np.full(len(distractor), UNKNOWN)])
        runs.append({far: open_set_identification(scores, truth, far) for far in FARS})
    summary = {}
    for far in FARS:
        values = np.array([run[far]["dir"] for run in runs])
        summary[f"dir_at_far_{far:g}"] = {"mean": float(values.mean()), "std": float(values.std())}
    summary["enrolled_identities"] = len(identities) // 2
    summary["unknown_probes"] = int(np.sum(truth == UNKNOWN))
    return summary


def chunked_scores(bank: Gallery, probes: np.ndarray, chunk: int = 8192) -> np.ndarray:
    return np.vstack([bank.scores(probes[i : i + chunk]) for i in range(0, len(probes), chunk)])


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--lfw", type=Path, help="folder with lfw/ and pairs.txt")
    parser.add_argument("--tinyface", type=Path, help="the extracted tinyface/ folder")
    parser.add_argument("--cache", type=Path, required=True)
    parser.add_argument("--embedders", nargs="+", default=list(EMBEDDERS), choices=EMBEDDERS)
    args = parser.parse_args()

    for name in args.embedders:
        embedder = load_embedder(name)
        if hasattr(embedder, "model"):
            print(
                name,
                "running on",
                getattr(embedder.model, "session", None) and embedder.model.session.get_providers(),
            )
        results = {"embedder": name}
        if args.lfw:
            results["lfw"] = lfw(args.lfw, embedder, args.cache)
            print(name, "LFW", results["lfw"], flush=True)
        if args.tinyface:
            results["tinyface"] = tinyface(args.tinyface, embedder, args.cache)
            print(name, "TinyFace", results["tinyface"], flush=True)
        config = {
            "tinyface_preprocessing": "pad to square, resize 112",
            "lfw_detector": "scrfd_10g",
            "open_set_seeds": list(OPEN_SET_SEEDS),
            "fars": FARS,
        }
        print(save_results(f"public_benchmarks_{name}", config, results))


if __name__ == "__main__":
    main()
