import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { Button, Dialog, Field } from "../../../components/ui";
import { api, type Course, type CourseSummary } from "../../../lib/api";

/** Create a course (no `course` given) or edit an existing one. */
export function CourseDialog({
  course,
  open,
  onClose,
  onSaved,
}: {
  course?: Pick<Course, "id" | "subject" | "year" | "semester">;
  open: boolean;
  onClose: () => void;
  onSaved: (course: CourseSummary) => void;
}) {
  const client = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: (body: { subject: string; year: number; semester: number }) =>
      course
        ? api<CourseSummary>(`/teacher/courses/${course.id}`, { method: "PATCH", json: body })
        : api<CourseSummary>("/teacher/courses", { json: body }),
    onSuccess: (saved) => {
      client.invalidateQueries({ queryKey: ["teacher"] });
      onSaved(saved);
    },
    onError: (e) => setError(e.message),
  });
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    setError(null);
    save.mutate({
      subject: String(f.get("subject")),
      year: Number(f.get("year")),
      semester: Number(f.get("semester")),
    });
  };
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={course ? "Edit course" : "New course"}
      description={course ? undefined : "A six-character join code is generated for your students."}
    >
      <form onSubmit={submit} className="grid gap-4">
        <Field
          label="Subject"
          name="subject"
          defaultValue={course?.subject}
          placeholder="Image Processing and Computer Vision"
          required
          autoFocus
        />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Year" name="year" type="number" min={1} max={5} defaultValue={course?.year ?? 4} required />
          <Field
            label="Semester"
            name="semester"
            type="number"
            min={1}
            max={10}
            defaultValue={course?.semester ?? 7}
            required
          />
        </div>
        {error && <p className="text-danger text-sm">{error}</p>}
        <Button type="submit" loading={save.isPending}>
          {course ? "Save changes" : "Create course"}
        </Button>
      </form>
    </Dialog>
  );
}
