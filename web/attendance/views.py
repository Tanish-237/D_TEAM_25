from functools import wraps

from django.contrib import messages
from django.contrib.auth import login
from django.contrib.auth.decorators import login_required
from django.db.models import Count, Q
from django.http import Http404, HttpResponse
from django.shortcuts import get_object_or_404, redirect, render
from django.views.decorators.http import require_POST

from attendance import engine
from attendance.forms import CourseForm, EnrollmentForm, JoinCourseForm, SessionForm, SignUpForm
from attendance.models import Attendance, ClassSession, Course, FaceData
from quickpic.imageio import load_image


def teacher_required(view):
    @wraps(view)
    @login_required
    def wrapped(request, *args, **kwargs):
        if not request.user.is_teacher:
            raise Http404
        return view(request, *args, **kwargs)

    return wrapped


def signup(request):
    form = SignUpForm(request.POST or None)
    if form.is_valid():
        user = form.save()
        login(request, user)
        return redirect("home")
    return render(request, "attendance/signup.html", {"form": form})


@login_required
def home(request):
    if request.user.is_teacher:
        return teacher_home(request)
    return student_home(request)


def student_home(request):
    student = request.user
    courses = []
    for course in student.courses.all():
        records = Attendance.objects.filter(session__course=course, student=student)
        total = records.count()
        present = records.filter(present=True).count()
        courses.append(
            {
                "course": course,
                "present": present,
                "total": total,
                "percent": round(100 * present / total) if total else None,
                "records": records.select_related("session").order_by("-session__date"),
            }
        )
    face_data = FaceData.objects.filter(student=student).first()
    return render(
        request,
        "attendance/student_home.html",
        {"courses": courses, "face_data": face_data, "join_form": JoinCourseForm()},
    )


@login_required
@require_POST
def join_course(request):
    form = JoinCourseForm(request.POST)
    if form.is_valid():
        form.course.students.add(request.user)
        messages.success(request, f"Joined {form.course}.")
    else:
        messages.error(request, form.errors["code"][0])
    return redirect("home")


@login_required
def register_face(request):
    form = EnrollmentForm(request.POST or None, request.FILES or None)
    checks = []
    if request.method == "POST" and form.is_valid():
        checks = [
            engine.check_enrollment_photo(load_image(form.cleaned_data[step.key]), step)
            for step in engine.ENROLLMENT_STEPS
        ]
        checks = engine.check_side_photos(checks)
        if all(c.ok for c in checks):
            engine.save_face_data(request.user, [c.crop for c in checks])
            messages.success(request, "Your face is registered. The photos were not stored.")
            return redirect("home")
    return render(
        request,
        "attendance/register_face.html",
        {"form": form, "checks": checks, "steps": engine.ENROLLMENT_STEPS},
    )


@login_required
@require_POST
def delete_face(request):
    FaceData.objects.filter(student=request.user).delete()
    messages.success(request, "Your face data has been deleted.")
    return redirect("home")


def teacher_home(request):
    form = CourseForm()
    courses = request.user.courses_taught.annotate(
        enrolled=Count("students", distinct=True), sessions_count=Count("sessions", distinct=True)
    )
    return render(request, "attendance/teacher_home.html", {"courses": courses, "form": form})


@teacher_required
@require_POST
def create_course(request):
    form = CourseForm(request.POST)
    if form.is_valid():
        course = form.save(commit=False)
        course.teacher = request.user
        course.save()
        messages.success(request, f"Created {course}. Students join with code {course.code}.")
    return redirect("home")


def own_course(request, pk) -> Course:
    return get_object_or_404(Course, pk=pk, teacher=request.user)


@teacher_required
def course_detail(request, pk):
    course = own_course(request, pk)
    sessions = list(course.sessions.filter(status=ClassSession.Status.CONFIRMED).order_by("date"))
    students = course.students.annotate(
        attended=Count(
            "attendance", filter=Q(attendance__session__course=course, attendance__present=True)
        )
    ).order_by("roll_no", "username")
    marks = {
        (r.student_id, r.session_id): r.present
        for r in Attendance.objects.filter(session__course=course)
    }
    table = [
        {
            "student": s,
            "registered": FaceData.objects.filter(student=s).exists(),
            "cells": [marks.get((s.pk, session.pk)) for session in sessions],
            "percent": round(100 * s.attended / len(sessions)) if sessions else None,
        }
        for s in students
    ]
    drafts = course.sessions.filter(status=ClassSession.Status.DRAFT)
    return render(
        request,
        "attendance/course_detail.html",
        {
            "course": course,
            "sessions": sessions,
            "table": table,
            "drafts": drafts,
            "form": SessionForm(),
        },
    )


@teacher_required
@require_POST
def new_session(request, pk):
    course = own_course(request, pk)
    form = SessionForm(request.POST, request.FILES)
    if not form.is_valid():
        messages.error(request, "Choose a date and a class photo.")
        return redirect("course", pk=pk)
    session = form.save(commit=False)
    session.course = course
    session.save()
    engine.process_session(session)
    return redirect("review", pk=session.pk)


def own_session(request, pk) -> ClassSession:
    return get_object_or_404(ClassSession, pk=pk, course__teacher=request.user)


@teacher_required
def review(request, pk):
    session = own_session(request, pk)
    if session.status == ClassSession.Status.CONFIRMED:
        return redirect("course", pk=session.course_id)
    roster = session.course.students.order_by("roll_no", "username")
    faces = list(session.faces.select_related("proposed"))
    proposed = {f.proposed_id for f in faces if f.proposed_id}
    if request.method == "POST":
        present = {int(v) for v in request.POST.getlist("present")}
        engine.confirm_session(session, present)
        messages.success(request, f"Attendance confirmed for {session}. The photo was deleted.")
        return redirect("course", pk=session.course_id)
    return render(
        request,
        "attendance/review.html",
        {
            "session": session,
            "faces": faces,
            "roster": [{"student": s, "proposed": s.pk in proposed} for s in roster],
            "named": len(proposed),
            "unknown": sum(1 for f in faces if not f.proposed_id),
        },
    )


@teacher_required
def session_photo(request, pk):
    session = own_session(request, pk)
    if not session.photo:
        raise Http404
    return HttpResponse(session.photo.read(), content_type="image/jpeg")


@teacher_required
def face_crop(request, pk, index):
    face = get_object_or_404(own_session(request, pk).faces, index=index)
    return HttpResponse(bytes(face.crop), content_type="image/jpeg")
