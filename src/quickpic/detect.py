"""Face detectors behind one interface: image in, list of Face out.

Every detector first shrinks the photo so its longer side is at most max_side
pixels. That keeps the comparison fair and is exactly the step that loses
small faces in large group photos.
"""

from pathlib import Path
from typing import Protocol

import cv2
import numpy as np
from insightface.model_zoo import get_model

from quickpic.face import Face
from quickpic.imageio import resize_to_max_side


def device_id(providers: list[str]) -> int:
    """InsightFace convention: 0 means the first GPU, -1 forces the CPU."""
    return 0 if "CUDAExecutionProvider" in providers else -1


class Detector(Protocol):
    name: str

    def detect(self, image: np.ndarray) -> list[Face]: ...


class ScrfdDetector:
    """SCRFD (Guo et al., ICLR 2022), a CNN that predicts boxes and five landmarks."""

    def __init__(
        self,
        model_path: Path,
        name: str,
        max_side: int = 640,
        threshold: float = 0.5,
        providers: list[str] | None = None,
    ):
        self.name = name
        self.max_side = max_side
        providers = providers or ["CPUExecutionProvider"]
        self.model = get_model(str(model_path), providers=providers)
        self.model.prepare(
            device_id(providers), input_size=(max_side, max_side), det_thresh=threshold
        )

    def detect(self, image: np.ndarray) -> list[Face]:
        size = (self.max_side, self.max_side)
        boxes, landmarks = self.model.detect(image, input_size=size)
        return [
            Face(box=box[:4], score=float(box[4]), landmarks=points)
            for box, points in zip(boxes, landmarks, strict=True)
        ]


class YuNetDetector:
    """YuNet (Wu et al., 2023), a detector under 100k parameters built for CPUs."""

    def __init__(self, model_path: Path, max_side: int = 640, threshold: float = 0.6):
        self.name = "yunet"
        self.max_side = max_side
        self.model = cv2.FaceDetectorYN.create(
            str(model_path), "", (320, 320), score_threshold=threshold, top_k=5000
        )

    def detect(self, image: np.ndarray) -> list[Face]:
        small, scale = resize_to_max_side(image, self.max_side)
        self.model.setInputSize((small.shape[1], small.shape[0]))
        _, rows = self.model.detect(small)
        if rows is None:
            return []
        faces = []
        for row in rows:
            x, y, w, h = row[:4]
            box = np.array([x, y, x + w, y + h]) / scale
            landmarks = row[4:14].reshape(5, 2) / scale
            faces.append(Face(box=box, score=float(row[14]), landmarks=landmarks))
        return faces


class HaarDetector:
    """Viola-Jones Haar cascade (2001), the classical baseline. Gives boxes only, no landmarks.

    Contrast is normalised with CLAHE (local histogram equalisation) rather than
    global equalisation, which large uniform regions such as walls distort.
    """

    def __init__(self, max_side: int = 640, min_neighbors: int = 5):
        self.name = "haar"
        self.max_side = max_side
        self.min_neighbors = min_neighbors
        path = cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
        self.model = cv2.CascadeClassifier(path)
        self.clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))

    def detect(self, image: np.ndarray) -> list[Face]:
        small, scale = resize_to_max_side(image, self.max_side)
        gray = self.clahe.apply(cv2.cvtColor(small, cv2.COLOR_BGR2GRAY))
        boxes, _, weights = self.model.detectMultiScale3(
            gray, scaleFactor=1.1, minNeighbors=self.min_neighbors, outputRejectLevels=True
        )
        return [
            Face(box=np.array([x, y, x + w, y + h], dtype=np.float64) / scale, score=float(s))
            for (x, y, w, h), s in zip(boxes, np.ravel(weights), strict=True)
        ]
