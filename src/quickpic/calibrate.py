"""Quality-aware score calibration: our component C (Eq. 3 in the paper).

A small or blurred face scores lower even against the right person, and
unrelated low-quality faces also look more alike, so one global threshold is
too strict for some faces and too lenient for others. A logistic regression
maps (similarity, face height, sharpness) to the probability that the pair is
the same person. The product term lets the model learn that low-quality faces
separate genuine from impostor pairs less well.
"""

import json
from dataclasses import dataclass
from pathlib import Path

import numpy as np
from sklearn.linear_model import LogisticRegression

FEATURES = ("score", "log_height", "log_sharpness", "score_x_log_height")


def feature_matrix(scores: np.ndarray, heights: np.ndarray, sharpness: np.ndarray) -> np.ndarray:
    """One row per (face, student) pair; heights and sharpness are given per face."""
    scores = np.atleast_2d(scores)
    log_h = np.log(np.maximum(heights, 1.0))[:, None] * np.ones_like(scores)
    log_b = np.log1p(np.maximum(sharpness, 0.0))[:, None] * np.ones_like(scores)
    return np.stack([scores, log_h, log_b, scores * log_h], axis=-1).reshape(-1, len(FEATURES))


@dataclass
class Calibrator:
    weights: np.ndarray
    bias: float
    mean: np.ndarray
    scale: np.ndarray

    @classmethod
    def fit(cls, scores, same, heights, sharpness) -> "Calibrator":
        """Fits on pairs: scores, same, heights and sharpness are all 1-D, one entry per pair."""
        x = feature_matrix(np.asarray(scores)[:, None], np.asarray(heights), np.asarray(sharpness))
        mean, scale = x.mean(axis=0), x.std(axis=0) + 1e-9
        model = LogisticRegression(C=1.0, max_iter=1000).fit((x - mean) / scale, same)
        return cls(weights=model.coef_[0], bias=float(model.intercept_[0]), mean=mean, scale=scale)

    def probability(self, scores: np.ndarray, heights: np.ndarray, sharpness: np.ndarray):
        """Match probability with the same shape as scores (faces, students)."""
        scores = np.atleast_2d(scores)
        x = (feature_matrix(scores, heights, sharpness) - self.mean) / self.scale
        logits = x @ self.weights + self.bias
        return (1 / (1 + np.exp(-logits))).reshape(scores.shape)

    def save(self, path: Path) -> None:
        data = {
            "features": FEATURES,
            "weights": self.weights.tolist(),
            "bias": self.bias,
            "mean": self.mean.tolist(),
            "scale": self.scale.tolist(),
        }
        path.write_text(json.dumps(data, indent=1))

    @classmethod
    def load(cls, path: Path) -> "Calibrator":
        data = json.loads(path.read_text())
        return cls(
            weights=np.array(data["weights"]),
            bias=data["bias"],
            mean=np.array(data["mean"]),
            scale=np.array(data["scale"]),
        )
