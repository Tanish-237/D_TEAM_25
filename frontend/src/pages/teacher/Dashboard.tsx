import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowUpRight, BookOpen, Clock, Plus } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router";
import { toast } from "sonner";
import { PageHeader } from "../../components/Layout";
import { Badge, Button, Card, Dialog, Empty, Field, PageLoader } from "../../components/ui";
import { api, formatDate, type CourseSummary, type DraftRef } from "../../lib/api";
import { useAuth } from "../../lib/auth";

function NewCourse({ open, onClose }: { open: boolean; onClose: () => void }) {
  const client = useQueryClient();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const create = useMutation({
    mutationFn: (body: Record<string, unknown>) => api<CourseSummary>("/teacher/courses", { json: body }),
    onSuccess: (course) => {
      client.invalidateQueries({ queryKey: ["teacher"] });
      toast.success(`Course created. Students join with ${course.code}`);
      onClose();
      navigate(`/teacher/courses/${course.id}`);
    },
    onError: (e) => setError(e.message),
  });
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    setError(null);
    create.mutate({ subject: f.get("subject"), year: Number(f.get("year")), semester: Number(f.get("semester")) });
  };
  return (
    <Dialog open={open} onClose={onClose} title="New course" description="A six-character join code is generated for your students.">
      <form onSubmit={submit} className="grid gap-4">
        <Field label="Subject" name="subject" placeholder="Image Processing and Computer Vision" required autoFocus />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Year" name="year" type="number" min={1} max={5} defaultValue={4} required />
          <Field label="Semester" name="semester" type="number" min={1} max={10} defaultValue={7} required />
        </div>
        {error && <p className="text-sm text-danger">{error}</p>}
        <Button type="submit" loading={create.isPending}>
          Create course
        </Button>
      </form>
    </Dialog>
  );
}

function CourseCard({ course }: { course: CourseSummary }) {
  return (
    <Link to={`/teacher/courses/${course.id}`} className="group">
      <Card className="grid h-full gap-6 p-6 transition group-hover:border-ink/25 group-hover:shadow-[0_12px_40px_-24px_rgb(0_0_0/0.35)]">
        <div className="flex items-start justify-between gap-4">
          <div className="grid min-w-0 gap-1">
            <span className="label">
              Year {course.year} · Sem {course.semester}
            </span>
            <h3 className="text-lg leading-snug font-semibold">{course.subject}</h3>
          </div>
          <ArrowUpRight className="size-5 shrink-0 text-faint transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-ink" />
        </div>
        <div className="grid grid-cols-3 gap-4 border-t border-line pt-5">
          <div className="grid gap-0.5">
            <span className="num text-xl font-semibold">{course.students}</span>
            <span className="text-xs text-muted">students</span>
          </div>
          <div className="grid gap-0.5">
            <span className="num text-xl font-semibold">{course.sessions}</span>
            <span className="text-xs text-muted">lectures</span>
          </div>
          <div className="grid gap-0.5">
            <span className="num text-xl font-semibold">{course.average === null ? "–" : `${Math.round(course.average)}%`}</span>
            <span className="text-xs text-muted">average</span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="num rounded-md bg-sunken px-2 py-1 text-xs">{course.code}</span>
          <span className="text-xs text-muted">
            {course.registered}/{course.students} faces registered
          </span>
          {course.drafts > 0 && <Badge tone="warn">{course.drafts} to review</Badge>}
        </div>
      </Card>
    </Link>
  );
}

export default function TeacherDashboard() {
  const { user } = useAuth();
  const [creating, setCreating] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: ["teacher", "courses"],
    queryFn: () => api<{ courses: CourseSummary[]; drafts: DraftRef[] }>("/teacher/courses"),
  });
  if (isLoading || !data) return <PageLoader />;

  return (
    <>
      <PageHeader
        eyebrow="Teacher"
        title={`Good to see you, ${user?.first_name || user?.username}`}
        actions={
          <Button icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>
            New course
          </Button>
        }
      >
        Upload a class photo in any course to take attendance.
      </PageHeader>

      {data.drafts.length > 0 && (
        <Card className="mb-8 overflow-hidden border-warn/30 animate-rise">
          <div className="flex items-center gap-2 border-b border-line bg-warn-soft/50 px-5 py-3 text-sm font-medium text-warn">
            <Clock className="size-4" /> Waiting for your review
          </div>
          <ul className="divide-y divide-line">
            {data.drafts.map((d) => (
              <li key={d.id}>
                <Link to={`/teacher/sessions/${d.id}`} className="flex items-center gap-4 px-5 py-3.5 text-sm hover:bg-sunken">
                  <span className="num w-16 text-muted">{formatDate(d.date)}</span>
                  <span className="min-w-0 flex-1 truncate font-medium">
                    {d.course}
                    {d.topic && <span className="font-normal text-muted"> · {d.topic}</span>}
                  </span>
                  <span className="num text-xs text-muted">{d.faces} faces</span>
                  <ArrowUpRight className="size-4 text-faint" />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {data.courses.length === 0 ? (
        <Empty
          icon={<BookOpen className="size-5" />}
          title="No courses yet"
          action={<Button onClick={() => setCreating(true)}>Create your first course</Button>}
        >
          Create a course, share its code with your students, and they register their faces.
        </Empty>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 animate-rise [animation-delay:80ms]">
          {data.courses.map((c) => (
            <CourseCard key={c.id} course={c} />
          ))}
        </div>
      )}
      <NewCourse open={creating} onClose={() => setCreating(false)} />
    </>
  );
}
