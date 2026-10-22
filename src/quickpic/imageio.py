from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageOps
from pillow_heif import register_heif_opener

register_heif_opener()

IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png", ".heic", ".heif", ".webp"}


def load_image(path: str | Path) -> np.ndarray:
    """Reads any supported photo as a BGR uint8 array, upright.

    Phone cameras store rotation in EXIF metadata instead of rotating the
    pixels, so the orientation tag is applied before anything else.
    """
    with Image.open(path) as image:
        rgb = ImageOps.exif_transpose(image).convert("RGB")
        return cv2.cvtColor(np.asarray(rgb), cv2.COLOR_RGB2BGR)


def list_images(folder: str | Path) -> list[Path]:
    return sorted(p for p in Path(folder).rglob("*") if p.suffix.lower() in IMAGE_SUFFIXES)


def resize_to_max_side(image: np.ndarray, max_side: int | None) -> tuple[np.ndarray, float]:
    """Shrinks the image so its longer side is at most max_side. Returns the image and the scale."""
    longest = max(image.shape[:2])
    if max_side is None or longest <= max_side:
        return image, 1.0
    scale = max_side / longest
    size = (round(image.shape[1] * scale), round(image.shape[0] * scale))
    return cv2.resize(image, size, interpolation=cv2.INTER_AREA), scale
