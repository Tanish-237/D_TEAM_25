"""In-domain test on the ICFD sample (IIT Madras): Indian students, lab gallery, classroom probes.

The public sample has 10 subjects with 20 lab-captured gallery images and 20
classroom probe crops each (probe median height 60 px). It is small, so it is
a check of direction rather than a benchmark.

  closed set: every probe against all 10 enrolled subjects; rank-1.
  open set: 5 subjects enrolled, the other 5 act as unknown people; 20 seeded
    splits; DIR at 5% false alarm rate.

Run with and without degradation-aware enrollment (component D).

    uv run python -m experiments.icfd_sample --root data/public/icfd/ICFD_Samples
"""

import argparse
from pathlib import Path

import cv2
import numpy as np

from experiments.common import save_results
from quickpic.align import align, crop_box
from quickpic.degrade import degraded_copies
from quickpic.imageio import load_image
from quickpic.match import UNKNOWN, Gallery
from quickpic.metrics import open_set_identification
from quickpic.zoo import EMBEDDERS, load_detector, load_embedder

SPLITS = range(20)
FAR = 0.05


def aligned_crops(paths: list[Path], detector) -> list[np.ndarray]:
    """Pads each tight face crop so the detector sees some context, then aligns the largest face."""
    crops = []
    for path in paths:
        image = load_image(path)
        pad = max(image.shape[:2]) // 2
        padded = cv2.copyMakeBorder(image, pad, pad, pad, pad, cv2.BORDER_CONSTANT, value=0)
        faces = detector.detect(padded)
        if faces:
            crops.append(align(padded, max(faces, key=lambda f: f.height)))
        else:
            h, w = image.shape[:2]
            crops.append(crop_box(padded, np.array([pad, pad, pad + w, pad + h])))
    return crops


def evaluate(gallery: dict, probes: np.ndarray, probe_ids: np.ndarray) -> dict:
    subjects = sorted(gallery)
    bank = Gallery.from_dict(gallery)
    truth = np.array([subjects.index(s) for s in probe_ids])
    rank1 = float(np.mean(bank.scores(probes).argmax(axis=1) == truth))

    dirs = []
    for seed in SPLITS:
        enrolled = sorted(np.random.default_rng(seed).permutation(subjects)[: len(subjects) // 2])
        bank = Gallery.from_dict({s: gallery[s] for s in enrolled})
        truth = np.array([enrolled.index(s) if s in enrolled else UNKNOWN for s in probe_ids])
        dirs.append(open_set_identification(bank.scores(probes), truth, FAR)["dir"])
    return {
        "rank1": rank1,
        "open_set_dir": float(np.mean(dirs)),
        "open_set_dir_std": float(np.std(dirs)),
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=Path, required=True)
    parser.add_argument("--embedders", nargs="+", default=list(EMBEDDERS), choices=EMBEDDERS)
    args = parser.parse_args()

    detector = load_detector("scrfd_10g")
    gallery_paths = sorted((args.root / "Gallery").glob("*/*.jpg"))
    probe_paths = sorted((args.root / "Probe").glob("*/*.jpg"))
    gallery_ids = [p.parent.name for p in gallery_paths]
    probe_ids = np.array([p.parent.name for p in probe_paths])
    gallery_crops = aligned_crops(gallery_paths, detector)
    probe_crops = aligned_crops(probe_paths, detector)

    rows = []
    for name in args.embedders:
        embedder = load_embedder(name)
        probes = embedder.embed(probe_crops)
        for degraded in (False, True):
            gallery = {}
            for subject in sorted(set(gallery_ids)):
                crops = [c for c, s in zip(gallery_crops, gallery_ids, strict=True) if s == subject]
                if degraded:
                    crops = [copy for crop in crops for copy in degraded_copies(crop)]
                gallery[subject] = embedder.embed(crops)
            result = evaluate(gallery, probes, probe_ids)
            rows.append({"embedder": name, "degraded_gallery": degraded, **result})
            print(rows[-1], flush=True)

    config = {"splits": len(SPLITS), "far": FAR, "detector": "scrfd_10g on padded crops"}
    print(save_results("icfd_sample", config, rows))


if __name__ == "__main__":
    main()
