import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight, BookOpen, Clock, Plus } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { toast } from "sonner";
import { PageHeader } from "../../components/Layout";
import { Badge, Button, Card, Empty, PageLoader } from "../../components/ui";
import { api, formatDate, type CourseSummary, type DraftRef } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { CourseDialog } from "./course/CourseDialog";

function CourseCard({ course }: { course: CourseSummary }) {
  return (
    <Link to={`/teacher/courses/${course.id}`} className="group">
      <Card className="group-hover:border-ink/25 grid h-full gap-6 p-6 transition group-hover:shadow-[0_12px_40px_-24px_rgb(0_0_0/0.35)]">
        <div className="flex items-start justify-between gap-4">
          <div className="grid min-w-0 gap-1">
            <span className="label">
              Year {course.year} · Sem {course.semester}
            </span>
            <h3 className="text-lg leading-snug font-semibold">{course.subject}</h3>
          </div>
          <ArrowUpRight className="text-faint group-hover:text-ink size-5 shrink-0 transition group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
        </div>
        <div className="border-line grid grid-cols-3 gap-4 border-t pt-5">
          <div className="grid gap-0.5">
            <span className="num text-xl font-semibold">{course.students}</span>
            <span className="text-muted text-xs">students</span>
          </div>
          <div className="grid gap-0.5">
            <span className="num text-xl font-semibold">{course.sessions}</span>
            <span className="text-muted text-xs">lectures</span>
          </div>
          <div className="grid gap-0.5">
            <span className="num text-xl font-semibold">
              {course.average === null ? "–" : `${Math.round(course.average)}%`}
            </span>
            <span className="text-muted text-xs">average</span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="num bg-sunken rounded-md px-2 py-1 text-xs">{course.code}</span>
          <span className="text-muted text-xs">
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
  const navigate = useNavigate();
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
        <Card className="border-warn/30 animate-rise mb-8 overflow-hidden">
          <div className="border-line bg-warn-soft/50 text-warn flex items-center gap-2 border-b px-5 py-3 text-sm font-medium">
            <Clock className="size-4" /> Waiting for your review
          </div>
          <ul className="divide-line divide-y">
            {data.drafts.map((d) => (
              <li key={d.id}>
                <Link
                  to={`/teacher/sessions/${d.id}`}
                  className="hover:bg-sunken flex items-center gap-4 px-5 py-3.5 text-sm"
                >
                  <span className="num text-muted w-16">{formatDate(d.date)}</span>
                  <span className="min-w-0 flex-1 truncate font-medium">
                    {d.course}
                    {d.topic && <span className="text-muted font-normal"> · {d.topic}</span>}
                  </span>
                  <span className="num text-muted text-xs">{d.faces} faces</span>
                  <ArrowUpRight className="text-faint size-4" />
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
        <div className="animate-rise grid gap-4 [animation-delay:80ms] sm:grid-cols-2 lg:grid-cols-3">
          {data.courses.map((c) => (
            <CourseCard key={c.id} course={c} />
          ))}
        </div>
      )}
      <CourseDialog
        open={creating}
        onClose={() => setCreating(false)}
        onSaved={(course) => {
          toast.success(`Course created. Students join with ${course.code}`);
          setCreating(false);
          navigate(`/teacher/courses/${course.id}`);
        }}
      />
    </>
  );
}
