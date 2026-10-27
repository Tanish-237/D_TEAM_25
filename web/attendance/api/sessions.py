"""Teacher lectures: upload a class photo, review the proposed names, confirm and correct."""

from datetime import date

from django.conf import settings
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from ninja import File, Form, Router, Schema
from ninja.errors import HttpError
from ninja.files import UploadedFile

from attendance import engine
from attendance.api.common import as_user, delete_photos, own_course, own_session, read_upload
from attendance.models import Attendance, ClassSession, DetectedFace, FaceData

router = Router()


class SessionIn(Schema):
    date: date
    topic: str = ""


class ConfirmIn(Schema):
    present: list[int]


class MarkIn(Schema):
    student: int
    present: bool


@router.post("/courses/{course_id}/sessions")
def new_session(
    request,
    course_id: int,
    photo: File[UploadedFile],
    date: Form[date],
    topic: Form[str] = "",
):
    """Stores the class photo and runs recognition; the result is a draft for review."""
    course = own_course(request, course_id)
    read_upload(photo)
    photo.seek(0)
    session = ClassSession.objects.create(course=course, date=date, topic=topic, photo=photo)
    engine.process_session(session)
    return {"id": session.pk}


@router.get("/sessions/{session_id}")
def session_detail(request, session_id: int):
    session = own_session(request, session_id)
    course = session.course
    roster = course.students.order_by("roll_no", "username")
    registered = set(
        FaceData.objects.filter(student__in=roster).values_list("student_id", flat=True)
    )
    marks = {r.student_id: r.present for r in session.records.all()}
    photo = session.photo
    return {
        "id": session.pk,
        "course": {"id": course.pk, "subject": course.subject, "code": course.code},
        "date": session.date.isoformat(),
        "topic": session.topic,
        "status": session.status,
        "seconds": round(session.seconds, 1),
        "unsure_margin": settings.QUICKPIC_UNSURE_MARGIN,
        "photo": {"width": photo.width, "height": photo.height} if photo else None,
        "faces": [
            {
                "index": f.index,
                "box": f.box,
                "score": round(f.score, 3),
                "margin": None if f.margin is None else round(f.margin, 3),
                "proposed": f.proposed_id,
            }
            for f in session.faces.all()
        ],
        "roster": [
            {**as_user(s), "registered": s.pk in registered, "present": marks.get(s.pk)}
            for s in roster
        ],
    }


@router.patch("/sessions/{session_id}")
def edit_session(request, session_id: int, data: SessionIn):
    session = own_session(request, session_id)
    session.date, session.topic = data.date, data.topic.strip()
    session.save(update_fields=["date", "topic"])
    return {"ok": True}


@router.delete("/sessions/{session_id}")
def delete_session(request, session_id: int):
    """Deletes a draft, or a confirmed lecture together with its attendance marks."""
    session = own_session(request, session_id)
    delete_photos([session])
    session.delete()
    return {"ok": True}


@router.get("/sessions/{session_id}/photo")
def session_photo(request, session_id: int):
    session = own_session(request, session_id)
    if not session.photo:
        raise HttpError(404, "The photo was deleted when attendance was confirmed.")
    return HttpResponse(session.photo.read(), content_type="image/jpeg")


@router.get("/sessions/{session_id}/faces/{index}")
def face_crop(request, session_id: int, index: int):
    face = get_object_or_404(DetectedFace, session=own_session(request, session_id), index=index)
    return HttpResponse(bytes(face.crop), content_type="image/jpeg")


@router.post("/sessions/{session_id}/confirm")
def confirm(request, session_id: int, data: ConfirmIn):
    session = own_session(request, session_id)
    if session.status == ClassSession.Status.CONFIRMED:
        raise HttpError(400, "This session is already confirmed.")
    engine.confirm_session(session, set(data.present))
    return {"ok": True}


@router.post("/sessions/{session_id}/mark")
def mark(request, session_id: int, data: MarkIn):
    """Corrects one student's mark after confirmation."""
    session = own_session(request, session_id)
    if session.status != ClassSession.Status.CONFIRMED:
        raise HttpError(400, "Confirm the session first.")
    student = get_object_or_404(session.course.students, pk=data.student)
    Attendance.objects.update_or_create(
        session=session, student=student, defaults={"present": data.present}
    )
    return {"ok": True}
