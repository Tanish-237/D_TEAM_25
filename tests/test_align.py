import numpy as np

from quickpic.align import ARCFACE_TEMPLATE, align, crop_box, similarity_transform
from quickpic.face import Face


def apply(matrix: np.ndarray, points: np.ndarray) -> np.ndarray:
    return points @ matrix[:, :2].T + matrix[:, 2]


def test_similarity_transform_recovers_known_transform():
    angle, scale, shift = np.deg2rad(30), 1.5, np.array([12.0, -4.0])
    rotation = scale * np.array([[np.cos(angle), -np.sin(angle)], [np.sin(angle), np.cos(angle)]])
    src = ARCFACE_TEMPLATE
    dst = src @ rotation.T + shift

    matrix = similarity_transform(src, dst)

    np.testing.assert_allclose(matrix[:, :2], rotation, atol=1e-9)
    np.testing.assert_allclose(matrix[:, 2], shift, atol=1e-9)


def test_align_moves_landmarks_onto_template():
    landmarks = ARCFACE_TEMPLATE * 2.5 + np.array([300.0, 120.0])
    face = Face(box=np.array([300, 120, 580, 400]), score=1.0, landmarks=landmarks)
    image = np.zeros((600, 900, 3), np.uint8)

    crop = align(image, face)
    matrix = similarity_transform(landmarks, ARCFACE_TEMPLATE)

    assert crop.shape == (112, 112, 3)
    np.testing.assert_allclose(apply(matrix, landmarks), ARCFACE_TEMPLATE, atol=1e-6)


def test_crop_box_centres_the_box():
    image = np.zeros((200, 200, 3), np.uint8)
    image[50:150, 60:140] = 255

    crop = crop_box(image, np.array([60, 50, 140, 150]))

    assert crop.shape == (112, 112, 3)
    assert crop[56, 56].tolist() == [255, 255, 255]
    assert crop[56, 2].tolist() == [0, 0, 0]
