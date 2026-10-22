"""Labelling tool for class photos: produces the answer key used in evaluation.

    uv run python tools/label_faces.py --data PATH/TO/data/class

Expects <data>/photos/ and optionally <data>/students.csv (roll_no,name).
Serves a page on http://127.0.0.1:8765, reachable from this computer only.

Faces are detected once per photo with tiled SCRFD at a low threshold, so as
few faces as possible are missed, and the boxes are frozen in the label file.
Each face is tagged with a roll number, left as unknown, or marked as not a
face. Faces the detector missed are marked by clicking the photo.
Labels are written to <data>/labels/<photo name>.json.
"""

import argparse
import csv
import json
import re
import webbrowser
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

import cv2
import numpy as np

from quickpic.detect import ScrfdDetector
from quickpic.imageio import list_images, load_image, resize_to_max_side
from quickpic.tiling import TiledDetector
from quickpic.zoo import MODELS_DIR

HOST, PORT = "127.0.0.1", 8765
PAGE = Path(__file__).with_name("label_faces.html")
DETECTION_THRESHOLD = 0.3


class Labeller:
    def __init__(self, data: Path):
        self.photos = list_images(data / "photos")
        if not self.photos:
            raise SystemExit(f"No images in {data / 'photos'}")
        self.labels_dir = data / "labels"
        self.labels_dir.mkdir(exist_ok=True)
        self.students = read_students(data / "students.csv")
        self._detector = None
        self._images: dict[int, np.ndarray] = {}

    @property
    def detector(self) -> TiledDetector:
        if self._detector is None:
            base = ScrfdDetector(
                MODELS_DIR / "insightface/buffalo_l/det_10g.onnx",
                "scrfd_10g",
                threshold=DETECTION_THRESHOLD,
            )
            self._detector = TiledDetector(base)
        return self._detector

    def label_path(self, index: int) -> Path:
        return self.labels_dir / f"{self.photos[index].name}.json"

    def image(self, index: int) -> np.ndarray:
        if index not in self._images:
            if len(self._images) >= 2:
                self._images.pop(next(iter(self._images)))
            self._images[index] = load_image(self.photos[index])
        return self._images[index]

    def labels(self, index: int) -> dict:
        path = self.label_path(index)
        if path.exists():
            return json.loads(path.read_text())
        image = self.image(index)
        faces = reading_order(self.detector.detect(image))
        labels = {
            "photo": self.photos[index].name,
            "size": [image.shape[1], image.shape[0]],
            "detector": f"{self.detector.name}@{DETECTION_THRESHOLD}",
            "reviewed": False,
            "faces": [
                {
                    "box": [round(float(v), 1) for v in f.box],
                    "landmarks": np.round(f.landmarks, 1).tolist(),
                    "score": round(f.score, 3),
                    "label": "unknown",
                }
                for f in faces
            ],
            "missed": [],
        }
        write_json(path, labels)
        return labels

    def save(self, index: int, update: dict) -> None:
        labels = self.labels(index)
        if len(update["faces"]) != len(labels["faces"]):
            raise ValueError("face count changed")
        for face, label in zip(labels["faces"], update["faces"], strict=True):
            face["label"] = label
        labels["missed"] = update["missed"]
        labels["reviewed"] = True
        write_json(self.label_path(index), labels)

    def overview_jpeg(self, index: int) -> bytes:
        small, _ = resize_to_max_side(self.image(index), 1800)
        return encode_jpeg(small)

    def crop_jpeg(self, index: int, face_index: int) -> bytes:
        x1, y1, x2, y2 = self.labels(index)["faces"][face_index]["box"]
        image = self.image(index)
        cx, cy, half = (x1 + x2) / 2, (y1 + y2) / 2, 0.8 * max(x2 - x1, y2 - y1)
        top, bottom = max(int(cy - half), 0), min(int(cy + half), image.shape[0])
        left, right = max(int(cx - half), 0), min(int(cx + half), image.shape[1])
        crop = image[top:bottom, left:right]
        return encode_jpeg(cv2.resize(crop, (176, round(176 * crop.shape[0] / crop.shape[1]))))


def reading_order(faces):
    """Sorts faces row by row, top to bottom, then left to right, as a person reads the photo."""
    if not faces:
        return []
    row_height = float(np.median([f.height for f in faces]))
    return sorted(faces, key=lambda f: (round(f.box[1] / row_height), f.box[0]))


def read_students(path: Path) -> list[dict]:
    if not path.exists():
        return []
    with path.open(newline="", encoding="utf-8") as file:
        return [
            {"roll": r["roll_no"].strip(), "name": r["name"].strip()} for r in csv.DictReader(file)
        ]


def write_json(path: Path, data: dict) -> None:
    temporary = path.with_suffix(".tmp")
    temporary.write_text(json.dumps(data, indent=1))
    temporary.replace(path)


def encode_jpeg(image: np.ndarray) -> bytes:
    return cv2.imencode(".jpg", image, [cv2.IMWRITE_JPEG_QUALITY, 88])[1].tobytes()


def make_handler(labeller: Labeller):
    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            try:
                self.route_get()
            except IndexError:
                self.send_error(HTTPStatus.NOT_FOUND)

        def do_POST(self):
            try:
                self.route_post()
            except IndexError:
                self.send_error(HTTPStatus.NOT_FOUND)
            except (ValueError, KeyError) as error:
                self.send_error(HTTPStatus.BAD_REQUEST, str(error))

        def route_get(self):
            if self.path == "/":
                return self.reply(PAGE.read_bytes(), "text/html; charset=utf-8")
            if self.path == "/api/state":
                photos = [
                    {"id": i, "name": p.name, "reviewed": self.reviewed(i)}
                    for i, p in enumerate(labeller.photos)
                ]
                return self.reply_json({"photos": photos, "students": labeller.students})
            if match := re.fullmatch(r"/api/photo/(\d+)", self.path):
                return self.reply_json(labeller.labels(self.photo_index(match)))
            if match := re.fullmatch(r"/overview/(\d+)\.jpg", self.path):
                return self.reply(labeller.overview_jpeg(self.photo_index(match)), "image/jpeg")
            if match := re.fullmatch(r"/crop/(\d+)/(\d+)\.jpg", self.path):
                jpeg = labeller.crop_jpeg(self.photo_index(match), int(match[2]))
                return self.reply(jpeg, "image/jpeg")
            self.send_error(HTTPStatus.NOT_FOUND)

        def route_post(self):
            match = re.fullmatch(r"/api/photo/(\d+)", self.path)
            if not match:
                return self.send_error(HTTPStatus.NOT_FOUND)
            body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
            labeller.save(self.photo_index(match), body)
            self.reply_json({"saved": True})

        def photo_index(self, match) -> int:
            index = int(match[1])
            if index >= len(labeller.photos):
                raise IndexError(index)
            return index

        def reviewed(self, index: int) -> bool:
            path = labeller.label_path(index)
            return path.exists() and json.loads(path.read_text())["reviewed"]

        def reply_json(self, data) -> None:
            self.reply(json.dumps(data).encode(), "application/json")

        def reply(self, body: bytes, content_type: str) -> None:
            self.send_response(HTTPStatus.OK)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, *args):
            pass

    return Handler


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--data", type=Path, required=True, help="folder containing photos/")
    parser.add_argument("--no-browser", action="store_true")
    args = parser.parse_args()

    labeller = Labeller(args.data)
    server = HTTPServer((HOST, PORT), make_handler(labeller))
    url = f"http://{HOST}:{PORT}"
    print(f"{len(labeller.photos)} photos, {len(labeller.students)} students. Open {url}")
    print("The first visit to each photo runs detection, which takes a few seconds. Ctrl+C stops.")
    if not args.no_browser:
        webbrowser.open(url)
    server.serve_forever()


if __name__ == "__main__":
    main()
