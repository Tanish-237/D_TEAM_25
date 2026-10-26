"""Creates a demo teacher, a course, and one student per enrollment folder.

    uv run python manage.py seed_demo ../data/class/enroll

Each folder name becomes a student; their photos are registered without the
guided pose checks (the photos are discarded after embedding, as in the app).
Every account's password is the one given with --password.
"""

from pathlib import Path

from django.core.management.base import BaseCommand

from attendance import engine
from attendance.models import Course, User
from quickpic.align import align
from quickpic.imageio import list_images, load_image


class Command(BaseCommand):
    help = "Create a demo teacher, course and students from a folder of enrollment photos."

    def add_arguments(self, parser):
        parser.add_argument("enroll_dir", type=Path)
        parser.add_argument("--password", default="quickpic-demo")

    def handle(self, enroll_dir: Path, password: str, **options):
        teacher, created = User.objects.get_or_create(
            username="teacher",
            defaults={"first_name": "IPCV", "last_name": "Teacher", "role": User.Role.TEACHER},
        )
        if created:
            teacher.set_password(password)
            teacher.save()
        course, _ = Course.objects.get_or_create(
            subject="Image Processing and Computer Vision",
            year=4,
            semester=7,
            teacher=teacher,
        )
        detector = engine.system().enroll_detector
        for folder in sorted(p for p in enroll_dir.iterdir() if p.is_dir()):
            username = folder.name.lower().replace(" ", "")
            student, created = User.objects.get_or_create(
                username=username,
                defaults={
                    "first_name": folder.name,
                    "roll_no": folder.name,
                    "role": User.Role.STUDENT,
                },
            )
            if created:
                student.set_password(password)
                student.save()
            course.students.add(student)
            crops = []
            for path in list_images(folder):
                image = load_image(path)
                faces = detector.detect(image)
                if faces:
                    crops.append(align(image, max(faces, key=lambda f: f.height)))
            engine.save_face_data(student, crops)
            self.stdout.write(f"{student.username}: registered from {len(crops)} photos")
        self.stdout.write(
            self.style.SUCCESS(
                f"Course code {course.code}. Log in as 'teacher' with password '{password}'."
            )
        )
