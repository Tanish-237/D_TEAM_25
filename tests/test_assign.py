import numpy as np

from quickpic.assign import assign_one_to_one
from quickpic.match import UNKNOWN, decide_independently


def test_two_faces_cannot_take_the_same_student():
    # Both faces look most like student 0; face 1 also resembles student 1.
    scores = np.array([[0.9, 0.2], [0.7, 0.6]])

    assert decide_independently(scores, 0.5).tolist() == [0, 0]
    assert assign_one_to_one(scores, 0.5).tolist() == [0, 1]


def test_loser_becomes_unknown_when_no_other_student_fits():
    scores = np.array([[0.9, 0.1], [0.7, 0.2]])

    assert assign_one_to_one(scores, 0.5).tolist() == [0, UNKNOWN]


def test_weak_matches_stay_unknown():
    scores = np.array([[0.3, 0.4], [0.1, 0.2]])

    assert assign_one_to_one(scores, 0.5).tolist() == [UNKNOWN, UNKNOWN]


def test_more_faces_than_students_and_empty_inputs():
    scores = np.array([[0.8], [0.9], [0.6]])

    assert assign_one_to_one(scores, 0.5).tolist() == [UNKNOWN, 0, UNKNOWN]
    assert assign_one_to_one(np.zeros((0, 3)), 0.5).tolist() == []
    assert assign_one_to_one(np.zeros((2, 0)), 0.5).tolist() == [UNKNOWN, UNKNOWN]
