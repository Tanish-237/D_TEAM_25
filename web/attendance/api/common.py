"""Serialisers, permission checks and validation shared by the API modules."""

from collections.abc import Iterable

from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.shortcuts import get_object_or_404
from ninja.errors import HttpError
from ninja.files import UploadedFile
from ninja.utils import check_csrf

from attendance.models import ClassSession, Course, FaceData, User
from quickpic.imageio import load_image


def as_user(user: User) -> dict:
    return {
        "id": user.pk,
        "username": user.username,
        "first_name": user.first_name,
        "last_name": user.last_name,
        "name": user.get_full_name() or user.username,
        "roll_no": user.roll_no,
        "role": user.role,
    }


def as_course(course: Course) -> dict:
    return {
        "id": course.pk,
        "subject": course.subject,
        "year": course.year,
        "semester": course.semester,
        "code": course.code,
        "teacher": course.teacher.get_full_name() or course.teacher.username,
    }


def face_status(user: User) -> dict | None:
    data = FaceData.objects.filter(student=user).first()
    if data is None:
        return None
    return {
        "photos_used": data.photos_used,
        "templates": len(data.vectors) // (4 * data.dim),
        "embedder": data.embedder,
        "updated": data.updated.isoformat(),
    }


def percent(part: int, whole: int) -> float | None:
    return round(100 * part / whole, 1) if whole else None


def require_csrf(request) -> None:
    """Login and signup run without a session, so they check the CSRF token themselves."""
    if check_csrf(request) is not None:
        raise HttpError(403, "Reload the page and try again.")


def require_teacher(request) -> User:
    if not request.user.is_teacher:
        raise HttpError(403, "Only teachers can do this.")
    return request.user


def own_course(request, course_id: int) -> Course:
    return get_object_or_404(Course, pk=course_id, teacher=require_teacher(request))


def own_session(request, session_id: int) -> ClassSession:
    return get_object_or_404(ClassSession, pk=session_id, course__teacher=require_teacher(request))


def check_password_rules(password: str, user: User) -> None:
    try:
        validate_password(password, user)
    except ValidationError as error:
        raise HttpError(400, " ".join(error.messages)) from error


def read_upload(upload: UploadedFile):
    try:
        return load_image(upload)
    except Exception as error:
        raise HttpError(400, "This file is not an image we can read.") from error


def delete_photos(sessions: Iterable[ClassSession]) -> None:
    """Removes class photos from disk; deleting database rows alone would leave the files."""
    for session in sessions:
        if session.photo:
            session.photo.delete(save=False)
