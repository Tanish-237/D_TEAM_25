"""JSON API used by the React frontend. Session cookies and CSRF protect every call."""

import base64
import csv
import io
from datetime import date

import cv2
from django.conf import settings
from django.contrib.auth import authenticate, login, logout
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.db.models import Count, Q
from django.http import HttpResponse
from django.middleware.csrf import get_token
from django.shortcuts import get_object_or_404
from ninja import File, Form, NinjaAPI, Router, Schema
from ninja.errors import HttpError
from ninja.files import UploadedFile
from ninja.security import django_auth
from ninja.utils import check_csrf

from attendance import engine
from attendance.models import Attendance, ClassSession, Course, DetectedFace, FaceData, User
from quickpic.imageio import load_image

api = NinjaAPI(title="QuickPic", auth=django_auth, docs_url="/docs")
auth_router = Router(auth=None)
student_router = Router()
teacher_router = Router()


# --------------------------------------------------------------------------- helpers


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


def percent(part: int, whole: int) -> float | None:
    return round(100 * part / whole, 1) if whole else None


def require_teacher(request) -> User:
    if not request.user.is_teacher:
        raise HttpError(403, "Only teachers can do this.")
    return request.user


def own_course(request, course_id: int) -> Course:
    return get_object_or_404(Course, pk=course_id, teacher=require_teacher(request))


def own_session(request, session_id: int) -> ClassSession:
    return get_object_or_404(ClassSession, pk=session_id, course__teacher=require_teacher(request))


def require_csrf(request) -> None:
    """Login and signup run without a session, so they check the CSRF token themselves."""
    if check_csrf(request) is not None:
        raise HttpError(403, "Reload the page and try again.")


def read_upload(upload: UploadedFile):
    try:
        return load_image(upload)
    except Exception as error:
        raise HttpError(400, "This file is not an image we can read.") from error


# --------------------------------------------------------------------------- auth


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


@auth_router.get("/csrf")
def csrf(request):
    return {"token": get_token(request)}


@auth_router.get("/me")
def me(request):
    return {"user": as_user(request.user) if request.user.is_authenticated else None}


@auth_router.post("/login")
def do_login(request, data: LoginIn):
    require_csrf(request)
    user = authenticate(request, username=data.username.strip(), password=data.password)
    if user is None:
        raise HttpError(400, "Wrong username or password.")
    login(request, user)
    return {"user": as_user(user)}


@auth_router.post("/logout")
def do_logout(request):
    require_csrf(request)
    logout(request)
    return {"ok": True}


@auth_router.post("/signup")
def signup(request, data: SignupIn):
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
    try:
        validate_password(data.password, user)
    except ValidationError as error:
        raise HttpError(400, " ".join(error.messages)) from error
    user.set_password(data.password)
    user.save()
    login(request, user)
    return {"user": as_user(user)}


# --------------------------------------------------------------------------- student


class JoinIn(Schema):
    code: str


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


@student_router.get("/overview")
def student_overview(request):
    student = request.user
    courses = []
    for course in student.courses.select_related("teacher").order_by("subject"):
        records = list(
            Attendance.objects.filter(session__course=course, student=student)
            .select_related("session")
            .order_by("-session__date")
        )
        present = sum(r.present for r in records)
        courses.append(
            {
                **as_course(course),
                "present": present,
                "total": len(records),
                "percent": percent(present, len(records)),
                "records": [
                    {
                        "date": r.session.date.isoformat(),
                        "topic": r.session.topic,
                        "present": r.present,
                    }
                    for r in records
                ],
            }
        )
    return {"courses": courses, "face": face_status(student)}


@student_router.post("/courses/join")
def join_course(request, data: JoinIn):
    course = Course.objects.filter(code=data.code.strip().upper()).first()
    if course is None:
        raise HttpError(404, "No course has this code.")
    if request.user.is_teacher:
        raise HttpError(400, "Teachers cannot join courses as students.")
    course.students.add(request.user)
    return as_course(course)


@student_router.get("/face/steps")
def face_steps(request):
    return [
        {"key": s.key, "title": s.title, "instruction": s.instruction}
        for s in engine.ENROLLMENT_STEPS
    ]


@student_router.post("/face/check")
def face_check(request, step: Form[str], photo: File[UploadedFile]):
    """Checks one registration photo and returns the aligned face so the student sees it."""
    steps = {s.key: s for s in engine.ENROLLMENT_STEPS}
    if step not in steps:
        raise HttpError(400, "Unknown step.")
    check = engine.check_enrollment_photo(read_upload(photo), steps[step])
    preview = None
    if check.crop is not None:
        jpeg = cv2.imencode(".jpg", check.crop)[1]
        preview = "data:image/jpeg;base64," + base64.b64encode(jpeg.tobytes()).decode()
    return {"ok": check.ok, "message": check.message, "yaw": check.yaw, "preview": preview}


@student_router.post("/face")
def face_register(
    request,
    front: File[UploadedFile],
    left: File[UploadedFile],
    right: File[UploadedFile],
    light: File[UploadedFile],
):
    uploads = {"front": front, "left": left, "right": right, "light": light}
    checks = [
        engine.check_enrollment_photo(read_upload(uploads[s.key]), s)
        for s in engine.ENROLLMENT_STEPS
    ]
    checks = engine.check_side_photos(checks)
    failed = [{"step": c.step.key, "message": c.message} for c in checks if not c.ok]
    if failed:
        return api.create_response(request, {"ok": False, "failed": failed}, status=400)
    engine.save_face_data(request.user, [c.crop for c in checks])
    return {"ok": True, "face": face_status(request.user)}


@student_router.delete("/face")
def face_delete(request):
    FaceData.objects.filter(student=request.user).delete()
    return {"ok": True}


# --------------------------------------------------------------------------- teacher


class CourseIn(Schema):
    subject: str
    year: int
    semester: int


class ConfirmIn(Schema):
    present: list[int]


class MarkIn(Schema):
    student: int
    present: bool


def course_summary(course: Course) -> dict:
    confirmed = course.sessions.filter(status=ClassSession.Status.CONFIRMED)
    records = Attendance.objects.filter(session__course=course)
    return {
        **as_course(course),
        "students": course.students.count(),
        "registered": course.students.filter(face_data__isnull=False).count(),
        "sessions": confirmed.count(),
        "drafts": course.sessions.filter(status=ClassSession.Status.DRAFT).count(),
        "average": percent(records.filter(present=True).count(), records.count()),
    }


@teacher_router.get("/courses")
def teacher_courses(request):
    teacher = require_teacher(request)
    courses = teacher.courses_taught.select_related("teacher").order_by("-year", "subject")
    drafts = ClassSession.objects.filter(
        course__teacher=teacher, status=ClassSession.Status.DRAFT
    ).select_related("course")
    return {
        "courses": [course_summary(c) for c in courses],
        "drafts": [
            {
                "id": s.pk,
                "course": s.course.subject,
                "date": s.date.isoformat(),
                "topic": s.topic,
                "faces": s.faces.count(),
            }
            for s in drafts
        ],
    }


@teacher_router.post("/courses")
def create_course(request, data: CourseIn):
    teacher = require_teacher(request)
    if not data.subject.strip():
        raise HttpError(400, "Give the course a subject.")
    if not (1 <= data.year <= 5 and 1 <= data.semester <= 10):
        raise HttpError(400, "Year must be 1–5 and semester 1–10.")
    course = Course.objects.create(
        subject=data.subject.strip(), year=data.year, semester=data.semester, teacher=teacher
    )
    return course_summary(course)


@teacher_router.delete("/courses/{course_id}")
def delete_course(request, course_id: int):
    own_course(request, course_id).delete()
    return {"ok": True}


@teacher_router.get("/courses/{course_id}")
def course_detail(request, course_id: int):
    course = own_course(request, course_id)
    sessions = list(
        course.sessions.annotate(
            present=Count("records", filter=Q(records__present=True), distinct=True),
            marked=Count("records", distinct=True),
            face_count=Count("faces", distinct=True),
        ).order_by("-date", "-created")
    )
    students = course.students.annotate(
        attended=Count(
            "attendance", filter=Q(attendance__session__course=course, attendance__present=True)
        ),
        marked=Count("attendance", filter=Q(attendance__session__course=course)),
    ).order_by("roll_no", "username")
    registered = set(
        FaceData.objects.filter(student__in=students).values_list("student_id", flat=True)
    )
    return {
        **course_summary(course),
        "session_list": [
            {
                "id": s.pk,
                "date": s.date.isoformat(),
                "topic": s.topic,
                "status": s.status,
                "present": s.present,
                "marked": s.marked,
                "faces": s.face_count,
                "seconds": round(s.seconds, 1),
            }
            for s in sessions
        ],
        "student_list": [
            {
                **as_user(s),
                "registered": s.pk in registered,
                "attended": s.attended,
                "marked": s.marked,
                "percent": percent(s.attended, s.marked),
            }
            for s in students
        ],
    }


@teacher_router.delete("/courses/{course_id}/students/{student_id}")
def remove_student(request, course_id: int, student_id: int):
    own_course(request, course_id).students.remove(student_id)
    return {"ok": True}


@teacher_router.get("/courses/{course_id}/export")
def export_csv(request, course_id: int):
    course = own_course(request, course_id)
    sessions = list(
        course.sessions.filter(status=ClassSession.Status.CONFIRMED).order_by("date", "created")
    )
    marks = {
        (r.student_id, r.session_id): r.present
        for r in Attendance.objects.filter(session__course=course)
    }
    out = io.StringIO()
    writer = csv.writer(out)
    writer.writerow(["Roll no", "Name", *(f"{s.date:%Y-%m-%d}" for s in sessions), "Percent"])
    for student in course.students.order_by("roll_no", "username"):
        cells = [marks.get((student.pk, s.pk)) for s in sessions]
        known = [c for c in cells if c is not None]
        writer.writerow(
            [
                student.roll_no,
                student.get_full_name() or student.username,
                *("P" if c else "A" if c is not None else "" for c in cells),
                percent(sum(known), len(known)) or "",
            ]
        )
    response = HttpResponse(out.getvalue(), content_type="text/csv")
    name = course.subject.lower().replace(" ", "-")
    response["Content-Disposition"] = f'attachment; filename="{name}-attendance.csv"'
    return response


@teacher_router.post("/courses/{course_id}/sessions")
def new_session(
    request,
    course_id: int,
    photo: File[UploadedFile],
    date: Form[date],
    topic: Form[str] = "",
):
    course = own_course(request, course_id)
    read_upload(photo)
    photo.seek(0)
    session = ClassSession.objects.create(course=course, date=date, topic=topic, photo=photo)
    engine.process_session(session)
    return {"id": session.pk}


@teacher_router.get("/sessions/{session_id}")
def session_detail(request, session_id: int):
    session = own_session(request, session_id)
    course = session.course
    roster = course.students.order_by("roll_no", "username")
    registered = set(
        FaceData.objects.filter(student__in=roster).values_list("student_id", flat=True)
    )
    marks = {r.student_id: r.present for r in session.records.all()}
    width = height = None
    if session.photo:
        width, height = session.photo.width, session.photo.height
    return {
        "id": session.pk,
        "course": {"id": course.pk, "subject": course.subject, "code": course.code},
        "date": session.date.isoformat(),
        "topic": session.topic,
        "status": session.status,
        "seconds": round(session.seconds, 1),
        "photo": {"width": width, "height": height} if session.photo else None,
        "faces": [
            {
                "index": f.index,
                "box": f.box,
                "score": round(f.score, 3),
                "proposed": f.proposed_id,
            }
            for f in session.faces.all()
        ],
        "roster": [
            {**as_user(s), "registered": s.pk in registered, "present": marks.get(s.pk)}
            for s in roster
        ],
    }


@teacher_router.get("/sessions/{session_id}/photo")
def session_photo(request, session_id: int):
    session = own_session(request, session_id)
    if not session.photo:
        raise HttpError(404, "The photo was deleted when attendance was confirmed.")
    return HttpResponse(session.photo.read(), content_type="image/jpeg")


@teacher_router.get("/sessions/{session_id}/faces/{index}")
def face_crop(request, session_id: int, index: int):
    face = get_object_or_404(DetectedFace, session=own_session(request, session_id), index=index)
    return HttpResponse(bytes(face.crop), content_type="image/jpeg")


@teacher_router.post("/sessions/{session_id}/confirm")
def confirm(request, session_id: int, data: ConfirmIn):
    session = own_session(request, session_id)
    if session.status == ClassSession.Status.CONFIRMED:
        raise HttpError(400, "This session is already confirmed.")
    engine.confirm_session(session, set(data.present))
    return {"ok": True}


@teacher_router.post("/sessions/{session_id}/mark")
def mark(request, session_id: int, data: MarkIn):
    session = own_session(request, session_id)
    if session.status != ClassSession.Status.CONFIRMED:
        raise HttpError(400, "Confirm the session first.")
    student = get_object_or_404(session.course.students, pk=data.student)
    Attendance.objects.update_or_create(
        session=session, student=student, defaults={"present": data.present}
    )
    return {"ok": True}


@teacher_router.delete("/sessions/{session_id}")
def delete_session(request, session_id: int):
    session = own_session(request, session_id)
    if session.photo:
        session.photo.delete(save=False)
    session.delete()
    return {"ok": True}


api.add_router("/auth", auth_router)
api.add_router("/student", student_router)
api.add_router("/teacher", teacher_router)
