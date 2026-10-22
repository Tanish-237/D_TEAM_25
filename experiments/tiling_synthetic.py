"""Controlled check of component T: detection recall as faces get smaller.

InsightFace's public 6-person sample photo is shrunk so its faces reach a
target height, placed at several positions in a 4000x3000 canvas, and each
detector is run with and without tiling. Uses no class data.

    uv run python experiments/tiling_synthetic.py
"""

import time
from pathlib import Path

import cv2
import insightface
import numpy as np

from experiments.common import save_results
from quickpic.imageio import load_image
from quickpic.tiling import iou
from quickpic.zoo import load_detector

CANVAS = (3000, 4000)
FACE_HEIGHTS = [12, 16, 20, 24, 28, 32, 40, 48, 64, 96, 128]
# Where the shrunk photo sits, as a fraction of the free space (top, left).
POSITIONS = [(0.1, 0.1), (0.5, 0.45), (0.9, 0.85)]
DETECTORS = ["scrfd_10g", "scrfd_500m", "yunet", "haar"]
MATCH_IOU = 0.4


def main() -> None:
    sample = load_image(Path(insightface.__file__).parent / "data/images/t1.jpg")
    reference = load_detector("scrfd_10g").detect(sample)
    sample_height = float(np.median([f.height for f in reference]))

    rows = []
    for name in DETECTORS:
        for tiles in (False, True):
            detector = load_detector(name, tiles=tiles)
            for height in FACE_HEIGHTS:
                found, total, seconds = 0, 0, 0.0
                for top, left in POSITIONS:
                    canvas, truth = place(sample, reference, height / sample_height, top, left)
                    start = time.perf_counter()
                    faces = detector.detect(canvas)
                    seconds += time.perf_counter() - start
                    found += count_matched(truth, faces)
                    total += len(truth)
                rows.append(
                    {
                        "detector": name,
                        "tiles": tiles,
                        "face_height_px": height,
                        "recall": found / total,
                        "ms_per_photo": 1000 * seconds / len(POSITIONS),
                    }
                )
                print(f"{detector.name:<18} h={height:>3}px  recall {found}/{total}")

    config = {
        "canvas": CANVAS,
        "face_heights_px": FACE_HEIGHTS,
        "positions": POSITIONS,
        "max_side": 640,
        "tile": 1280,
        "overlap": 0.25,
        "match_iou": MATCH_IOU,
    }
    print(save_results("tiling_synthetic", config, rows))


def place(sample, reference, scale, top_fraction, left_fraction):
    small = cv2.resize(sample, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)
    top = int(top_fraction * (CANVAS[0] - small.shape[0]))
    left = int(left_fraction * (CANVAS[1] - small.shape[1]))
    canvas = np.full((*CANVAS, 3), 90, np.uint8)
    canvas[top : top + small.shape[0], left : left + small.shape[1]] = small
    truth = np.array([f.box * scale + [left, top, left, top] for f in reference])
    return canvas, truth


def count_matched(truth: np.ndarray, faces) -> int:
    if not faces:
        return 0
    boxes = np.array([f.box for f in faces])
    return sum(bool((iou(box, boxes) >= MATCH_IOU).any()) for box in truth)


if __name__ == "__main__":
    main()
