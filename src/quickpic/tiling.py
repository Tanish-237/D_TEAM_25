"""Tiled detection: our component T.

A detector shrinks the whole photo to its input size, so in a 4000-pixel group
photo a 40-pixel face becomes about 6 pixels and is missed. Here the photo is
cut into overlapping tiles, each tile is detected separately (so it is shrunk
far less), one extra pass over the whole photo catches faces larger than a
tile, and duplicate boxes are merged with non-maximum suppression.
"""

import numpy as np

from quickpic.detect import Detector
from quickpic.face import Face


def tile_starts(length: int, tile: int, stride: int) -> list[int]:
    """Tile start offsets covering [0, length); the last tile ends flush with the edge."""
    if length <= tile:
        return [0]
    starts = list(range(0, length - tile, stride))
    return [*starts, length - tile]


def iou(box: np.ndarray, others: np.ndarray) -> np.ndarray:
    """Intersection over union of one box with each row of `others`."""
    x1 = np.maximum(box[0], others[:, 0])
    y1 = np.maximum(box[1], others[:, 1])
    x2 = np.minimum(box[2], others[:, 2])
    y2 = np.minimum(box[3], others[:, 3])
    inter = np.clip(x2 - x1, 0, None) * np.clip(y2 - y1, 0, None)
    area = (box[2] - box[0]) * (box[3] - box[1])
    areas = (others[:, 2] - others[:, 0]) * (others[:, 3] - others[:, 1])
    return inter / (area + areas - inter)


def nms(faces: list[Face], threshold: float) -> list[Face]:
    """Keeps the best-scoring face, drops others overlapping it by more than threshold, repeats."""
    remaining = sorted(faces, key=lambda f: f.score, reverse=True)
    kept = []
    while remaining:
        best, rest = remaining[0], remaining[1:]
        kept.append(best)
        if not rest:
            break
        overlaps = iou(best.box, np.array([f.box for f in rest]))
        remaining = [f for f, o in zip(rest, overlaps, strict=True) if o <= threshold]
    return kept


class TiledDetector:
    def __init__(
        self,
        base: Detector,
        tile: int = 1280,
        overlap: float = 0.25,
        nms_threshold: float = 0.4,
        edge_margin: int = 2,
    ):
        self.name = f"{base.name}+tiles"
        self.base = base
        self.tile = tile
        self.stride = int(tile * (1 - overlap))
        self.nms_threshold = nms_threshold
        self.edge_margin = edge_margin

    def detect(self, image: np.ndarray) -> list[Face]:
        height, width = image.shape[:2]
        faces = self.base.detect(image)
        if max(height, width) > self.tile:
            for y in tile_starts(height, self.tile, self.stride):
                for x in tile_starts(width, self.tile, self.stride):
                    crop = image[y : y + self.tile, x : x + self.tile]
                    for face in self.base.detect(crop):
                        if not self._cut_by_tile_edge(face, x, y, crop.shape, image.shape):
                            faces.append(shift(face, x, y))
        return nms(faces, self.nms_threshold)

    def _cut_by_tile_edge(self, face: Face, x: int, y: int, crop_shape, image_shape) -> bool:
        """True if the box touches a tile edge that lies inside the photo.

        Such a face is probably cut in half. Because tiles overlap, the whole
        face also appears in a neighbouring tile, so the half box is dropped.
        """
        x1, y1, x2, y2 = face.box
        h, w = crop_shape[:2]
        m = self.edge_margin
        return bool(
            (x1 <= m and x > 0)
            or (y1 <= m and y > 0)
            or (x2 >= w - m and x + w < image_shape[1])
            or (y2 >= h - m and y + h < image_shape[0])
        )


def shift(face: Face, dx: float, dy: float) -> Face:
    offset = np.array([dx, dy])
    landmarks = None if face.landmarks is None else face.landmarks + offset
    return Face(box=face.box + np.tile(offset, 2), score=face.score, landmarks=landmarks)
