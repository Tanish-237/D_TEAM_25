from django import forms
from django.conf import settings
from django.contrib.auth.forms import UserCreationForm

from attendance.engine import ENROLLMENT_STEPS
from attendance.models import ClassSession, Course, User


class SignUpForm(UserCreationForm):
    teacher_code = forms.CharField(
        required=False,
        label="Teacher code",
        help_text="Only for teachers. Students leave this empty.",
    )

    class Meta:
        model = User
        fields = ["username", "first_name", "last_name", "roll_no"]
        labels = {"roll_no": "Roll number (students)"}

    def clean(self):
        data = super().clean()
        code = data.get("teacher_code")
        if code and code != settings.TEACHER_SIGNUP_CODE:
            self.add_error("teacher_code", "This teacher code is not correct.")
        if not code and not data.get("roll_no"):
            self.add_error("roll_no", "Students need a roll number.")
        return data

    def save(self, commit=True):
        user = super().save(commit=False)
        if self.cleaned_data.get("teacher_code"):
            user.role = User.Role.TEACHER
            user.roll_no = ""
        if commit:
            user.save()
        return user


class CourseForm(forms.ModelForm):
    class Meta:
        model = Course
        fields = ["subject", "year", "semester"]


class JoinCourseForm(forms.Form):
    code = forms.CharField(max_length=6, label="Course code")

    def clean_code(self):
        code = self.cleaned_data["code"].strip().upper()
        try:
            self.course = Course.objects.get(code=code)
        except Course.DoesNotExist as error:
            raise forms.ValidationError("No course has this code.") from error
        return code


class EnrollmentForm(forms.Form):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        for step in ENROLLMENT_STEPS:
            self.fields[step.key] = forms.ImageField(label=step.title, help_text=step.instruction)


class SessionForm(forms.ModelForm):
    class Meta:
        model = ClassSession
        fields = ["date", "topic", "photo"]
        widgets = {"date": forms.DateInput(attrs={"type": "date"})}
        labels = {"photo": "Class photo"}

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.fields["photo"].required = True
