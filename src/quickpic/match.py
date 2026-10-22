"""Comparing face embeddings with enrolled students.

The gallery holds every stored embedding of every enrolled student. A face's
score for a student is its best cosine similarity to any of that student's
embeddings (Eq. 1 in the paper).
"""

from dataclasses import dataclass

import numpy as np

UNKNOWN = -1


@dataclass(frozen=True)
class Gallery:
    ids: list[str]
    vectors: np.ndarray
    owner: np.ndarray

    @classmethod
    def from_dict(cls, embeddings: dict[str, np.ndarray]) -> "Gallery":
        """Builds a gallery from {student id: (k, d) array of that student's embeddings}."""
        ids = list(embeddings)
        vectors = np.vstack([embeddings[i] for i in ids])
        owner = np.concatenate([np.full(len(embeddings[i]), n) for n, i in enumerate(ids)])
        return cls(ids=ids, vectors=vectors, owner=owner)

    def scores(self, probes: np.ndarray) -> np.ndarray:
        """(faces, students) matrix: each face's best similarity to each student."""
        similarities = probes @ self.vectors.T
        best = np.full((len(probes), len(self.ids)), -np.inf, dtype=similarities.dtype)
        for student in range(len(self.ids)):
            best[:, student] = similarities[:, self.owner == student].max(axis=1)
        return best


def decide_independently(scores: np.ndarray, threshold: float) -> np.ndarray:
    """Baseline decision: each face takes its best student if that score reaches the threshold.

    Returns one student index per face, or UNKNOWN.
    """
    if scores.shape[1] == 0:
        return np.full(len(scores), UNKNOWN)
    best = scores.argmax(axis=1)
    return np.where(scores.max(axis=1) >= threshold, best, UNKNOWN)
