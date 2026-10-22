import numpy as np

from quickpic.face import Face
from quickpic.tiling import TiledDetector, iou, nms, tile_starts


def face(x1, y1, x2, y2, score=0.9):
    return Face(box=np.array([x1, y1, x2, y2], dtype=np.float64), score=score)


class WhiteSquareDetector:
    """Stand-in detector: reports the bounding box of all pure-white pixels it is shown."""

    name = "white"

    def detect(self, image):
        ys, xs = np.nonzero(image[:, :, 0] == 255)
        if len(xs) == 0:
            return []
        return [face(xs.min(), ys.min(), xs.max() + 1, ys.max() + 1)]


def canvas_with_square(x, y, size=40):
    image = np.zeros((2000, 3000, 3), np.uint8)
    image[y : y + size, x : x + size] = 255
    return image


def test_tile_starts_cover_the_whole_length():
    starts = tile_starts(4000, 1280, 960)

    assert starts == [0, 960, 1920, 2720]
    assert starts[-1] + 1280 == 4000
    assert tile_starts(500, 1280, 960) == [0]


def test_iou():
    box = np.array([0, 0, 10, 10])
    others = np.array([[0, 0, 10, 10], [5, 0, 15, 10], [20, 20, 30, 30]])

    np.testing.assert_allclose(iou(box, others), [1.0, 50 / 150, 0.0])


def test_nms_keeps_best_of_overlapping_boxes():
    kept = nms([face(0, 0, 10, 10, 0.6), face(1, 0, 11, 10, 0.9), face(50, 50, 60, 60, 0.5)], 0.4)

    assert [f.score for f in kept] == [0.9, 0.5]


def test_tiles_map_boxes_back_to_photo_coordinates():
    faces = TiledDetector(WhiteSquareDetector(), tile=1280).detect(canvas_with_square(1000, 1000))

    assert len(faces) == 1
    np.testing.assert_allclose(faces[0].box, [1000, 1000, 1040, 1040])


def test_face_cut_by_a_tile_edge_is_not_reported_twice():
    # The first tile ends at x = 1280, so it only sees the left 10 pixels of this square.
    faces = TiledDetector(WhiteSquareDetector(), tile=1280).detect(canvas_with_square(1270, 300))

    assert len(faces) == 1
    np.testing.assert_allclose(faces[0].box, [1270, 300, 1310, 340])
