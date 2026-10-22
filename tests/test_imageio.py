import numpy as np
from PIL import Image

from quickpic.imageio import load_image, resize_to_max_side

EXIF_ORIENTATION = 0x0112
ROTATE_90_CLOCKWISE = 6


def test_load_image_applies_exif_rotation(tmp_path):
    path = tmp_path / "phone.jpg"
    exif = Image.Exif()
    exif[EXIF_ORIENTATION] = ROTATE_90_CLOCKWISE
    Image.new("RGB", (40, 20), "white").save(path, exif=exif)

    image = load_image(path)

    assert image.shape == (40, 20, 3)
    assert image.dtype == np.uint8


def test_resize_to_max_side():
    image = np.zeros((1000, 4000, 3), np.uint8)

    small, scale = resize_to_max_side(image, 640)

    assert small.shape == (160, 640, 3)
    assert scale == 0.16
    assert resize_to_max_side(image, None)[1] == 1.0
