"""Settings for running QuickPic on one machine for a demonstration. Not for public hosting."""

import os
import platform
import sys
from pathlib import Path

# On an Apple-silicon Mac the networks run on its GPU through CoreML: about 8x faster per
# class photo than the CPU, with the same detections and embeddings (cosine >= 0.9999).
if sys.platform == "darwin" and platform.machine() == "arm64":
    os.environ.setdefault("QUICKPIC_DEVICE", "coreml")

BASE_DIR = Path(__file__).resolve().parent.parent
REPO_DIR = BASE_DIR.parent

SECRET_KEY = os.environ.get("QUICKPIC_SECRET_KEY", "local-demo-only-change-me")
DEBUG = os.environ.get("QUICKPIC_DEBUG", "1") == "1"
ALLOWED_HOSTS = ["127.0.0.1", "localhost", "testserver"]

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "attendance",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": os.environ.get("QUICKPIC_DB", BASE_DIR / "quickpic.sqlite3"),
    }
}

AUTH_USER_MODEL = "attendance.User"
AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
]

LANGUAGE_CODE = "en-gb"
TIME_ZONE = "Asia/Kolkata"
USE_I18N = False
USE_TZ = True

# The React app (frontend/) is built into frontend/dist and served from here.
FRONTEND_DIST = REPO_DIR / "frontend" / "dist"
STATIC_URL = "static/"
STATICFILES_DIRS = [FRONTEND_DIST] if FRONTEND_DIST.exists() else []
WHITENOISE_USE_FINDERS = True
CSRF_COOKIE_NAME = "csrftoken"
MEDIA_ROOT = Path(os.environ.get("QUICKPIC_MEDIA", BASE_DIR / "media"))
MEDIA_URL = "media/"
DATA_UPLOAD_MAX_MEMORY_SIZE = 40 * 1024 * 1024
FILE_UPLOAD_MAX_MEMORY_SIZE = 30 * 1024 * 1024
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# Teachers sign up with this code so students cannot create teacher accounts.
TEACHER_SIGNUP_CODE = os.environ.get("QUICKPIC_TEACHER_CODE", "ipcv-2026")

# Recognition settings, from the class-photo evaluation (experiments/results/class_eval.json).
QUICKPIC_CALIBRATOR = None
QUICKPIC_THRESHOLD = 0.35
# Proposed names scoring below this are flagged for the teacher to double-check. On the class
# photos every correct name scored above it, and borderline mistakes fell between 0.35 and it.
QUICKPIC_UNSURE = float(os.environ.get("QUICKPIC_UNSURE", "0.42"))
