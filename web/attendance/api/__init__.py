"""JSON API used by the React frontend. Session cookies and CSRF protect every call.

Routes: /api/auth (no login needed), /api/account, /api/student, /api/teacher.
Interactive documentation is served at /api/docs.
"""

from ninja import NinjaAPI
from ninja.security import django_auth

from attendance.api import account, auth, courses, sessions, student

api = NinjaAPI(title="QuickPic", auth=django_auth, docs_url="/docs")
api.add_router("/auth", auth.router)
api.add_router("/account", account.router)
api.add_router("/student", student.router)
api.add_router("/teacher", courses.router)
api.add_router("/teacher", sessions.router)
