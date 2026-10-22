"""Face embedders behind one interface: aligned 112x112 crops in, unit vectors out.

Because every embedding is L2-normalised, comparing two faces is a dot product
(cosine similarity): about 1 for the same person, near 0 for unrelated people.
"""

from pathlib import Path
from typing import Protocol

import cv2
import numpy as np
import onnxruntime
from insightface.model_zoo import get_model
from skimage.feature import local_binary_pattern

from quickpic.detect import device_id

# The ArcFace ONNX files declare batch size 1 but run batches fine; hide that warning.
onnxruntime.set_default_logger_severity(3)


class Embedder(Protocol):
    name: str
    dim: int

    def embed(self, crops: list[np.ndarray]) -> np.ndarray: ...


def normalise(vectors: np.ndarray) -> np.ndarray:
    norms = np.linalg.norm(vectors, axis=1, keepdims=True)
    return vectors / np.maximum(norms, 1e-12)


class ArcFaceEmbedder:
    """ArcFace-trained CNN (Deng et al., CVPR 2019), 512-dimensional."""

    def __init__(self, model_path: Path, name: str, providers: list[str] | None = None):
        self.name = name
        self.dim = 512
        providers = providers or ["CPUExecutionProvider"]
        self.model = get_model(str(model_path), providers=providers)
        self.model.prepare(device_id(providers))

    def embed(self, crops: list[np.ndarray]) -> np.ndarray:
        if not crops:
            return np.empty((0, self.dim), dtype=np.float32)
        return normalise(self.model.get_feat(crops))


class SFaceEmbedder:
    """SFace (Zhong et al., IEEE TIP 2021), a MobileFaceNet, 128-dimensional, Apache-2.0."""

    def __init__(self, model_path: Path):
        self.name = "sface"
        self.dim = 128
        self.model = cv2.FaceRecognizerSF.create(str(model_path), "")

    def embed(self, crops: list[np.ndarray]) -> np.ndarray:
        if not crops:
            return np.empty((0, self.dim), dtype=np.float32)
        return normalise(np.vstack([self.model.feature(crop) for crop in crops]))


class LbpEmbedder:
    """Local binary pattern histograms (Ahonen et al., TPAMI 2006), the classical baseline.

    Each pixel is coded by which of its 8 neighbours are brighter than it, the
    codes are histogrammed in a 7x7 grid of cells, and the cell histograms are
    concatenated. Square-rooting the histograms before normalising makes the
    dot product behave like the histogram-distance measures used for LBP.
    """

    def __init__(self, grid: int = 7, points: int = 8, radius: int = 1):
        self.name = "lbp"
        self.grid = grid
        self.points = points
        self.radius = radius
        self.bins = points + 2
        self.dim = grid * grid * self.bins

    def embed(self, crops: list[np.ndarray]) -> np.ndarray:
        if not crops:
            return np.empty((0, self.dim), dtype=np.float32)
        return normalise(np.vstack([self._histogram(crop) for crop in crops]))

    def _histogram(self, crop: np.ndarray) -> np.ndarray:
        gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)
        codes = local_binary_pattern(gray, self.points, self.radius, method="uniform")
        cells = []
        for rows in np.array_split(codes, self.grid, axis=0):
            for cell in np.array_split(rows, self.grid, axis=1):
                hist, _ = np.histogram(cell, bins=self.bins, range=(0, self.bins))
                cells.append(hist / max(cell.size, 1))
        return np.sqrt(np.concatenate(cells))[None, :]
