import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, CircleHelp, ScanFace, ShieldCheck, Timer, Trash2 } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { Card, ConfirmDialog, cx, Button } from "../../../components/ui";
import { api, type Face, type SessionDetail } from "../../../lib/api";
import { FacePanel } from "./FacePanel";
import { faceUrl, facesByStudent, type Assignments } from "./faces";
import { PhotoViewer } from "./PhotoViewer";
import { RegisterPanel } from "./RegisterPanel";

type Filter = "all" | "named" | "unknown";

/** Review of a draft: the teacher checks every proposed name, edits the register and confirms. */
export function Review({ session }: { session: SessionDetail }) {
  const navigate = useNavigate();
  const client = useQueryClient();
  const viewer = useRef<HTMLDivElement>(null);
  const rosterById = useMemo(() => new Map(session.roster.map((s) => [s.id, s])), [session]);

  const [assign, setAssign] = useState<Assignments>(() =>
    Object.fromEntries(session.faces.map((f) => [f.index, f.proposed])),
  );
  const [present, setPresent] = useState<Set<number>>(
    () => new Set(session.faces.map((f) => f.proposed).filter((p): p is number => p != null)),
  );
  const [checked, setChecked] = useState<Set<number>>(() => new Set());
  const [selected, setSelected] = useState<number | null>(null);
  const [panel, setPanel] = useState<"register" | "face">("register");
  const [filter, setFilter] = useState<Filter>("all");
  const [confirming, setConfirming] = useState(false);
  const [discarding, setDiscarding] = useState(false);

  const faceOf = useMemo(() => facesByStudent(assign), [assign]);
  const named = faceOf.size;
  const unknown = session.faces.length - named;

  // A proposed name where another student scored almost as high, not yet confirmed or changed.
  const isUnsure = (face: Face) =>
    assign[face.index] != null &&
    assign[face.index] === face.proposed &&
    face.margin !== null &&
    face.margin < session.unsure_margin &&
    !checked.has(face.index);
  const unsureFaces = session.faces.filter(isUnsure);

  const accept = (index: number) => setChecked((c) => new Set(c).add(index));

  const select = (index: number) => {
    setSelected(index);
    setPanel("face");
  };

  const assignFace = (index: number, student: number | null) => {
    accept(index);
    const before = assign[index];
    const next = { ...assign };
    // One face per student: taking a student off another face leaves that face unknown.
    if (student != null) for (const k of Object.keys(next)) if (next[Number(k)] === student) next[Number(k)] = null;
    next[index] = student;
    setAssign(next);
    setPresent((p) => {
      const s = new Set(p);
      if (before != null && before !== student) s.delete(before);
      if (student != null) s.add(student);
      return s;
    });
  };

  const toggle = (id: number) =>
    setPresent((p) => {
      const s = new Set(p);
      if (s.has(id)) s.delete(id);
      else s.add(id);
      return s;
    });

  const backToCourse = () => navigate(`/teacher/courses/${session.course.id}`);
  const confirm = useMutation({
    mutationFn: () => api(`/teacher/sessions/${session.id}/confirm`, { json: { present: [...present] } }),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["teacher"] });
      toast.success("Attendance confirmed. The class photo was deleted.");
      backToCourse();
    },
    onError: (e) => toast.error(e.message),
  });
  const discard = useMutation({
    mutationFn: () => api(`/teacher/sessions/${session.id}`, { method: "DELETE" }),
    onSuccess: () => {
      backToCourse();
      client.removeQueries({ queryKey: ["teacher", "session", String(session.id)] });
      client.invalidateQueries({ queryKey: ["teacher"] });
      toast("Draft discarded");
    },
  });

  const shownFaces = session.faces.filter((f) =>
    filter === "all" ? true : filter === "named" ? assign[f.index] != null : assign[f.index] == null,
  );
  const selectedFace = session.faces.find((f) => f.index === selected);
  const summary: [typeof ScanFace, string | number, string][] = [
    [ScanFace, session.faces.length, "faces detected"],
    [ShieldCheck, named, "named as students"],
    [CircleHelp, unknown, "left unknown"],
    [Timer, `${session.seconds}s`, "processing time"],
  ];

  return (
    <div className="grid gap-6 pb-24">
      <div className="border-line bg-line animate-rise grid grid-cols-2 gap-px overflow-hidden rounded-2xl border sm:grid-cols-4">
        {summary.map(([Icon, value, label]) => (
          <div key={label} className="bg-surface flex items-center gap-3 px-5 py-4">
            <Icon className="text-muted size-5" strokeWidth={1.7} />
            <div className="grid leading-tight">
              <span className="num text-xl font-semibold">{value}</span>
              <span className="text-muted text-xs">{label}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]" ref={viewer}>
        <div className="animate-rise min-w-0 [animation-delay:60ms]">
          {unsureFaces.length > 0 && (
            <button
              onClick={() => select(unsureFaces[0]!.index)}
              className="border-warn/30 bg-warn-soft/60 text-warn mb-3 flex w-full items-center gap-2 rounded-xl border px-4 py-2.5 text-left text-sm"
            >
              <CircleHelp className="size-4 shrink-0" />
              <span>
                <span className="font-semibold">{unsureFaces.length}</span> name
                {unsureFaces.length === 1 ? " is" : "s are"} uncertain (amber with "?"). Check{" "}
                {unsureFaces.length === 1 ? "it" : "each"} before confirming.
              </span>
              <span className="ml-auto font-medium whitespace-nowrap">Review →</span>
            </button>
          )}
          {session.photo && (
            <PhotoViewer
              session={session}
              assign={assign}
              roster={rosterById}
              selected={selected}
              onSelect={select}
              isUnsure={isUnsure}
            />
          )}
        </div>
        <Card className="animate-rise grid content-start gap-4 self-start p-5 [animation-delay:120ms] lg:sticky lg:top-20">
          <div className="bg-sunken grid grid-cols-2 gap-1 rounded-lg p-1 text-sm">
            <button
              onClick={() => setPanel("register")}
              className={cx(
                "rounded-md py-1.5",
                panel === "register" ? "bg-surface font-medium shadow-sm" : "text-muted",
              )}
            >
              Register{" "}
              <span className="num text-muted text-xs">
                {present.size}/{session.roster.length}
              </span>
            </button>
            <button
              onClick={() => setPanel("face")}
              className={cx("rounded-md py-1.5", panel === "face" ? "bg-surface font-medium shadow-sm" : "text-muted")}
            >
              Selected face
            </button>
          </div>
          {panel === "register" ? (
            <RegisterPanel
              session={session}
              present={present}
              faceOf={faceOf}
              onToggle={toggle}
              onSetAll={(ids) => setPresent(new Set(ids))}
            />
          ) : selectedFace ? (
            <FacePanel
              session={session}
              face={selectedFace}
              assign={assign}
              roster={session.roster}
              unsure={isUnsure(selectedFace)}
              onAssign={assignFace}
              onAccept={accept}
            />
          ) : (
            <p className="text-muted py-10 text-center text-sm">Click a face on the photo or below.</p>
          )}
        </Card>
      </div>

      <section className="grid gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-semibold">Every detected face</h2>
          <div className="bg-sunken flex gap-1 rounded-lg p-1 text-sm">
            {(
              [
                ["all", `All ${session.faces.length}`],
                ["named", `Named ${named}`],
                ["unknown", `Unknown ${unknown}`],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setFilter(key)}
                className={cx(
                  "rounded-md px-3 py-1",
                  filter === key ? "bg-surface font-medium shadow-sm" : "text-muted",
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(88px,1fr))] gap-2">
          {shownFaces.map((f) => {
            const who = assign[f.index];
            const unsure = isUnsure(f);
            return (
              <button
                key={f.index}
                onClick={() => {
                  select(f.index);
                  viewer.current?.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
                className={cx(
                  "bg-surface hover:border-ink/30 grid gap-1 rounded-xl border p-1.5 text-left transition",
                  selected === f.index
                    ? "border-ink ring-ink/10 ring-2"
                    : unsure
                      ? "border-warn/60"
                      : who != null
                        ? "border-signal/50"
                        : "border-line",
                )}
              >
                <img
                  src={faceUrl(session.id, f.index)}
                  alt=""
                  loading="lazy"
                  className="aspect-square w-full rounded-lg object-cover"
                />
                <span
                  className={cx(
                    "truncate px-0.5 text-[11px]",
                    unsure ? "text-warn font-medium" : who != null ? "text-signal font-medium" : "text-faint",
                  )}
                >
                  {who != null
                    ? `${rosterById.get(who)?.name ?? "Left course"}${unsure ? "?" : ""}`
                    : `#${f.index + 1} unknown`}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <div className="border-line bg-paper/90 fixed inset-x-0 bottom-0 z-20 border-t backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
          <span className="text-sm">
            <span className="num font-semibold">{present.size}</span>
            <span className="text-muted"> of {session.roster.length} students will be marked present</span>
          </span>
          <div className="ml-auto flex gap-2">
            <Button
              variant="ghost"
              size="sm"
              icon={<Trash2 className="size-3.5" />}
              onClick={() => setDiscarding(true)}
            >
              Discard
            </Button>
            <Button variant="signal" icon={<Check className="size-4" />} onClick={() => setConfirming(true)}>
              Confirm attendance
            </Button>
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        title="Confirm attendance?"
        description={`${present.size} present, ${session.roster.length - present.size} absent. The class photo and face crops are deleted afterwards; you can still edit individual marks.`}
        cancelLabel="Keep reviewing"
        confirmLabel="Confirm"
        tone="signal"
        loading={confirm.isPending}
        onConfirm={() => confirm.mutate()}
      />
      <ConfirmDialog
        open={discarding}
        onClose={() => setDiscarding(false)}
        title="Discard this draft?"
        description="The photo and all detected faces are deleted. No attendance is recorded."
        confirmLabel="Discard"
        loading={discard.isPending}
        onConfirm={() => discard.mutate()}
      />
    </div>
  );
}
