from dataclasses import dataclass

import numpy as np


@dataclass(frozen=True)
class Face:
    """One detected face.

    box: x1, y1, x2, y2 in image pixels.
    landmarks: 5x2 array of left eye, right eye, nose tip, left mouth corner,
    right mouth corner, where left and right are as seen in the image.
    None for detectors that do not predict landmarks.
    """

    box: np.ndarray
    score: float
    landmarks: np.ndarray | None = None

    @property
    def width(self) -> float:
        return float(self.box[2] - self.box[0])

    @property
    def height(self) -> float:
        return float(self.box[3] - self.box[1])
