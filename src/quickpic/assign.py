"""Photo-level one-to-one assignment: our component A (Eq. 4 in the paper).

A student appears at most once in a photo, but deciding each face separately
can give two faces the same name. Here all faces are decided together: each
face-student pair is worth (score - threshold), every face may instead take an
"unknown" option worth 0, and the Hungarian method finds the assignment with
the highest total value. A pair below the threshold has negative value and is
never chosen, so weak matches still become unknown.
"""

import numpy as np
from scipy.optimize import linear_sum_assignment

from quickpic.match import UNKNOWN


def assign_one_to_one(scores: np.ndarray, threshold: float) -> np.ndarray:
    """Returns one student index per face, or UNKNOWN, using each student at most once."""
    faces, students = scores.shape
    if faces == 0 or students == 0:
        return np.full(faces, UNKNOWN)
    value = np.hstack([scores - threshold, np.zeros((faces, faces))])
    rows, columns = linear_sum_assignment(value, maximize=True)
    result = np.full(faces, UNKNOWN)
    for face, column in zip(rows, columns, strict=True):
        if column < students and value[face, column] >= 0:
            result[face] = column
    return result
