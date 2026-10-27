import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Camera, Copy, Download, Pencil, RefreshCw, Trash2 } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { toast } from "sonner";
import { PageHeader } from "../../../components/Layout";
import { Button, Card, ConfirmDialog, cx, PageLoader, Stat } from "../../../components/ui";
import { api, type CourseDetail } from "../../../lib/api";
import { CourseDialog } from "./CourseDialog";
import { InsightsTab } from "./InsightsTab";
import { LecturesTab } from "./LecturesTab";
import { StudentsTab } from "./StudentsTab";
import { TakeAttendance } from "./TakeAttendance";

const TABS = ["Lectures", "Students", "Insights"] as const;

export default function CoursePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const client = useQueryClient();
  const [tab, setTab] = useState<(typeof TABS)[number]>("Lectures");
  const [dialog, setDialog] = useState<"take" | "edit" | "code" | "delete" | null>(null);
  const close = () => setDialog(null);
  const { data: course, isLoading } = useQuery({
    queryKey: ["teacher", "course", id],
    queryFn: () => api<CourseDetail>(`/teacher/courses/${id}`),
  });
  const remove = useMutation({
    mutationFn: () => api(`/teacher/courses/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      navigate("/teacher");
      client.removeQueries({ queryKey: ["teacher", "course", id] });
      client.invalidateQueries({ queryKey: ["teacher"] });
      toast.success("Course deleted");
    },
  });
  const regenerate = useMutation({
    mutationFn: () => api<{ code: string }>(`/teacher/courses/${id}/code`, { method: "POST" }),
    onSuccess: ({ code }) => {
      client.invalidateQueries({ queryKey: ["teacher"] });
      toast.success(`New join code ${code}. The old code no longer works.`);
      close();
    },
  });
  if (isLoading || !course) return <PageLoader />;

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(course.code);
      toast.success("Course code copied");
    } catch {
      toast(course.code);
    }
  };
  const atRisk = course.student_list.filter((s) => s.percent !== null && s.percent < 75).length;

  return (
    <>
      <Link to="/teacher" className="text-muted hover:text-ink mb-4 inline-flex items-center gap-1.5 text-sm">
        <ArrowLeft className="size-4" /> Courses
      </Link>
      <PageHeader
        eyebrow={`Year ${course.year} · Semester ${course.semester}`}
        title={course.subject}
        actions={
          <>
            <Button variant="secondary" icon={<Pencil className="size-4" />} onClick={() => setDialog("edit")}>
              Edit
            </Button>
            <a href={`/api/teacher/courses/${course.id}/export`}>
              <Button variant="secondary" icon={<Download className="size-4" />}>
                Export CSV
              </Button>
            </a>
            <Button icon={<Camera className="size-4" />} onClick={() => setDialog("take")}>
              Take attendance
            </Button>
          </>
        }
      >
        <span className="inline-flex flex-wrap items-center gap-3">
          <button onClick={copyCode} className="group inline-flex items-center gap-2" title="Copy join code">
            Join code <span className="num bg-sunken text-ink rounded-md px-2 py-0.5 font-medium">{course.code}</span>
            <Copy className="size-3.5 opacity-50 group-hover:opacity-100" />
          </button>
          <button onClick={() => setDialog("code")} className="hover:text-ink inline-flex items-center gap-1 text-xs">
            <RefreshCw className="size-3" /> New code
          </button>
        </span>
      </PageHeader>

      <Card className="animate-rise mb-8 grid grid-cols-2 gap-6 p-6 [animation-delay:60ms] sm:grid-cols-4">
        <Stat label="Students" value={course.students} sub={`${course.registered} faces registered`} />
        <Stat
          label="Lectures"
          value={course.sessions}
          sub={course.drafts ? `${course.drafts} awaiting review` : "all confirmed"}
        />
        <Stat
          label="Average"
          value={course.average === null ? "–" : `${Math.round(course.average)}%`}
          sub="attendance"
        />
        <Stat label="At risk" value={atRisk} sub="below 75%" />
      </Card>

      <div className="border-line mb-5 flex gap-6 border-b">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cx(
              "-mb-px border-b-2 pb-3 text-sm transition",
              tab === t ? "border-ink text-ink font-medium" : "text-muted hover:text-ink border-transparent",
            )}
          >
            {t}
          </button>
        ))}
      </div>
      <div key={tab} className="animate-rise">
        {tab === "Lectures" && <LecturesTab course={course} onNew={() => setDialog("take")} />}
        {tab === "Students" && <StudentsTab course={course} />}
        {tab === "Insights" && <InsightsTab course={course} />}
      </div>

      <div className="mt-16 flex justify-end">
        <Button variant="ghost" size="sm" icon={<Trash2 className="size-3.5" />} onClick={() => setDialog("delete")}>
          Delete course
        </Button>
      </div>

      <TakeAttendance courseId={course.id} open={dialog === "take"} onClose={close} />
      <CourseDialog
        key={`${course.subject}-${course.year}-${course.semester}`}
        course={course}
        open={dialog === "edit"}
        onClose={close}
        onSaved={() => {
          toast.success("Course updated");
          close();
        }}
      />
      <ConfirmDialog
        open={dialog === "code"}
        onClose={close}
        title="Generate a new join code?"
        description="The current code stops working. Students already in the course stay enrolled."
        confirmLabel="New code"
        tone="primary"
        loading={regenerate.isPending}
        onConfirm={() => regenerate.mutate()}
      />
      <ConfirmDialog
        open={dialog === "delete"}
        onClose={close}
        title="Delete this course?"
        description="All lectures and attendance records of this course are deleted. Students' face data is kept."
        confirmLabel="Delete course"
        loading={remove.isPending}
        onConfirm={() => remove.mutate()}
      />
    </>
  );
}
