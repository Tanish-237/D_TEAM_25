"""Builds detectors and embedders by name, so experiments pick models from config strings."""

import os
from pathlib import Path

from quickpic.detect import Detector, HaarDetector, ScrfdDetector, YuNetDetector
from quickpic.embed import ArcFaceEmbedder, Embedder, LbpEmbedder, SFaceEmbedder
from quickpic.tiling import TiledDetector

MODELS_DIR = Path(os.environ.get("QUICKPIC_MODELS", Path(__file__).resolve().parents[2] / "models"))

DETECTORS = ("scrfd_10g", "scrfd_500m", "yunet", "haar")
EMBEDDERS = ("arcface_r50", "arcface_mbf", "sface", "lbp")


def load_detector(name: str, max_side: int = 640, tiles: bool = False) -> Detector:
    """Builds a detector by name. With tiles=True it is wrapped in TiledDetector (component T)."""
    match name:
        case "scrfd_10g":
            base = ScrfdDetector(MODELS_DIR / "insightface/buffalo_l/det_10g.onnx", name, max_side)
        case "scrfd_500m":
            base = ScrfdDetector(MODELS_DIR / "insightface/buffalo_s/det_500m.onnx", name, max_side)
        case "yunet":
            base = YuNetDetector(MODELS_DIR / "opencv/face_detection_yunet_2023mar.onnx", max_side)
        case "haar":
            base = HaarDetector(max_side)
        case _:
            raise ValueError(f"Unknown detector {name!r}; choose from {DETECTORS}")
    return TiledDetector(base, tile=2 * max_side) if tiles else base


def load_embedder(name: str) -> Embedder:
    match name:
        case "arcface_r50":
            return ArcFaceEmbedder(MODELS_DIR / "insightface/buffalo_l/w600k_r50.onnx", name)
        case "arcface_mbf":
            return ArcFaceEmbedder(MODELS_DIR / "insightface/buffalo_s/w600k_mbf.onnx", name)
        case "sface":
            return SFaceEmbedder(MODELS_DIR / "opencv/face_recognition_sface_2021dec.onnx")
        case "lbp":
            return LbpEmbedder()
    raise ValueError(f"Unknown embedder {name!r}; choose from {EMBEDDERS}")
