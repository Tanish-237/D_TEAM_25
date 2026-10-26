"""API tests for accounts, roles and courses. They do not load the recognition models."""

import json

from django.test import Client, TestCase

from attendance.models import Attendance, ClassSession, Course, User


class ApiTestCase(TestCase):
    def setUp(self):
        self.client = Client(enforce_csrf_checks=True)
        self.teacher = User.objects.create_user(
            "teach", password="pass-word-123", role=User.Role.TEACHER
        )
        self.student = User.objects.create_user("stud", password="pass-word-123", roll_no="R1")

    def post(self, path, data=None, method="post"):
        token = self.client.get("/api/auth/csrf").json()["token"]
        send = getattr(self.client, method)
        return send(
            f"/api{path}",
            json.dumps(data or {}),
            content_type="application/json",
            HTTP_X_CSRFTOKEN=token,
        )

    def login(self, user):
        response = self.post(
            "/auth/login", {"username": user.username, "password": "pass-word-123"}
        )
        self.assertEqual(response.status_code, 200)


class AuthTests(ApiTestCase):
    def test_login_requires_csrf(self):
        response = self.client.post(
            "/api/auth/login",
            json.dumps({"username": "teach", "password": "pass-word-123"}),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 403)

    def test_wrong_password(self):
        response = self.post("/auth/login", {"username": "teach", "password": "nope"})
        self.assertEqual(response.status_code, 400)

    def test_signup_student_needs_roll_number(self):
        response = self.post("/auth/signup", {"username": "new", "password": "long-enough-1"})
        self.assertEqual(response.status_code, 400)

    def test_signup_teacher_needs_correct_code(self):
        data = {"username": "t2", "password": "long-enough-1", "teacher_code": "wrong"}
        self.assertEqual(self.post("/auth/signup", data).status_code, 400)
        data["teacher_code"] = "ipcv-2026"
        response = self.post("/auth/signup", data)
        self.assertEqual(response.json()["user"]["role"], "teacher")

    def test_logged_out_user_is_refused(self):
        self.assertEqual(self.client.get("/api/student/overview").status_code, 401)


class CourseTests(ApiTestCase):
    def test_student_cannot_use_teacher_api(self):
        self.login(self.student)
        self.assertEqual(self.client.get("/api/teacher/courses").status_code, 403)

    def test_course_join_and_summary(self):
        self.login(self.teacher)
        course = self.post("/teacher/courses", {"subject": "IPCV", "year": 4, "semester": 7}).json()
        self.login(self.student)
        self.assertEqual(self.post("/student/courses/join", {"code": "zzzzzz"}).status_code, 404)
        self.assertEqual(
            self.post("/student/courses/join", {"code": course["code"].lower()}).status_code, 200
        )
        overview = self.client.get("/api/student/overview").json()
        self.assertEqual([c["subject"] for c in overview["courses"]], ["IPCV"])
        self.assertIsNone(overview["face"])

    def test_teacher_sees_only_own_course(self):
        other = User.objects.create_user("other", password="x", role=User.Role.TEACHER)
        course = Course.objects.create(subject="X", year=1, semester=1, teacher=other)
        self.login(self.teacher)
        self.assertEqual(self.client.get(f"/api/teacher/courses/{course.pk}").status_code, 404)

    def test_mark_and_export(self):
        course = Course.objects.create(subject="IPCV", year=4, semester=7, teacher=self.teacher)
        course.students.add(self.student)
        session = ClassSession.objects.create(
            course=course, date="2026-10-29", status=ClassSession.Status.CONFIRMED
        )
        Attendance.objects.create(session=session, student=self.student, present=False)
        self.login(self.teacher)
        response = self.post(
            f"/teacher/sessions/{session.pk}/mark", {"student": self.student.pk, "present": True}
        )
        self.assertEqual(response.status_code, 200)
        csv = self.client.get(f"/api/teacher/courses/{course.pk}/export").content.decode()
        self.assertIn("R1,stud,P,100.0", csv)
