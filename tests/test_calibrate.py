import numpy as np

from quickpic.calibrate import Calibrator


def synthetic_pairs(n=4000, seed=0):
    """Genuine scores fall as faces shrink; impostor scores do not depend on size."""
    rng = np.random.default_rng(seed)
    heights = rng.uniform(12, 112, n)
    same = rng.random(n) < 0.5
    quality = np.log(heights) / np.log(112)
    scores = np.where(same, 0.7 * quality, 0.0) + rng.normal(0, 0.08, n)
    return scores, same, heights, np.full(n, 100.0)


def test_calibrator_lowers_the_bar_for_small_faces():
    calibrator = Calibrator.fit(*synthetic_pairs())

    small, large = calibrator.probability(
        np.array([[0.35], [0.35]]), np.array([16, 100]), np.full(2, 100.0)
    )

    assert small[0] > large[0]


def test_probabilities_are_ordered_by_score_and_shaped_like_input():
    calibrator = Calibrator.fit(*synthetic_pairs())
    scores = np.array([[0.1, 0.5, 0.9]])

    p = calibrator.probability(scores, np.array([60.0]), np.array([100.0]))

    assert p.shape == (1, 3)
    assert np.all(np.diff(p[0]) > 0)


def test_save_and_load_round_trip(tmp_path):
    calibrator = Calibrator.fit(*synthetic_pairs())
    path = tmp_path / "calibrator.json"

    calibrator.save(path)
    loaded = Calibrator.load(path)

    scores, heights, sharp = np.array([[0.3, 0.6]]), np.array([30.0]), np.array([50.0])
    np.testing.assert_allclose(
        loaded.probability(scores, heights, sharp), calibrator.probability(scores, heights, sharp)
    )
