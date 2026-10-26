"""Detection recall on our class photographs, with and without tiling.

A labelled face (any label except "not a face") counts as found when a
detection overlaps it at IoU >= 0.4. Detections overlapping no labelled face
are counted as extra boxes. Prints and saves aggregate numbers only.

    uv run python -m experiments.class_detection --data data/class
"""

import argparse
import time
from pathlib import Path

import numpy as np

from experiments.class_eval import MATCH_IOU, load_ground_truth
from experiments.common import save_results
from quickpic.imageio import list_images, load_image
from quickpic.tiling import iou
from quickpic.zoo import load_detector

DETECTORS = ["scrfd_10g", "scrfd_500m", "yunet", "haar"]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--data", type=Path, required=True)
    args = parser.parse_args()

    truth = load_ground_truth(args.data / "labels")
    images = {p.name: load_image(p) for p in list_images(args.data / "photos") if p.name in truth}
    rows = []
    for name in DETECTORS:
        for tiles in (False, True):
            detector = load_detector(name, tiles=tiles)
            found = total = extra = 0
            heights_missed, seconds = [], 0.0
            for photo, image in images.items():
                start = time.perf_counter()
                faces = detector.detect(image)
                seconds += time.perf_counter() - start
                keep = [i for i, label in enumerate(truth[photo]["labels"]) if label != "not_face"]
                boxes = truth[photo]["boxes"][keep]
                detected = np.array([f.box for f in faces]) if faces else np.zeros((0, 4))
                for box in boxes:
                    hit = len(detected) and (iou(box, detected) >= MATCH_IOU).any()
                    found += bool(hit)
                    if not hit:
                        heights_missed.append(float(box[3] - box[1]))
                total += len(boxes)
                extra += sum(
                    not (len(boxes) and (iou(f.box, boxes) >= MATCH_IOU).any()) for f in faces
                )
            rows.append(
                {
                    "detector": name,
                    "tiles": tiles,
                    "recall": found / total,
                    "found": found,
                    "labelled": total,
                    "extra_boxes": extra,
                    "median_height_missed": float(np.median(heights_missed))
                    if heights_missed
                    else None,
                    "ms_per_photo": 1000 * seconds / len(images),
                }
            )
            print(
                f"{detector.name:18s} recall {found}/{total} = {found / total:.3f}  extra {extra}  "
                f"{1000 * seconds / len(images):.0f} ms/photo",
                flush=True,
            )
    config = {"photos": len(images), "match_iou": MATCH_IOU, "max_side": 640, "tile": 1280}
    print(save_results("class_detection", config, rows))


if __name__ == "__main__":
    main()
