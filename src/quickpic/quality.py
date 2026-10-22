import cv2
import numpy as np


def sharpness(crop: np.ndarray) -> float:
    """Variance of the Laplacian: edges give large second derivatives, blur removes them."""
    gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY) if crop.ndim == 3 else crop
    return float(cv2.Laplacian(gray, cv2.CV_64F).var())


def brightness(crop: np.ndarray) -> float:
    """Mean grey level, 0 (black) to 255 (white)."""
    gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY) if crop.ndim == 3 else crop
    return float(gray.mean())


def yaw(landmarks: np.ndarray) -> float:
    """How far the head is turned sideways, estimated from the five landmarks.

    The nose's horizontal offset from the midpoint between the eyes, divided by
    the distance between the eyes. About 0 when facing the camera, and roughly
    ±0.3 to ±0.5 for a clear sideways turn. The sign says which way the nose
    points in the image, so it flips if the photo is mirrored.
    """
    left_eye, right_eye, nose = landmarks[0], landmarks[1], landmarks[2]
    eye_distance = np.linalg.norm(right_eye - left_eye)
    if eye_distance == 0:
        return 0.0
    return float((nose[0] - (left_eye[0] + right_eye[0]) / 2) / eye_distance)
