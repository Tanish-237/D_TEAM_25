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

    def test_signup_student(self):
        data = {"username": "Asha", "password": "long-enough-1", "roll_no": "20239999"}
        user = self.post("/auth/signup", data).json()["user"]
        self.assertEqual((user["username"], user["role"]), ("asha", "student"))
        self.assertEqual(self.client.get("/api/auth/me").json()["user"]["roll_no"], "20239999")

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


class ManagementTests(ApiTestCase):
    def setUp(self):
        super().setUp()
        self.course = Course.objects.create(
            subject="IPCV", year=4, semester=7, teacher=self.teacher
        )
        self.course.students.add(self.student)
        self.session = ClassSession.objects.create(
            course=self.course, date="2026-10-29", status=ClassSession.Status.CONFIRMED
        )
        Attendance.objects.create(session=self.session, student=self.student, present=True)

    def test_student_leaves_course(self):
        self.login(self.student)
        self.assertEqual(self.post(f"/student/courses/{self.course.pk}/leave").status_code, 200)
        self.assertFalse(self.course.students.filter(pk=self.student.pk).exists())
        self.assertEqual(self.client.get("/api/student/overview").json()["courses"], [])
        # leaving twice is refused: the student is no longer on the roster
        self.assertEqual(self.post(f"/student/courses/{self.course.pk}/leave").status_code, 404)

    def test_teacher_edits_and_deletes_lecture(self):
        self.login(self.teacher)
        path = f"/teacher/sessions/{self.session.pk}"
        response = self.post(path, {"date": "2026-10-30", "topic": "Hough"}, method="patch")
        self.assertEqual(response.status_code, 200)
        self.session.refresh_from_db()
        self.assertEqual((str(self.session.date), self.session.topic), ("2026-10-30", "Hough"))
        self.assertEqual(self.post(path, method="delete").status_code, 200)
        self.assertFalse(Attendance.objects.exists())

    def test_teacher_edits_course_and_regenerates_code(self):
        self.login(self.teacher)
        old = self.course.code
        data = {"subject": "IPCV Lab", "year": 4, "semester": 8}
        path = f"/teacher/courses/{self.course.pk}"
        self.assertEqual(self.post(path, data, method="patch").json()["semester"], 8)
        code = self.post(f"/teacher/courses/{self.course.pk}/code").json()["code"]
        self.assertNotEqual(code, old)
        self.assertTrue(self.course.students.filter(pk=self.student.pk).exists())

    def test_profile_update_and_password_change(self):
        self.login(self.student)
        stats = self.client.get("/api/account/profile").json()["stats"]
        self.assertEqual((stats["attended"], stats["lectures"]), (1, 1))
        data = {"first_name": "Asha", "last_name": "Rao", "roll_no": "R2"}
        user = self.post("/account/profile", data, method="patch").json()["user"]
        self.assertEqual((user["name"], user["roll_no"]), ("Asha Rao", "R2"))
        wrong = {"current": "nope", "new": "another-pass-9"}
        self.assertEqual(self.post("/account/password", wrong).status_code, 400)
        right = {"current": "pass-word-123", "new": "another-pass-9"}
        self.assertEqual(self.post("/account/password", right).status_code, 200)
        self.assertEqual(self.client.get("/api/student/overview").status_code, 200)

    def test_delete_account_needs_password(self):
        self.login(self.student)
        self.assertEqual(self.post("/account/delete", {"password": "nope"}).status_code, 400)
        self.assertEqual(
            self.post("/account/delete", {"password": "pass-word-123"}).status_code, 200
        )
        self.assertFalse(User.objects.filter(username="stud").exists())
        self.assertFalse(Attendance.objects.exists())
