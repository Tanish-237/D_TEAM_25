"""The signed-in user's profile, password and account deletion (students and teachers)."""

from django.contrib.auth import logout, update_session_auth_hash
from ninja import Router, Schema
from ninja.errors import HttpError

from attendance.api.common import (
    as_user,
    check_password_rules,
    delete_photos,
    face_status,
    percent,
)
from attendance.models import Attendance, ClassSession, User

router = Router()


class ProfileIn(Schema):
    first_name: str
    last_name: str = ""
    roll_no: str = ""


class PasswordIn(Schema):
    current: str
    new: str


class DeleteAccountIn(Schema):
    password: str


@router.get("/profile")
def profile(request):
    """The profile card: who the user is and a few totals for their role."""
    user = request.user
    if user.is_teacher:
        stats = {
            "courses": user.courses_taught.count(),
            "students": User.objects.filter(courses__teacher=user).distinct().count(),
            "lectures": ClassSession.objects.filter(
                course__teacher=user, status=ClassSession.Status.CONFIRMED
            ).count(),
        }
    else:
        records = Attendance.objects.filter(student=user, session__course__students=user)
        attended = records.filter(present=True).count()
        stats = {
            "courses": user.courses.count(),
            "attended": attended,
            "lectures": records.count(),
            "percent": percent(attended, records.count()),
        }
    return {
        "user": as_user(user),
        "joined": user.date_joined.isoformat(),
        "face": None if user.is_teacher else face_status(user),
        "stats": stats,
    }


@router.patch("/profile")
def update_profile(request, data: ProfileIn):
    user = request.user
    if not data.first_name.strip():
        raise HttpError(400, "Your first name cannot be empty.")
    if not user.is_teacher and not data.roll_no.strip():
        raise HttpError(400, "Students need a roll number.")
    user.first_name = data.first_name.strip()
    user.last_name = data.last_name.strip()
    if not user.is_teacher:
        user.roll_no = data.roll_no.strip()
    user.save(update_fields=["first_name", "last_name", "roll_no"])
    return {"user": as_user(user)}


@router.post("/password")
def change_password(request, data: PasswordIn):
    user = request.user
    if not user.check_password(data.current):
        raise HttpError(400, "Your current password is not correct.")
    check_password_rules(data.new, user)
    user.set_password(data.new)
    user.save(update_fields=["password"])
    update_session_auth_hash(request, user)
    return {"ok": True}


@router.post("/delete")
def delete_account(request, data: DeleteAccountIn):
    """Deletes the account with its face data, attendance and (for teachers) courses."""
    user = request.user
    if not user.check_password(data.password):
        raise HttpError(400, "Your password is not correct.")
    delete_photos(ClassSession.objects.filter(course__teacher=user))
    logout(request)
    user.delete()
    return {"ok": True}
