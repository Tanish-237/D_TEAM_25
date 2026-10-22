"""Builds detectors and embedders by name, so experiments pick models from config strings."""

import os
from pathlib import Path

from quickpic.detect import Detector, HaarDetector, ScrfdDetector, YuNetDetector
from quickpic.embed import ArcFaceEmbedder, Embedder, LbpEmbedder, SFaceEmbedder

MODELS_DIR = Path(os.environ.get("QUICKPIC_MODELS", Path(__file__).resolve().parents[2] / "models"))

DETECTORS = ("scrfd_10g", "scrfd_500m", "yunet", "haar")
EMBEDDERS = ("arcface_r50", "arcface_mbf", "sface", "lbp")


def load_detector(name: str, max_side: int = 640) -> Detector:
    match name:
        case "scrfd_10g":
            return ScrfdDetector(MODELS_DIR / "insightface/buffalo_l/det_10g.onnx", name, max_side)
        case "scrfd_500m":
            return ScrfdDetector(MODELS_DIR / "insightface/buffalo_s/det_500m.onnx", name, max_side)
        case "yunet":
            return YuNetDetector(MODELS_DIR / "opencv/face_detection_yunet_2023mar.onnx", max_side)
        case "haar":
            return HaarDetector(max_side)
    raise ValueError(f"Unknown detector {name!r}; choose from {DETECTORS}")


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
