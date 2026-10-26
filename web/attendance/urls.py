from django.contrib.auth import views as auth
from django.urls import path

from attendance import views

urlpatterns = [
    path("", views.home, name="home"),
    path("signup/", views.signup, name="signup"),
    path("login/", auth.LoginView.as_view(template_name="attendance/login.html"), name="login"),
    path("logout/", auth.LogoutView.as_view(), name="logout"),
    path("join/", views.join_course, name="join"),
    path("face/", views.register_face, name="register_face"),
    path("face/delete/", views.delete_face, name="delete_face"),
    path("courses/new/", views.create_course, name="create_course"),
    path("courses/<int:pk>/", views.course_detail, name="course"),
    path("courses/<int:pk>/sessions/new/", views.new_session, name="new_session"),
    path("sessions/<int:pk>/review/", views.review, name="review"),
    path("sessions/<int:pk>/photo/", views.session_photo, name="session_photo"),
    path("sessions/<int:pk>/faces/<int:index>/", views.face_crop, name="face_crop"),
]
