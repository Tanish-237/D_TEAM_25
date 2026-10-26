"""Evaluation on our own class photographs: the ablation and embedder comparison.

Ground truth comes from tools/label_faces.py. A detected face takes the label
of the labelled box it overlaps (IoU >= 0.4); detections matching no labelled
face, and boxes labelled "not a face", must be rejected as unknown.

The decision threshold is never tuned on the photo being scored: for each
photo it is chosen to maximise attendance F1 on the other nine photos
(leave-one-photo-out). Photo-level 95% intervals come from 2,000 bootstrap
resamples of the ten photos.

Only aggregate numbers are printed and saved; no image or name leaves the machine.

    uv run python -m experiments.class_eval --data data/class
    uv run python -m experiments.class_eval --data data/class \\
        --calibrator experiments/results/calibrator_arcface_r50.json
"""

import argparse
import json
from dataclasses import replace
from pathlib import Path

import numpy as np

from experiments.common import save_results
from quickpic.imageio import list_images, load_image
from quickpic.match import UNKNOWN, Gallery
from quickpic.metrics import attendance
from quickpic.pipeline import Config, DetectedFace, QuickPic
from quickpic.tiling import iou

MATCH_IOU = 0.4
RAW_THRESHOLDS = np.round(np.arange(0.05, 0.75, 0.01), 2)
PROBABILITY_THRESHOLDS = np.round(np.arange(0.02, 0.99, 0.01), 2)


def load_ground_truth(labels_dir: Path) -> dict[str, dict]:
    truth = {}
    for path in sorted(labels_dir.glob("*.json")):
        data = json.loads(path.read_text())
        truth[data["photo"]] = {
            "boxes": np.array([f["box"] for f in data["faces"]]),
            "labels": [f["label"] for f in data["faces"]],
            "missed": len(data["missed"]),
        }
    return truth


def face_truth(faces: list[DetectedFace], truth: dict, students: list[str]) -> np.ndarray:
    """The correct student index for each detected face, or UNKNOWN."""
    result = np.full(len(faces), UNKNOWN)
    for n, face in enumerate(faces):
        overlaps = iou(face.face.box, truth["boxes"])
        best = int(np.argmax(overlaps))
        label = truth["labels"][best]
        if overlaps[best] >= MATCH_IOU and label in students:
            result[n] = students.index(label)
    return result


def present_in_photo(truth: dict, students: list[str]) -> set[str]:
    return {label for label in truth["labels"] if label in students}


def score_photos(system, photos, gallery, threshold) -> list[dict]:
    rows = []
    for faces, truth, faces_truth in photos:
        result = system.decide(faces, gallery, threshold)
        actual = present_in_photo(truth, gallery.ids)
        row = attendance(result.present(), actual)
        row["tp"] = len(result.present() & actual)
        friend_faces = faces_truth != UNKNOWN
        row["friend_faces"] = sum(label in gallery.ids for label in truth["labels"])
        named = result.decisions[friend_faces] == faces_truth[friend_faces]
        row["friends_named_correctly"] = int(np.sum(named))
        row["unknown_faces_named"] = int(np.sum(result.decisions[~friend_faces] != UNKNOWN))
        rows.append(row)
    return rows


def pooled(rows: list[dict]) -> dict:
    predicted = sum(r["tp"] + r["false_present"] for r in rows)
    actual = sum(r["tp"] + r["missed"] for r in rows)
    tp = sum(r["tp"] for r in rows)
    precision = tp / predicted if predicted else 1.0
    recall = tp / actual if actual else 1.0
    f1 = 2 * precision * recall / (precision + recall) if precision + recall else 0.0
    return {
        "precision": precision,
        "recall": recall,
        "f1": f1,
        "false_present": sum(r["false_present"] for r in rows),
        "missed": sum(r["missed"] for r in rows),
        "edits_per_photo": float(np.mean([r["false_present"] + r["missed"] for r in rows])),
        "friend_faces_named_correctly": sum(r["friends_named_correctly"] for r in rows),
        "friend_faces": sum(r["friend_faces"] for r in rows),
        "unknown_faces_named": sum(r["unknown_faces_named"] for r in rows),
    }


def leave_one_photo_out(system, photos, gallery, thresholds) -> tuple[list[dict], list[float]]:
    rows, chosen = [], []
    for held_out in range(len(photos)):
        others = [p for n, p in enumerate(photos) if n != held_out]
        best = max(
            thresholds,
            key=lambda t: (pooled(score_photos(system, others, gallery, t))["f1"], t),
        )
        rows.extend(score_photos(system, [photos[held_out]], gallery, best))
        chosen.append(float(best))
    return rows, chosen


def bootstrap_f1(rows: list[dict], samples: int = 2000) -> tuple[float, float]:
    rng = np.random.default_rng(0)
    values = [
        pooled([rows[i] for i in rng.integers(0, len(rows), len(rows))])["f1"]
        for _ in range(samples)
    ]
    return float(np.percentile(values, 2.5)), float(np.percentile(values, 97.5))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--data", type=Path, required=True)
    parser.add_argument("--calibrator", type=Path)
    args = parser.parse_args()

    truth = load_ground_truth(args.data / "labels")
    photo_paths = [p for p in list_images(args.data / "photos") if p.name in truth]
    images = {p.name: load_image(p) for p in photo_paths}
    enroll_dirs = sorted(d for d in (args.data / "enroll").iterdir() if d.is_dir())
    enroll_images = {d.name: [load_image(p) for p in list_images(d)] for d in enroll_dirs}
    students = sorted(enroll_images)

    full = Config(calibration=args.calibrator)
    configs = {
        "baseline": replace(
            full, tiles=False, degraded_gallery=False, calibration=None, one_to_one=False
        ),
        "+T": replace(full, degraded_gallery=False, calibration=None, one_to_one=False),
        "+T+D": replace(full, calibration=None, one_to_one=False),
        "+T+D+A": replace(full, calibration=None),
        "full-T": replace(full, tiles=False),
        "full-D": replace(full, degraded_gallery=False),
        "full-A": replace(full, one_to_one=False),
    }
    if args.calibrator:
        configs["+T+D+C"] = replace(full, one_to_one=False)
        configs["full"] = full
    for name in ("arcface_mbf", "sface", "lbp"):
        configs[f"embedder:{name}"] = replace(full, embedder=name, calibration=None)

    detections: dict[tuple, dict] = {}
    galleries: dict[tuple, Gallery] = {}
    results = {}
    for label, config in configs.items():
        system = QuickPic(config)
        key = (config.embedder, config.tiles)
        if key not in detections:
            detections[key] = {name: system.detect(image) for name, image in images.items()}
        gkey = (config.embedder, config.degraded_gallery)
        if gkey not in galleries:
            galleries[gkey] = Gallery.from_dict(
                {s: system.enroll(enroll_images[s]) for s in students}
            )
        gallery = galleries[gkey]
        photos = [
            (
                detections[key][name],
                truth[name],
                face_truth(detections[key][name], truth[name], students),
            )
            for name in images
        ]
        grid = PROBABILITY_THRESHOLDS if config.calibration else RAW_THRESHOLDS
        rows, thresholds = leave_one_photo_out(system, photos, gallery, grid)
        summary = pooled(rows)
        summary["f1_ci95"] = bootstrap_f1(rows)
        summary["thresholds"] = thresholds
        results[label] = summary
        low, high = summary["f1_ci95"]
        print(
            f"{label:20s} F1 {summary['f1']:.3f} [{low:.3f}, {high:.3f}]  "
            f"P {summary['precision']:.3f}  R {summary['recall']:.3f}  "
            f"false-present {summary['false_present']}  missed {summary['missed']}  "
            f"edits/photo {summary['edits_per_photo']:.1f}",
            flush=True,
        )

    config = {
        "photos": len(images),
        "students": len(students),
        "enrollment_photos": sum(len(v) for v in enroll_images.values()),
        "labelled_faces": sum(len(t["labels"]) for t in truth.values()),
        "match_iou": MATCH_IOU,
        "threshold_selection": "leave-one-photo-out, max attendance F1",
        "calibrator": str(args.calibrator) if args.calibrator else None,
    }
    print(save_results("class_eval", config, results))


if __name__ == "__main__":
    main()
