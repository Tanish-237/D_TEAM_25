import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpen, Check, LogOut, Plus, ScanFace, ShieldCheck, Trash2, X } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link } from "react-router";
import { toast } from "sonner";
import { PageHeader } from "../../components/Layout";
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  cx,
  Dialog,
  Empty,
  Input,
  PageLoader,
  ProgressRing,
} from "../../components/ui";
import { api, formatDate, type StudentCourse, type StudentOverview } from "../../lib/api";
import { useAuth } from "../../lib/auth";

function JoinCourse({ open, onClose }: { open: boolean; onClose: () => void }) {
  const client = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const join = useMutation({
    mutationFn: (code: string) => api<{ subject: string }>("/student/courses/join", { json: { code } }),
    onSuccess: (course) => {
      client.invalidateQueries({ queryKey: ["student"] });
      toast.success(`Joined ${course.subject}`);
      onClose();
    },
    onError: (e) => setError(e.message),
  });
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    join.mutate(String(new FormData(event.currentTarget).get("code")));
  };
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Join a course"
      description="Ask your teacher for the six-character course code."
    >
      <form onSubmit={submit} className="grid gap-4">
        <Input
          name="code"
          placeholder="A1B2C3"
          maxLength={6}
          required
          autoFocus
          className="num h-14 text-center text-2xl tracking-[0.4em] uppercase"
        />
        {error && <p className="text-danger text-sm">{error}</p>}
        <Button type="submit" loading={join.isPending}>
          Join course
        </Button>
      </form>
    </Dialog>
  );
}

function FaceCard({ face }: { face: StudentOverview["face"] }) {
  const client = useQueryClient();
  const [confirming, setConfirming] = useState(false);
  const remove = useMutation({
    mutationFn: () => api("/student/face", { method: "DELETE" }),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["student"] });
      toast.success("Your face data was deleted");
      setConfirming(false);
    },
  });

  if (!face) {
    return (
      <Card className="border-warn/30 bg-warn-soft/40 flex flex-wrap items-center gap-5 p-6">
        <div className="bg-warn-soft text-warn grid size-12 place-items-center rounded-xl">
          <ScanFace className="size-6" />
        </div>
        <div className="grid min-w-0 flex-1 gap-1">
          <h2 className="font-semibold">Register your face to be marked present</h2>
          <p className="text-muted text-sm">
            Four guided photos, about two minutes. The photos are not stored, only a numeric signature.
          </p>
        </div>
        <Link to="/student/face">
          <Button>Start registration</Button>
        </Link>
      </Card>
    );
  }

  return (
    <Card className="flex flex-wrap items-center gap-5 p-6">
      <div className="brackets text-signal grid size-12 place-items-center">
        <ShieldCheck className="size-6" />
      </div>
      <div className="grid min-w-0 flex-1 gap-1">
        <div className="flex items-center gap-2">
          <h2 className="font-semibold">Face registered</h2>
          <Badge tone="signal">
            <Check className="size-3" /> active
          </Badge>
        </div>
        <p className="text-muted text-sm">
          {face.photos_used} photo{face.photos_used === 1 ? "" : "s"} → <span className="num">{face.templates}</span>{" "}
          templates (originals plus degraded copies) · updated {formatDate(face.updated)}
        </p>
      </div>
      <div className="flex gap-2">
        <Link to="/student/face">
          <Button variant="secondary" size="sm">
            Re-register
          </Button>
        </Link>
        <Button variant="danger" size="sm" icon={<Trash2 className="size-3.5" />} onClick={() => setConfirming(true)}>
          Delete
        </Button>
      </div>
      <ConfirmDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        title="Delete your face data?"
        description="Your stored face signature is erased. You will not be recognised in class photos until you register again. Past attendance stays."
        confirmLabel="Delete face data"
        loading={remove.isPending}
        onConfirm={() => remove.mutate()}
      />
    </Card>
  );
}

function LeaveCourse({ course, open, onClose }: { course: StudentCourse; open: boolean; onClose: () => void }) {
  const client = useQueryClient();
  const leave = useMutation({
    mutationFn: () => api(`/student/courses/${course.id}/leave`, { method: "POST" }),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["student"] });
      toast.success(`You left ${course.subject}`);
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });
  return (
    <ConfirmDialog
      open={open}
      onClose={onClose}
      title={`Leave ${course.subject}?`}
      description="You will no longer be marked in new lectures. Attendance already recorded stays with your teacher. You can rejoin later with the course code."
      confirmLabel="Leave course"
      loading={leave.isPending}
      onConfirm={() => leave.mutate()}
    />
  );
}

function CourseCard({ course }: { course: StudentCourse }) {
  const [expanded, setExpanded] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const strip = [...course.records].reverse();
  const leaveButton = (
    <button
      onClick={() => setLeaving(true)}
      className="text-muted hover:text-danger inline-flex items-center gap-1.5 text-sm"
    >
      <LogOut className="size-3.5" /> Leave course
    </button>
  );
  return (
    <Card className="grid content-start gap-5 p-6">
      <LeaveCourse course={course} open={leaving} onClose={() => setLeaving(false)} />
      <div className="flex items-start gap-4">
        <ProgressRing value={course.percent} />
        <div className="grid min-w-0 flex-1 gap-1">
          <h3 className="truncate font-semibold">{course.subject}</h3>
          <p className="text-muted text-sm">
            {course.teacher} · Year {course.year}, Sem {course.semester}
          </p>
        </div>
        <span className="num bg-sunken text-muted rounded-md px-2 py-1 text-xs">{course.code}</span>
      </div>
      {course.total === 0 ? (
        <div className="flex items-center justify-between">
          <p className="text-muted text-sm">No lectures recorded yet.</p>
          {leaveButton}
        </div>
      ) : (
        <>
          <div className="grid gap-2">
            <div className="text-muted flex justify-between text-xs">
              <span>
                <span className="num text-ink font-medium">{course.present}</span> of{" "}
                <span className="num">{course.total}</span> lectures
              </span>
              <span>oldest → latest</span>
            </div>
            <div className="flex flex-wrap gap-1">
              {strip.map((r, i) => (
                <span
                  key={i}
                  title={`${formatDate(r.date)}${r.topic ? ` · ${r.topic}` : ""}: ${r.present ? "present" : "absent"}`}
                  className={cx("h-6 w-3 rounded-[3px]", r.present ? "bg-signal" : "bg-danger/70")}
                />
              ))}
            </div>
          </div>
          <div className="flex items-center justify-between">
            <button onClick={() => setExpanded(!expanded)} className="text-muted hover:text-ink text-sm font-medium">
              {expanded ? "Hide history" : "Show history"}
            </button>
            {leaveButton}
          </div>
          {expanded && (
            <ul className="divide-line border-line divide-y rounded-xl border">
              {course.records.map((r, i) => (
                <li key={i} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                  <span className="num text-muted w-20">{formatDate(r.date)}</span>
                  <span className="min-w-0 flex-1 truncate">{r.topic || "Lecture"}</span>
                  {r.present ? (
                    <Badge tone="signal">
                      <Check className="size-3" /> Present
                    </Badge>
                  ) : (
                    <Badge tone="danger">
                      <X className="size-3" /> Absent
                    </Badge>
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </Card>
  );
}

export default function StudentDashboard() {
  const { user } = useAuth();
  const [joining, setJoining] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: ["student", "overview"],
    queryFn: () => api<StudentOverview>("/student/overview"),
  });
  if (isLoading || !data) return <PageLoader />;

  const present = data.courses.reduce((n, c) => n + c.present, 0);
  const total = data.courses.reduce((n, c) => n + c.total, 0);

  return (
    <>
      <PageHeader
        eyebrow={<span className="num">{user?.roll_no}</span>}
        title={`Hi, ${user?.first_name || user?.username}`}
        actions={
          <Button icon={<Plus className="size-4" />} onClick={() => setJoining(true)}>
            Join course
          </Button>
        }
      >
        {total > 0 ? (
          <>
            Overall you attended <span className="num text-ink font-medium">{present}</span> of{" "}
            <span className="num">{total}</span> lectures (
            <span className="num">{Math.round((100 * present) / total)}%</span>).
          </>
        ) : (
          "Your attendance across all courses."
        )}
      </PageHeader>

      <div className="grid gap-6">
        <div className="animate-rise [animation-delay:60ms]">
          <FaceCard face={data.face} />
        </div>
        {data.courses.length === 0 ? (
          <Empty
            icon={<BookOpen className="size-5" />}
            title="You have not joined a course"
            action={<Button onClick={() => setJoining(true)}>Join with a code</Button>}
          >
            Your teacher shares a six-character code for each course.
          </Empty>
        ) : (
          <div className="animate-rise grid gap-4 [animation-delay:120ms] md:grid-cols-2">
            {data.courses.map((course) => (
              <CourseCard key={course.id} course={course} />
            ))}
          </div>
        )}
      </div>
      <JoinCourse open={joining} onClose={() => setJoining(false)} />
    </>
  );
}
