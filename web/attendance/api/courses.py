"""Teacher course management: list, create, edit, roster, join codes and CSV export."""

import csv
import io

from django.db.models import Count, Q
from django.http import HttpResponse
from ninja import Router, Schema
from ninja.errors import HttpError

from attendance.api.common import (
    as_course,
    as_user,
    delete_photos,
    own_course,
    percent,
    require_teacher,
)
from attendance.models import Attendance, ClassSession, Course, FaceData, course_code

router = Router()


class CourseIn(Schema):
    subject: str
    year: int
    semester: int

    def validated(self) -> tuple[str, int, int]:
        if not self.subject.strip():
            raise HttpError(400, "Give the course a subject.")
        if not (1 <= self.year <= 5 and 1 <= self.semester <= 10):
            raise HttpError(400, "Year must be 1–5 and semester 1–10.")
        return self.subject.strip(), self.year, self.semester


def course_summary(course: Course) -> dict:
    records = Attendance.objects.filter(session__course=course)
    return {
        **as_course(course),
        "students": course.students.count(),
        "registered": course.students.filter(face_data__isnull=False).count(),
        "sessions": course.sessions.filter(status=ClassSession.Status.CONFIRMED).count(),
        "drafts": course.sessions.filter(status=ClassSession.Status.DRAFT).count(),
        "average": percent(records.filter(present=True).count(), records.count()),
    }


@router.get("/courses")
def list_courses(request):
    """Every course of the teacher, plus class photos still waiting for review."""
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


@router.post("/courses")
def create_course(request, data: CourseIn):
    subject, year, semester = data.validated()
    course = Course.objects.create(
        subject=subject, year=year, semester=semester, teacher=require_teacher(request)
    )
    return course_summary(course)


@router.get("/courses/{course_id}")
def course_detail(request, course_id: int):
    course = own_course(request, course_id)
    sessions = course.sessions.annotate(
        present=Count("records", filter=Q(records__present=True), distinct=True),
        marked=Count("records", distinct=True),
        face_count=Count("faces", distinct=True),
    ).order_by("-date", "-created")
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


@router.patch("/courses/{course_id}")
def edit_course(request, course_id: int, data: CourseIn):
    course = own_course(request, course_id)
    course.subject, course.year, course.semester = data.validated()
    course.save()
    return course_summary(course)


@router.delete("/courses/{course_id}")
def delete_course(request, course_id: int):
    course = own_course(request, course_id)
    delete_photos(course.sessions.all())
    course.delete()
    return {"ok": True}


@router.post("/courses/{course_id}/code")
def new_code(request, course_id: int):
    """Replaces the join code, e.g. after it was shared too widely. Enrolled students stay."""
    course = own_course(request, course_id)
    code = course_code()
    while Course.objects.filter(code=code).exists():
        code = course_code()
    course.code = code
    course.save(update_fields=["code"])
    return {"code": code}


@router.delete("/courses/{course_id}/students/{student_id}")
def remove_student(request, course_id: int, student_id: int):
    own_course(request, course_id).students.remove(student_id)
    return {"ok": True}


@router.get("/courses/{course_id}/export")
def export_csv(request, course_id: int):
    """One row per student, one column per confirmed lecture (P / A), and the percentage."""
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
