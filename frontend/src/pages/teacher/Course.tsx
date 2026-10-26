import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Camera,
  Check,
  ChevronRight,
  Copy,
  Download,
  ImageUp,
  Loader2,
  Trash2,
  UserMinus,
  Users,
} from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { toast } from "sonner";
import { PageHeader } from "../../components/Layout";
import { Badge, Button, Card, cx, Dialog, Empty, Field, PageLoader, Stat } from "../../components/ui";
import { api, formatDate, type CourseDetail, type StudentRow } from "../../lib/api";

// ------------------------------------------------------------------ take attendance

const STAGES = [
  ["Reading photo", "decode, fix rotation"],
  ["Detecting faces", "SCRFD on 1280 px tiles + full view"],
  ["Aligning", "5 landmarks → 112×112"],
  ["Embedding", "ArcFace ResNet-50, 512-d"],
  ["Matching", "cosine vs. degraded gallery"],
  ["Assigning", "Hungarian, one face per student"],
] as const;

function Processing() {
  const [stage, setStage] = useState(0);
  useEffect(() => {
    const timers = [400, 2600, 3300, 5000, 5600].map((ms, i) => setTimeout(() => setStage(i + 1), ms));
    return () => timers.forEach(clearTimeout);
  }, []);
  return (
    <ol className="grid gap-1">
      {STAGES.map(([title, detail], i) => (
        <li
          key={title}
          className={cx(
            "flex items-center gap-3 rounded-lg px-3 py-2 transition",
            i === stage && "bg-sunken",
            i > stage && "opacity-40",
          )}
        >
          <span className="grid size-6 place-items-center">
            {i < stage ? (
              <Check className="size-4 text-signal" />
            ) : i === stage ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <span className="size-1.5 rounded-full bg-faint" />
            )}
          </span>
          <span className="text-sm font-medium">{title}</span>
          <span className="ml-auto text-xs text-muted">{detail}</span>
        </li>
      ))}
    </ol>
  );
}

function TakeAttendance({ courseId, open, onClose }: { courseId: number; open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const client = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const pick = (f: File | undefined) => {
    if (!f) return;
    setFile(f);
    const heic = /\.hei[cf]$/i.test(f.name);
    setPreview(heic ? null : URL.createObjectURL(f));
  };

  const upload = useMutation({
    mutationFn: (form: FormData) => api<{ id: number }>(`/teacher/courses/${courseId}/sessions`, { form }),
    onSuccess: ({ id }) => {
      client.invalidateQueries({ queryKey: ["teacher"] });
      navigate(`/teacher/sessions/${id}`);
    },
    onError: (e) => toast.error(e.message),
  });

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!file) return toast.error("Choose a class photo first.");
    const form = new FormData(event.currentTarget);
    form.append("photo", file);
    upload.mutate(form);
  };

  const close = () => {
    if (upload.isPending) return;
    setFile(null);
    setPreview(null);
    onClose();
  };

  return (
    <Dialog
      open={open}
      onClose={close}
      wide
      title={upload.isPending ? "Recognising the class…" : "Take attendance"}
      description={upload.isPending ? "This takes a few seconds on the laptop CPU." : "Upload one photo of the whole class."}
    >
      {upload.isPending ? (
        <div className="grid gap-5 sm:grid-cols-[1fr_1.1fr]">
          <div className="relative overflow-hidden rounded-xl bg-sunken">
            {preview ? (
              <img src={preview} alt="" className="size-full object-cover" />
            ) : (
              <div className="grid aspect-[4/3] place-items-center text-faint">
                <Camera className="size-8" />
              </div>
            )}
            <div className="absolute inset-0 overflow-hidden">
              <div className="h-1/2 w-full animate-scan bg-gradient-to-b from-transparent via-signal/25 to-transparent" />
            </div>
          </div>
          <Processing />
        </div>
      ) : (
        <form onSubmit={submit} className="grid gap-4">
          <button
            type="button"
            onClick={() => input.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              pick(e.dataTransfer.files[0]);
            }}
            className={cx(
              "relative grid min-h-56 place-items-center overflow-hidden rounded-xl border-2 border-dashed transition",
              dragging ? "border-signal bg-signal-soft/40" : "border-line hover:border-ink/30",
            )}
          >
            {file ? (
              preview ? (
                <img src={preview} alt="" className="max-h-72 w-full object-contain" />
              ) : (
                <span className="grid justify-items-center gap-2 text-sm">
                  <ImageUp className="size-7 text-signal" />
                  <span className="font-medium">{file.name}</span>
                  <span className="text-muted">HEIC photo, ready to upload</span>
                </span>
              )
            ) : (
              <span className="grid justify-items-center gap-2 p-6 text-sm text-muted">
                <ImageUp className="size-7" />
                <span>
                  <span className="font-medium text-ink">Drop the class photo here</span> or click to choose
                </span>
                <span className="text-xs">JPEG, PNG or HEIC · full phone resolution works best</span>
              </span>
            )}
          </button>
          <input ref={input} type="file" accept="image/*,.heic,.heif" hidden onChange={(e) => pick(e.target.files?.[0])} />
          <div className="grid gap-3 sm:grid-cols-[180px_1fr]">
            <Field label="Date" name="date" type="date" defaultValue={new Date().toLocaleDateString("en-CA")} required />
            <Field label="Topic" name="topic" placeholder="e.g. Hough transform" />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={close}>
              Cancel
            </Button>
            <Button type="submit" disabled={!file}>
              Recognise faces
            </Button>
          </div>
        </form>
      )}
    </Dialog>
  );
}

// ------------------------------------------------------------------ tabs

function Bar({ value, tone }: { value: number | null; tone?: "auto" | "ink" }) {
  const v = value ?? 0;
  const color = tone === "ink" ? "bg-ink" : v >= 75 ? "bg-signal" : "bg-warn";
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-sunken">
      <div className={cx("h-full rounded-full transition-all duration-700", color)} style={{ width: `${v}%` }} />
    </div>
  );
}

function Lectures({ course, onNew }: { course: CourseDetail; onNew: () => void }) {
  const navigate = useNavigate();
  if (course.session_list.length === 0)
    return (
      <Empty icon={<Camera className="size-5" />} title="No lectures yet" action={<Button onClick={onNew}>Take attendance</Button>}>
        Upload a class photo; QuickPic proposes who is present and you confirm.
      </Empty>
    );
  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left">
              <th className="label px-5 py-3 font-semibold">Date</th>
              <th className="label px-5 py-3 font-semibold">Topic</th>
              <th className="label px-5 py-3 font-semibold">Status</th>
              <th className="label w-56 px-5 py-3 font-semibold">Present</th>
              <th className="px-5 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {course.session_list.map((s) => (
              <tr key={s.id} onClick={() => navigate(`/teacher/sessions/${s.id}`)} className="cursor-pointer transition hover:bg-sunken/60">
                <td className="num px-5 py-3.5 whitespace-nowrap">{formatDate(s.date, "long")}</td>
                <td className="max-w-64 truncate px-5 py-3.5 text-muted">{s.topic || "—"}</td>
                <td className="px-5 py-3.5">
                  {s.status === "draft" ? <Badge tone="warn">Review · {s.faces} faces</Badge> : <Badge tone="signal">Confirmed</Badge>}
                </td>
                <td className="px-5 py-3.5">
                  {s.status === "confirmed" ? (
                    <div className="flex items-center gap-3">
                      <Bar value={s.marked ? (100 * s.present) / s.marked : null} />
                      <span className="num w-12 shrink-0 text-right text-xs">
                        {s.present}/{s.marked}
                      </span>
                    </div>
                  ) : (
                    <span className="text-xs text-muted">—</span>
                  )}
                </td>
                <td className="px-5 py-3.5 text-right">
                  <span className="inline-flex items-center gap-1 text-xs font-medium text-muted">
                    {s.status === "draft" ? "Review" : "Open"} <ChevronRight className="size-3.5" />
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function Students({ course }: { course: CourseDetail }) {
  const client = useQueryClient();
  const [removing, setRemoving] = useState<StudentRow | null>(null);
  const remove = useMutation({
    mutationFn: (id: number) => api(`/teacher/courses/${course.id}/students/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["teacher"] });
      toast.success("Student removed from the course");
      setRemoving(null);
    },
  });
  if (course.student_list.length === 0)
    return (
      <Empty icon={<Users className="size-5" />} title="No students yet">
        Share the code <span className="num font-medium text-ink">{course.code}</span>. Students join from their dashboard.
      </Empty>
    );
  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left">
              <th className="label px-5 py-3 font-semibold">Roll no</th>
              <th className="label px-5 py-3 font-semibold">Name</th>
              <th className="label px-5 py-3 font-semibold">Face</th>
              <th className="label w-56 px-5 py-3 font-semibold">Attendance</th>
              <th className="px-5 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {course.student_list.map((s) => (
              <tr key={s.id}>
                <td className="num px-5 py-3 text-muted">{s.roll_no}</td>
                <td className="px-5 py-3 font-medium whitespace-nowrap">{s.name}</td>
                <td className="px-5 py-3">
                  {s.registered ? <Badge tone="signal">Registered</Badge> : <Badge tone="warn">Missing</Badge>}
                </td>
                <td className="px-5 py-3">
                  <div className="flex items-center gap-3">
                    <Bar value={s.percent} />
                    <span className="num w-12 shrink-0 text-right text-xs">{s.percent === null ? "–" : `${Math.round(s.percent)}%`}</span>
                  </div>
                </td>
                <td className="px-5 py-3 text-right">
                  <button onClick={() => setRemoving(s)} className="rounded-md p-1.5 text-faint hover:bg-danger-soft hover:text-danger" title="Remove from course">
                    <UserMinus className="size-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Dialog
        open={removing !== null}
        onClose={() => setRemoving(null)}
        title={`Remove ${removing?.name}?`}
        description="They leave the course roster. Their past attendance records stay."
      >
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setRemoving(null)}>Cancel</Button>
          <Button variant="danger" loading={remove.isPending} onClick={() => removing && remove.mutate(removing.id)}>
            Remove
          </Button>
        </div>
      </Dialog>
    </Card>
  );
}

function Insights({ course }: { course: CourseDetail }) {
  const confirmed = [...course.session_list].filter((s) => s.status === "confirmed").reverse();
  const low = course.student_list.filter((s) => s.percent !== null && s.percent < 75);
  if (confirmed.length === 0)
    return <Empty icon={<Camera className="size-5" />} title="No confirmed lectures yet">Charts appear after the first confirmed lecture.</Empty>;
  const max = Math.max(course.students, ...confirmed.map((s) => s.marked), 1);
  return (
    <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
      <Card className="grid gap-5 p-6">
        <div className="flex items-baseline justify-between">
          <h3 className="font-semibold">Present per lecture</h3>
          <span className="text-xs text-muted">of {course.students} enrolled</span>
        </div>
        <div className="flex h-48 items-end gap-2 overflow-x-auto border-b border-line pb-px">
          {confirmed.map((s) => (
            <Link
              key={s.id}
              to={`/teacher/sessions/${s.id}`}
              className="group grid h-full min-w-8 flex-1 grid-rows-[1fr_auto] items-end justify-items-center gap-1"
              title={`${formatDate(s.date)}: ${s.present}/${s.marked}`}
            >
              <div className="relative flex h-full w-full max-w-12 items-end">
                <div
                  className="w-full rounded-t-md bg-ink/85 transition group-hover:bg-signal"
                  style={{ height: `${(100 * s.present) / max}%` }}
                />
                <span className="num absolute -top-0 left-1/2 -translate-x-1/2 -translate-y-full text-[10px] text-muted opacity-0 group-hover:opacity-100">
                  {s.present}
                </span>
              </div>
            </Link>
          ))}
        </div>
        <div className="flex gap-2 overflow-x-auto">
          {confirmed.map((s) => (
            <span key={s.id} className="num min-w-8 flex-1 text-center text-[10px] text-muted">
              {formatDate(s.date)}
            </span>
          ))}
        </div>
      </Card>
      <Card className="grid content-start gap-4 p-6">
        <h3 className="font-semibold">Below 75%</h3>
        {low.length === 0 ? (
          <p className="text-sm text-muted">Every student is at or above 75%.</p>
        ) : (
          <ul className="grid gap-3">
            {low.map((s) => (
              <li key={s.id} className="grid gap-1.5">
                <div className="flex justify-between text-sm">
                  <span className="truncate">{s.name}</span>
                  <span className="num text-warn">{Math.round(s.percent!)}%</span>
                </div>
                <Bar value={s.percent} />
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

// ------------------------------------------------------------------ page

const TABS = ["Lectures", "Students", "Insights"] as const;

export default function Course() {
  const { id } = useParams();
  const navigate = useNavigate();
  const client = useQueryClient();
  const [tab, setTab] = useState<(typeof TABS)[number]>("Lectures");
  const [taking, setTaking] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const { data: course, isLoading } = useQuery({
    queryKey: ["teacher", "course", id],
    queryFn: () => api<CourseDetail>(`/teacher/courses/${id}`),
  });
  const remove = useMutation({
    mutationFn: () => api(`/teacher/courses/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["teacher"] });
      toast.success("Course deleted");
      navigate("/teacher");
    },
  });
  if (isLoading || !course) return <PageLoader />;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(course.code);
      toast.success("Course code copied");
    } catch {
      toast(course.code);
    }
  };

  return (
    <>
      <Link to="/teacher" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink">
        <ArrowLeft className="size-4" /> Courses
      </Link>
      <PageHeader
        eyebrow={`Year ${course.year} · Semester ${course.semester}`}
        title={course.subject}
        actions={
          <>
            <a href={`/api/teacher/courses/${course.id}/export`}>
              <Button variant="secondary" icon={<Download className="size-4" />}>
                Export CSV
              </Button>
            </a>
            <Button icon={<Camera className="size-4" />} onClick={() => setTaking(true)}>
              Take attendance
            </Button>
          </>
        }
      >
        <button onClick={copy} className="group inline-flex items-center gap-2">
          Join code <span className="num rounded-md bg-sunken px-2 py-0.5 font-medium text-ink">{course.code}</span>
          <Copy className="size-3.5 opacity-50 group-hover:opacity-100" />
        </button>
      </PageHeader>

      <Card className="mb-8 grid grid-cols-2 gap-6 p-6 sm:grid-cols-4 animate-rise [animation-delay:60ms]">
        <Stat label="Students" value={course.students} sub={`${course.registered} faces registered`} />
        <Stat label="Lectures" value={course.sessions} sub={course.drafts ? `${course.drafts} awaiting review` : "all confirmed"} />
        <Stat label="Average" value={course.average === null ? "–" : `${Math.round(course.average)}%`} sub="attendance" />
        <Stat
          label="At risk"
          value={course.student_list.filter((s) => s.percent !== null && s.percent < 75).length}
          sub="below 75%"
        />
      </Card>

      <div className="mb-5 flex gap-6 border-b border-line">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cx(
              "-mb-px border-b-2 pb-3 text-sm transition",
              tab === t ? "border-ink font-medium text-ink" : "border-transparent text-muted hover:text-ink",
            )}
          >
            {t}
          </button>
        ))}
      </div>
      <div key={tab} className="animate-rise">
        {tab === "Lectures" && <Lectures course={course} onNew={() => setTaking(true)} />}
        {tab === "Students" && <Students course={course} />}
        {tab === "Insights" && <Insights course={course} />}
      </div>

      <div className="mt-16 flex justify-end">
        <Button variant="ghost" size="sm" icon={<Trash2 className="size-3.5" />} onClick={() => setDeleting(true)}>
          Delete course
        </Button>
      </div>
      <Dialog
        open={deleting}
        onClose={() => setDeleting(false)}
        title="Delete this course?"
        description="All lectures and attendance records of this course are deleted. Students' face data is kept."
      >
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setDeleting(false)}>Cancel</Button>
          <Button variant="danger" loading={remove.isPending} onClick={() => remove.mutate()}>Delete course</Button>
        </div>
      </Dialog>
      <TakeAttendance courseId={course.id} open={taking} onClose={() => setTaking(false)} />
    </>
  );
}
