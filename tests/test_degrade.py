import numpy as np

from quickpic.degrade import VARIANTS, degraded_copies, downscale, gamma
from quickpic.quality import brightness, sharpness


def sample_crop():
    return np.random.default_rng(0).integers(0, 256, (112, 112, 3), dtype=np.uint8)


def test_copies_keep_shape_and_order():
    crop = sample_crop()

    copies = degraded_copies(crop)

    assert len(copies) == 1 + len(VARIANTS)
    assert copies[0] is crop
    assert all(c.shape == crop.shape and c.dtype == np.uint8 for c in copies)


def test_copies_are_deterministic():
    first, second = degraded_copies(sample_crop()), degraded_copies(sample_crop())

    assert all(np.array_equal(a, b) for a, b in zip(first, second, strict=True))


def test_smaller_simulated_faces_are_less_sharp():
    crop = sample_crop()

    assert sharpness(downscale(crop, 24)) < sharpness(downscale(crop, 48)) < sharpness(crop)


def test_gamma_darkens_and_brightens():
    crop = np.full((112, 112, 3), 128, np.uint8)

    assert brightness(gamma(crop, 1.8)) < 128 < brightness(gamma(crop, 0.6))
