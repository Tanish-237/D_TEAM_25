from django.contrib import admin
from django.contrib.auth.admin import UserAdmin

from attendance.models import Attendance, ClassSession, Course, User

admin.site.register(User, UserAdmin)
admin.site.register(Course)
admin.site.register(ClassSession)
admin.site.register(Attendance)
