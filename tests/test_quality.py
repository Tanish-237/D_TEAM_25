import cv2
import numpy as np

from quickpic.align import ARCFACE_TEMPLATE
from quickpic.quality import brightness, sharpness, yaw


def test_blur_lowers_sharpness():
    rng = np.random.default_rng(0)
    image = rng.integers(0, 256, (112, 112, 3), dtype=np.uint8)
    blurred = cv2.GaussianBlur(image, (9, 9), 3)

    assert sharpness(blurred) < sharpness(image) / 10


def test_brightness_range():
    assert brightness(np.zeros((10, 10, 3), np.uint8)) == 0
    assert brightness(np.full((10, 10, 3), 255, np.uint8)) == 255


def test_yaw_is_near_zero_for_frontal_template():
    assert abs(yaw(ARCFACE_TEMPLATE)) < 0.05


def test_yaw_flips_sign_when_mirrored():
    turned = ARCFACE_TEMPLATE.copy()
    turned[2, 0] += 15
    mirrored = turned.copy()
    mirrored[:, 0] = 112 - mirrored[:, 0]
    mirrored[[0, 1]] = mirrored[[1, 0]]
    mirrored[[3, 4]] = mirrored[[4, 3]]

    assert yaw(turned) > 0.3
    assert yaw(mirrored) < -0.3
