import secrets

import numpy as np
from django.contrib.auth.models import AbstractUser
from django.db import models


class User(AbstractUser):
    class Role(models.TextChoices):
        STUDENT = "student", "Student"
        TEACHER = "teacher", "Teacher"

    role = models.CharField(max_length=10, choices=Role.choices, default=Role.STUDENT)
    roll_no = models.CharField(max_length=20, blank=True)

    @property
    def is_teacher(self) -> bool:
        return self.role == self.Role.TEACHER

    def __str__(self) -> str:
        name = self.get_full_name() or self.username
        return f"{name} ({self.roll_no})" if self.roll_no else name


def course_code() -> str:
    return secrets.token_hex(3).upper()


class Course(models.Model):
    subject = models.CharField(max_length=120)
    year = models.PositiveSmallIntegerField()
    semester = models.PositiveSmallIntegerField()
    code = models.CharField(max_length=6, unique=True, default=course_code)
    teacher = models.ForeignKey(User, on_delete=models.CASCADE, related_name="courses_taught")
    students = models.ManyToManyField(User, related_name="courses", blank=True)

    def __str__(self) -> str:
        return f"{self.subject} (year {self.year}, sem {self.semester})"


class FaceData(models.Model):
    """A student's face embeddings. The enrollment photos themselves are never stored."""

    student = models.OneToOneField(User, on_delete=models.CASCADE, related_name="face_data")
    embedder = models.CharField(max_length=30)
    vectors = models.BinaryField()
    dim = models.PositiveSmallIntegerField()
    photos_used = models.PositiveSmallIntegerField()
    updated = models.DateTimeField(auto_now=True)

    def array(self) -> np.ndarray:
        return np.frombuffer(self.vectors, dtype=np.float32).reshape(-1, self.dim)


class ClassSession(models.Model):
    class Status(models.TextChoices):
        DRAFT = "draft", "Awaiting review"
        CONFIRMED = "confirmed", "Confirmed"

    course = models.ForeignKey(Course, on_delete=models.CASCADE, related_name="sessions")
    date = models.DateField()
    topic = models.CharField(max_length=200, blank=True)
    photo = models.ImageField(upload_to="sessions/", blank=True)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.DRAFT)
    seconds = models.FloatField(default=0)
    created = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-date", "-created"]

    def __str__(self) -> str:
        return f"{self.course.subject} on {self.date:%d %b %Y}"


class DetectedFace(models.Model):
    """One face found in a class photo, kept only until the teacher confirms the session."""

    session = models.ForeignKey(ClassSession, on_delete=models.CASCADE, related_name="faces")
    index = models.PositiveSmallIntegerField()
    box = models.JSONField()
    crop = models.BinaryField()
    score = models.FloatField()
    # Best score minus the best score of any other student: small when two students look alike.
    margin = models.FloatField(null=True, blank=True)
    proposed = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL)

    class Meta:
        ordering = ["index"]


class Attendance(models.Model):
    session = models.ForeignKey(ClassSession, on_delete=models.CASCADE, related_name="records")
    student = models.ForeignKey(User, on_delete=models.CASCADE, related_name="attendance")
    present = models.BooleanField()

    class Meta:
        unique_together = [("session", "student")]
