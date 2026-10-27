"""Sign-up, login and logout. These run without a session, so they check CSRF explicitly."""

from django.conf import settings
from django.contrib.auth import authenticate, login, logout
from django.middleware.csrf import get_token
from ninja import Router, Schema
from ninja.errors import HttpError

from attendance.api.common import as_user, check_password_rules, require_csrf
from attendance.models import User

router = Router(auth=None)


class LoginIn(Schema):
    username: str
    password: str


class SignupIn(Schema):
    username: str
    password: str
    first_name: str = ""
    last_name: str = ""
    roll_no: str = ""
    teacher_code: str = ""


@router.get("/csrf")
def csrf(request):
    return {"token": get_token(request)}


@router.get("/me")
def me(request):
    return {"user": as_user(request.user) if request.user.is_authenticated else None}


@router.post("/login")
def do_login(request, data: LoginIn):
    require_csrf(request)
    user = authenticate(request, username=data.username.strip(), password=data.password)
    if user is None:
        raise HttpError(400, "Wrong username or password.")
    login(request, user)
    return {"user": as_user(user)}


@router.post("/logout")
def do_logout(request):
    require_csrf(request)
    logout(request)
    return {"ok": True}


@router.post("/signup")
def signup(request, data: SignupIn):
    """Students give a roll number; teachers give the teacher code instead."""
    require_csrf(request)
    username = data.username.strip().lower()
    if not username or not username.replace("_", "").replace(".", "").isalnum():
        raise HttpError(400, "Choose a username of letters, digits, dots or underscores.")
    if User.objects.filter(username=username).exists():
        raise HttpError(400, "This username is taken.")
    teacher = bool(data.teacher_code)
    if teacher and data.teacher_code != settings.TEACHER_SIGNUP_CODE:
        raise HttpError(400, "This teacher code is not correct.")
    if not teacher and not data.roll_no.strip():
        raise HttpError(400, "Students need a roll number.")
    user = User(
        username=username,
        first_name=data.first_name.strip(),
        last_name=data.last_name.strip(),
        roll_no="" if teacher else data.roll_no.strip(),
        role=User.Role.TEACHER if teacher else User.Role.STUDENT,
    )
    check_password_rules(data.password, user)
    user.set_password(data.password)
    user.save()
    login(request, user)
    return {"user": as_user(user)}
