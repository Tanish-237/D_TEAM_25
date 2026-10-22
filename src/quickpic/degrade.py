"""Degradation-aware enrollment: our component D (Eq. 2 in the paper).

Enrollment photos are sharp close-ups, while faces in a class photo are small,
blurred and unevenly lit. Each aligned enrollment crop is therefore also stored
as a fixed set of degraded copies that imitate those conditions, and the
embeddings of all copies join the student's gallery.
"""

import cv2
import numpy as np


def downscale(crop: np.ndarray, height: int) -> np.ndarray:
    """Simulates a face that was only `height` pixels tall in the photo."""
    size = crop.shape[0]
    small = cv2.resize(crop, (height, height), interpolation=cv2.INTER_AREA)
    return cv2.resize(small, (size, size), interpolation=cv2.INTER_CUBIC)


def blur(crop: np.ndarray, sigma: float) -> np.ndarray:
    return cv2.GaussianBlur(crop, (0, 0), sigma)


def gamma(crop: np.ndarray, value: float) -> np.ndarray:
    """value > 1 darkens, value < 1 brightens."""
    table = (255 * (np.arange(256) / 255) ** value).astype(np.uint8)
    return cv2.LUT(crop, table)


def jpeg(crop: np.ndarray, quality: int) -> np.ndarray:
    encoded = cv2.imencode(".jpg", crop, [cv2.IMWRITE_JPEG_QUALITY, quality])[1]
    return cv2.imdecode(encoded, cv2.IMREAD_COLOR)


def flip(crop: np.ndarray) -> np.ndarray:
    return cv2.flip(crop, 1)


VARIANTS = {
    "flip": flip,
    "down48": lambda c: downscale(c, 48),
    "down32": lambda c: downscale(c, 32),
    "down24": lambda c: downscale(c, 24),
    "down32_flip": lambda c: flip(downscale(c, 32)),
    "blur": lambda c: blur(c, 1.5),
    "dark": lambda c: gamma(c, 1.8),
    "bright": lambda c: gamma(c, 0.6),
    "down32_dark": lambda c: gamma(downscale(c, 32), 1.8),
    "down32_jpeg": lambda c: jpeg(downscale(c, 32), 30),
}


def degraded_copies(crop: np.ndarray) -> list[np.ndarray]:
    """The original crop followed by one copy per entry in VARIANTS, in a fixed order."""
    return [crop, *(make(crop) for make in VARIANTS.values())]
