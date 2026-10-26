"""Bridge between the web app and the recognition engine in src/quickpic.

The models load once per server process, on first use (a few seconds).
"""

import time
from dataclasses import dataclass
from functools import cache

import cv2
import numpy as np
from django.conf import settings
from django.core.files.base import ContentFile
from django.db import transaction

from attendance.models import Attendance, ClassSession, DetectedFace, FaceData, User
from quickpic.align import align
from quickpic.degrade import degraded_copies
from quickpic.imageio import load_image
from quickpic.match import UNKNOWN, Gallery
from quickpic.pipeline import Config, QuickPic
from quickpic.quality import brightness, sharpness, yaw


@cache
def system() -> QuickPic:
    return QuickPic(
        Config(calibration=settings.QUICKPIC_CALIBRATOR, threshold=settings.QUICKPIC_THRESHOLD)
    )


@dataclass(frozen=True)
class Step:
    key: str
    title: str
    instruction: str


ENROLLMENT_STEPS = [
    Step("front", "Facing the camera", "Look straight at the camera with a neutral expression."),
    Step("left", "Turned to one side", "Turn your head about 30° to one side, eyes still visible."),
    Step("right", "Turned to the other side", "Turn your head about 30° to the other side."),
    Step(
        "light", "Different lighting", "Any pose, in a different room or light, e.g. near a window."
    ),
]

MIN_FACE_HEIGHT = 120
MIN_SHARPNESS = 15
BRIGHTNESS_RANGE = (45, 215)
FRONTAL_YAW = 0.15
SIDE_YAW = (0.12, 0.8)


@dataclass
class PhotoCheck:
    step: Step
    ok: bool
    message: str
    yaw: float = 0.0
    crop: np.ndarray | None = None


def check_enrollment_photo(image: np.ndarray, step: Step) -> PhotoCheck:
    """Rejects a registration photo with a specific reason, or accepts it with its aligned crop."""
    faces = system().enroll_detector.detect(image)
    if not faces:
        return PhotoCheck(step, False, "No face found. Make sure your whole face is in the photo.")
    if len(faces) > 1:
        heights = sorted((f.height for f in faces), reverse=True)
        if heights[1] > 0.5 * heights[0]:
            return PhotoCheck(
                step, False, "More than one face. Take the photo with only you in it."
            )
    face = max(faces, key=lambda f: f.height)
    if face.height < MIN_FACE_HEIGHT:
        return PhotoCheck(step, False, "Your face is too small. Hold the camera closer.")
    crop = align(image, face)
    if sharpness(crop) < MIN_SHARPNESS:
        return PhotoCheck(step, False, "The photo is blurred. Hold the camera still and retake it.")
    level = brightness(crop)
    if not BRIGHTNESS_RANGE[0] <= level <= BRIGHTNESS_RANGE[1]:
        word = "dark" if level < BRIGHTNESS_RANGE[0] else "bright"
        return PhotoCheck(step, False, f"Your face is too {word}. Move to more even light.")
    turn = yaw(face.landmarks)
    if step.key == "front" and abs(turn) > FRONTAL_YAW:
        return PhotoCheck(step, False, "Please face the camera directly.", turn)
    if step.key in ("left", "right") and not SIDE_YAW[0] <= abs(turn) <= SIDE_YAW[1]:
        hint = "a little more" if abs(turn) < SIDE_YAW[0] else "a little less"
        return PhotoCheck(step, False, f"Turn your head {hint}.", turn)
    return PhotoCheck(step, True, "Looks good.", turn, crop)


def check_side_photos(checks: list[PhotoCheck]) -> list[PhotoCheck]:
    """The two side photos must be turned in opposite directions."""
    sides = {c.step.key: c for c in checks if c.step.key in ("left", "right") and c.ok}
    if len(sides) == 2 and np.sign(sides["left"].yaw) == np.sign(sides["right"].yaw):
        sides["right"].ok = False
        sides["right"].message = "Turn to the opposite side from the previous photo."
    return checks


def save_face_data(student: User, crops: list[np.ndarray]) -> FaceData:
    """Embeds the accepted crops plus their degraded copies; the photos themselves are discarded."""
    engine = system()
    copies = [c for crop in crops for c in degraded_copies(crop)]
    vectors = engine.embedder.embed(copies).astype(np.float32)
    data, _ = FaceData.objects.update_or_create(
        student=student,
        defaults={
            "embedder": engine.config.embedder,
            "vectors": vectors.tobytes(),
            "dim": vectors.shape[1],
            "photos_used": len(crops),
        },
    )
    return data


@transaction.atomic
def process_session(session: ClassSession) -> None:
    """Detects every face in the class photo and proposes a student or unknown for each."""
    engine = system()
    start = time.perf_counter()
    image = load_image(session.photo.path)
    store_upright_jpeg(session, image)
    students = list(session.course.students.filter(face_data__isnull=False))
    gallery_dict = {s.pk: s.face_data.array() for s in students}
    faces = engine.detect(image)
    if gallery_dict:
        gallery = Gallery.from_dict(gallery_dict)
        result = engine.decide(faces, gallery, engine.config.threshold)
        best = result.scores.max(axis=1) if len(faces) else np.empty(0)
        decisions, ids = result.decisions, gallery.ids
    else:
        best, decisions, ids = np.zeros(len(faces)), np.full(len(faces), UNKNOWN), []

    by_id = {s.pk: s for s in students}
    session.faces.all().delete()
    for n, original in enumerate(reading_order(faces)):
        box = faces[original].face.box
        decision = decisions[original]
        DetectedFace.objects.create(
            session=session,
            index=n,
            box=[round(float(v)) for v in box],
            crop=context_crop(image, box),
            score=float(best[original]) if len(best) else 0.0,
            proposed=by_id[ids[decision]] if decision != UNKNOWN else None,
        )
    session.seconds = time.perf_counter() - start
    session.save(update_fields=["seconds"])


def store_upright_jpeg(session: ClassSession, image: np.ndarray) -> None:
    """Replaces the upload (maybe HEIC or rotated by EXIF) with an upright JPEG for the browser."""
    jpeg = cv2.imencode(".jpg", image, [cv2.IMWRITE_JPEG_QUALITY, 88])[1].tobytes()
    session.photo.delete(save=False)
    session.photo.save(f"session-{session.pk}.jpg", ContentFile(jpeg), save=False)
    session.save(update_fields=["photo"])


def reading_order(faces) -> list[int]:
    """Face indices row by row, top to bottom, then left to right."""
    if not faces:
        return []
    row = float(np.median([f.height for f in faces]))
    boxes = [f.face.box for f in faces]
    return sorted(range(len(faces)), key=lambda i: (round(boxes[i][1] / row), boxes[i][0]))


def context_crop(image: np.ndarray, box, size: int = 160) -> bytes:
    x1, y1, x2, y2 = box
    cx, cy, half = (x1 + x2) / 2, (y1 + y2) / 2, 0.8 * max(x2 - x1, y2 - y1)
    top, bottom = max(int(cy - half), 0), min(int(cy + half), image.shape[0])
    left, right = max(int(cx - half), 0), min(int(cx + half), image.shape[1])
    crop = cv2.resize(image[top:bottom, left:right], (size, size))
    return cv2.imencode(".jpg", crop, [cv2.IMWRITE_JPEG_QUALITY, 85])[1].tobytes()


@transaction.atomic
def confirm_session(session: ClassSession, present_ids: set[int]) -> None:
    """Stores attendance for every enrolled student, then deletes the photo and face crops."""
    for student in session.course.students.all():
        Attendance.objects.update_or_create(
            session=session, student=student, defaults={"present": student.pk in present_ids}
        )
    session.faces.all().delete()
    if session.photo:
        session.photo.delete(save=False)
    session.status = ClassSession.Status.CONFIRMED
    session.save()
