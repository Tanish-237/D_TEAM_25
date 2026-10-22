import numpy as np

from quickpic.match import UNKNOWN, Gallery, decide_independently
from quickpic.metrics import (
    attendance,
    open_set_identification,
    tar_at_far,
    threshold_at_far,
    verification_accuracy,
)


def unit(*values):
    v = np.array(values, dtype=np.float64)
    return v / np.linalg.norm(v)


def test_gallery_scores_take_each_students_best_embedding():
    gallery = Gallery.from_dict(
        {"a": np.array([unit(1, 0), unit(0, 1)]), "b": np.array([unit(-1, 0)])}
    )

    scores = gallery.scores(np.array([unit(0, 1), unit(-1, 0)]))

    np.testing.assert_allclose(scores, [[1, 0], [0, 1]], atol=1e-12)


def test_decide_independently_rejects_weak_matches():
    scores = np.array([[0.9, 0.1], [0.2, 0.3]])

    np.testing.assert_array_equal(decide_independently(scores, 0.5), [0, UNKNOWN])


def test_threshold_at_far_accepts_the_allowed_fraction():
    impostor = np.arange(100) / 100

    threshold = threshold_at_far(impostor, 0.05)

    assert np.sum(impostor >= threshold) == 5


def test_tar_at_far():
    assert tar_at_far(np.array([0.9, 0.8, 0.2]), np.linspace(0, 0.5, 100), 0.01) == 2 / 3


def test_verification_accuracy_on_separable_scores():
    scores = np.array([0.9, 0.8, 0.1, 0.2] * 5)
    same = np.array([True, True, False, False] * 5)
    folds = np.repeat(np.arange(5), 4)

    assert verification_accuracy(scores, same, folds) == 1.0


def test_open_set_identification():
    scores = np.array(
        [
            [0.9, 0.1],  # enrolled 0, correct and confident
            [0.4, 0.3],  # enrolled 0, correct but weak
            [0.2, 0.8],  # enrolled 0, wrong student
            [0.5, 0.1],  # unknown
            [0.1, 0.2],  # unknown
        ]
    )
    truth = np.array([0, 0, 0, UNKNOWN, UNKNOWN])

    result = open_set_identification(scores, truth, far=0.0)

    assert result["rank1"] == 2 / 3
    assert result["dir"] == 1 / 3


def test_attendance_counts_false_presents():
    result = attendance({"a", "b", "x"}, {"a", "b", "c"})

    assert result["false_present"] == 1
    assert result["missed"] == 1
    assert result["precision"] == result["recall"] == 2 / 3
