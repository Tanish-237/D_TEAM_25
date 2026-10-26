"""The full QuickPic pipeline: enrollment photos in, attendance list out.

Every component of the decision layer can be switched off, which is how the
ablation study and the deployed system share one code path.
"""

from dataclasses import dataclass, field
from pathlib import Path

import numpy as np

from quickpic.align import align
from quickpic.assign import assign_one_to_one
from quickpic.calibrate import Calibrator
from quickpic.degrade import degraded_copies
from quickpic.detect import Detector
from quickpic.embed import Embedder
from quickpic.face import Face
from quickpic.match import UNKNOWN, Gallery, decide_independently
from quickpic.quality import sharpness
from quickpic.zoo import load_detector, load_embedder


@dataclass(frozen=True)
class Config:
    detector: str = "scrfd_10g"
    embedder: str = "arcface_r50"
    tiles: bool = True
    degraded_gallery: bool = True
    calibration: Path | None = None
    one_to_one: bool = True
    threshold: float = 0.3


@dataclass
class DetectedFace:
    face: Face
    vector: np.ndarray
    height: float
    sharpness: float


@dataclass
class Result:
    faces: list[DetectedFace]
    scores: np.ndarray
    decisions: np.ndarray
    student_ids: list[str] = field(default_factory=list)

    def present(self) -> set[str]:
        return {self.student_ids[d] for d in self.decisions if d != UNKNOWN}


class QuickPic:
    def __init__(self, config: Config):
        self.config = config
        self.detector: Detector = load_detector(config.detector, tiles=config.tiles)
        self.enroll_detector: Detector = load_detector(config.detector)
        self.embedder: Embedder = load_embedder(config.embedder)
        self.calibrator = Calibrator.load(config.calibration) if config.calibration else None

    def enroll(self, photos: list[np.ndarray]) -> np.ndarray:
        """Embeddings for one student: the largest face in each photo, plus degraded copies (D)."""
        crops = []
        for image in photos:
            faces = self.enroll_detector.detect(image)
            if not faces:
                continue
            crop = align(image, max(faces, key=lambda f: f.height))
            crops.extend(degraded_copies(crop) if self.config.degraded_gallery else [crop])
        return self.embedder.embed(crops)

    def detect(self, photo: np.ndarray) -> list[DetectedFace]:
        faces = self.detector.detect(photo)
        crops = [align(photo, f) for f in faces]
        vectors = self.embedder.embed(crops)
        return [
            DetectedFace(face=f, vector=v, height=f.height, sharpness=sharpness(c))
            for f, v, c in zip(faces, vectors, crops, strict=True)
        ]

    def decide(self, faces: list[DetectedFace], gallery: Gallery, threshold: float) -> Result:
        """Scores every face against every student and applies C and A if enabled."""
        if not faces:
            empty = np.empty((0, len(gallery.ids)))
            return Result(faces, empty, np.empty(0, int), gallery.ids)
        scores = gallery.scores(np.vstack([f.vector for f in faces]))
        if self.calibrator is not None:
            heights = np.array([f.height for f in faces])
            sharp = np.array([f.sharpness for f in faces])
            scores = self.calibrator.probability(scores, heights, sharp)
        decide = assign_one_to_one if self.config.one_to_one else decide_independently
        return Result(faces, scores, decide(scores, threshold), gallery.ids)

    def recognise(self, photo: np.ndarray, gallery: Gallery) -> Result:
        return self.decide(self.detect(photo), gallery, self.config.threshold)
