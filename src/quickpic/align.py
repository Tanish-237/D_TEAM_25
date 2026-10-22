import cv2
import numpy as np

from quickpic.face import Face

# Where the five landmarks sit in a 112x112 crop; the face networks were trained on crops like this.
ARCFACE_TEMPLATE = np.array(
    [
        [38.2946, 51.6963],
        [73.5318, 51.5014],
        [56.0252, 71.7366],
        [41.5493, 92.3655],
        [70.7299, 92.2041],
    ],
    dtype=np.float64,
)


def similarity_transform(src: np.ndarray, dst: np.ndarray) -> np.ndarray:
    """Least-squares rotation + uniform scale + translation mapping src points onto dst.

    Solves x' = a*x - b*y + tx and y' = b*x + a*y + ty for (a, b, tx, ty),
    where a = s*cos(theta) and b = s*sin(theta). Returns a 2x3 matrix for cv2.warpAffine.
    """
    x, y = src[:, 0], src[:, 1]
    ones, zeros = np.ones_like(x), np.zeros_like(x)
    rows_x = np.stack([x, -y, ones, zeros], axis=1)
    rows_y = np.stack([y, x, zeros, ones], axis=1)
    A = np.concatenate([rows_x, rows_y])
    target = np.concatenate([dst[:, 0], dst[:, 1]])
    a, b, tx, ty = np.linalg.lstsq(A, target, rcond=None)[0]
    return np.array([[a, -b, tx], [b, a, ty]])


def align(image: np.ndarray, face: Face, size: int = 112) -> np.ndarray:
    """Returns a size x size crop with the face's landmarks moved onto the template."""
    if face.landmarks is None:
        return crop_box(image, face.box, size)
    matrix = similarity_transform(face.landmarks.astype(np.float64), ARCFACE_TEMPLATE * size / 112)
    return cv2.warpAffine(image, matrix, (size, size), borderValue=0)


def crop_box(image: np.ndarray, box: np.ndarray, size: int = 112) -> np.ndarray:
    """Square crop around the box centre, for detectors without landmarks."""
    cx, cy = (box[0] + box[2]) / 2, (box[1] + box[3]) / 2
    half = max(box[2] - box[0], box[3] - box[1]) / 2
    scale = size / (2 * half)
    matrix = np.array([[scale, 0, size / 2 - scale * cx], [0, scale, size / 2 - scale * cy]])
    return cv2.warpAffine(image, matrix, (size, size), borderValue=0)
