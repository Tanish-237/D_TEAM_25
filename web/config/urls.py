from attendance.api import api
from django.conf import settings
from django.contrib import admin
from django.http import HttpResponse
from django.urls import path, re_path


def frontend(request):
    """Serves the built React app; its router handles every page URL."""
    index = settings.FRONTEND_DIST / "index.html"
    if not index.exists():
        return HttpResponse(
            "The frontend is not built yet. Run <code>make build</code> and reload.", status=503
        )
    return HttpResponse(index.read_text(), content_type="text/html")


urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/", api.urls),
    re_path(r"^(?!api/|admin/|static/).*$", frontend),
]
