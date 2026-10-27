"""Student pages: attendance overview, joining and leaving courses, face registration."""

import base64

import cv2
from django.http import JsonResponse
from django.shortcuts import get_object_or_404
from ninja import File, Form, Router, Schema
from ninja.errors import HttpError
from ninja.files import UploadedFile

from attendance import engine
from attendance.api.common import as_course, face_status, percent, read_upload
from attendance.models import Attendance, Course, FaceData

router = Router()


class JoinIn(Schema):
    code: str


@router.get("/overview")
def overview(request):
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


@router.post("/courses/join")
def join_course(request, data: JoinIn):
    course = Course.objects.filter(code=data.code.strip().upper()).first()
    if course is None:
        raise HttpError(404, "No course has this code.")
    if request.user.is_teacher:
        raise HttpError(400, "Teachers cannot join courses as students.")
    course.students.add(request.user)
    return as_course(course)


@router.post("/courses/{course_id}/leave")
def leave_course(request, course_id: int):
    """Leaves the roster; attendance already recorded in the course is kept for the teacher."""
    course = get_object_or_404(request.user.courses, pk=course_id)
    course.students.remove(request.user)
    return {"ok": True}


@router.get("/face/steps")
def face_steps(request):
    return [
        {"key": s.key, "title": s.title, "instruction": s.instruction}
        for s in engine.ENROLLMENT_STEPS
    ]


@router.post("/face/check")
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


@router.post("/face")
def face_register(
    request,
    front: File[UploadedFile],
    left: File[UploadedFile],
    right: File[UploadedFile],
    light: File[UploadedFile],
):
    """Re-checks all four photos, then stores embeddings only; the photos are discarded."""
    uploads = {"front": front, "left": left, "right": right, "light": light}
    checks = [
        engine.check_enrollment_photo(read_upload(uploads[s.key]), s)
        for s in engine.ENROLLMENT_STEPS
    ]
    checks = engine.check_side_photos(checks)
    failed = [{"step": c.step.key, "message": c.message} for c in checks if not c.ok]
    if failed:
        return JsonResponse({"ok": False, "failed": failed}, status=400)
    engine.save_face_data(request.user, [c.crop for c in checks])
    return {"ok": True, "face": face_status(request.user)}


@router.delete("/face")
def face_delete(request):
    FaceData.objects.filter(student=request.user).delete()
    return {"ok": True}
