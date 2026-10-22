"""Checks the pretrained models on InsightFace's public sample photo (6 people).

Skipped when the weights are absent, as in CI. Run `make models` to enable.
"""

from pathlib import Path

import cv2
import insightface
import numpy as np
import pytest

from quickpic.align import align
from quickpic.imageio import load_image
from quickpic.zoo import MODELS_DIR, load_detector, load_embedder

pytestmark = pytest.mark.skipif(
    not (MODELS_DIR / "insightface/buffalo_l").exists(), reason="pretrained models not downloaded"
)

SAMPLE = Path(insightface.__file__).parent / "data/images/t1.jpg"


@pytest.fixture(scope="module")
def image():
    return load_image(SAMPLE)


@pytest.mark.parametrize("name", ["scrfd_10g", "scrfd_500m", "yunet"])
def test_cnn_detectors_find_all_six_faces(image, name):
    faces = load_detector(name).detect(image)

    assert len(faces) == 6
    assert all(f.landmarks is not None and f.landmarks.shape == (5, 2) for f in faces)


def test_haar_finds_most_faces(image):
    assert len(load_detector("haar").detect(image)) >= 4


def test_tiling_recovers_small_faces_in_a_large_photo(image):
    # Shrink the sample so its faces are about 25 px tall, and place it in a 4000x3000 photo.
    small = cv2.resize(image, None, fx=0.2, fy=0.2, interpolation=cv2.INTER_AREA)
    big = np.zeros((3000, 4000, 3), np.uint8)
    big[1500 : 1500 + small.shape[0], 2500 : 2500 + small.shape[1]] = small

    whole = load_detector("scrfd_10g").detect(big)
    tiled = load_detector("scrfd_10g", tiles=True).detect(big)

    assert len(whole) < 6
    assert len(tiled) == 6


def left_to_right(faces):
    return sorted(faces, key=lambda f: f.box[0])


@pytest.mark.parametrize("name", ["arcface_r50", "arcface_mbf", "sface"])
def test_embedder_separates_same_face_from_different_people(image, name):
    scrfd = left_to_right(load_detector("scrfd_10g").detect(image))
    yunet = left_to_right(load_detector("yunet").detect(image))
    embedder = load_embedder(name)

    a = embedder.embed([align(image, f) for f in scrfd])
    b = embedder.embed([align(image, f) for f in yunet])
    same_face = np.sum(a * b, axis=1)
    different_people = a @ a.T
    np.fill_diagonal(different_people, np.nan)

    assert same_face.min() > np.nanmax(different_people)
