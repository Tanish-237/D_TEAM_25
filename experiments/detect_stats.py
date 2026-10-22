"""Runs each detector on a folder of photos and prints aggregate statistics only.

No image, crop or box is written anywhere, so it is safe to run on class photos.

    uv run python experiments/detect_stats.py data/class/photos
    uv run python experiments/detect_stats.py PHOTOS --detectors scrfd_10g yunet --max-side 1280
"""

import argparse
import time

import numpy as np

from quickpic.imageio import list_images, load_image
from quickpic.zoo import DETECTORS, load_detector


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("photos")
    parser.add_argument("--detectors", nargs="+", default=list(DETECTORS), choices=DETECTORS)
    parser.add_argument("--max-side", type=int, default=640)
    args = parser.parse_args()

    paths = list_images(args.photos)
    if not paths:
        raise SystemExit(f"No images found in {args.photos}")
    detectors = [load_detector(name, args.max_side) for name in args.detectors]

    print(f"{len(paths)} photos, detector input longer side = {args.max_side}px\n")
    print(
        f"{'photo':<6}{'resolution':>12}  {'detector':<11}{'faces':>6}{'h p10':>7}"
        f"{'h med':>7}{'h p90':>7}{'ms':>7}"
    )
    for index, path in enumerate(paths, start=1):
        image = load_image(path)
        resolution = f"{image.shape[1]}x{image.shape[0]}"
        for detector in detectors:
            start = time.perf_counter()
            faces = detector.detect(image)
            ms = (time.perf_counter() - start) * 1000
            if faces:
                p10, med, p90 = np.percentile([f.height for f in faces], [10, 50, 90])
                heights = f"{p10:>7.0f}{med:>7.0f}{p90:>7.0f}"
            else:
                heights = f"{'–':>7}{'–':>7}{'–':>7}"
            print(
                f"#{index:<5}{resolution:>12}  {detector.name:<11}{len(faces):>6}"
                f"{heights}{ms:>7.0f}"
            )
        print()


if __name__ == "__main__":
    main()
