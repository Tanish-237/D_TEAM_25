import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Check,
  CircleHelp,
  Eye,
  EyeOff,
  Pencil,
  ScanFace,
  Search,
  ShieldCheck,
  Timer,
  Trash2,
  UserX,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useMemo, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { toast } from "sonner";
import { Avatar, Badge, Button, Card, cx, Dialog, Field, Input, PageLoader } from "../../components/ui";
import { api, formatDate, type Face, type RosterEntry, type SessionDetail } from "../../lib/api";

type Assignments = Record<number, number | null>;

function faceUrl(sessionId: number, index: number) {
  return `/api/teacher/sessions/${sessionId}/faces/${index}`;
}

// ------------------------------------------------------------------ photo with boxes

function PhotoViewer({
  session,
  assign,
  roster,
  selected,
  onSelect,
  isUnsure,
}: {
  session: SessionDetail;
  assign: Assignments;
  roster: Map<number, RosterEntry>;
  selected: number | null;
  onSelect: (index: number) => void;
  isUnsure: (face: Face) => boolean;
}) {
  const [zoom, setZoom] = useState(1);
  const [boxes, setBoxes] = useState(true);
  const [hover, setHover] = useState<number | null>(null);
  const { width, height } = session.photo!;
  const stroke = Math.max(width, height) / 900;

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center gap-2 border-b border-line px-4 py-2">
        <span className="text-xs text-muted">
          <span className="num">{width}×{height}</span> · click a face to edit
        </span>
        <div className="ml-auto flex items-center gap-1">
          <button onClick={() => setBoxes(!boxes)} className="grid size-8 place-items-center rounded-md text-muted hover:bg-sunken hover:text-ink" title="Toggle boxes">
            {boxes ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
          </button>
          <button onClick={() => setZoom(Math.max(1, zoom - 0.5))} className="grid size-8 place-items-center rounded-md text-muted hover:bg-sunken hover:text-ink" title="Zoom out">
            <ZoomOut className="size-4" />
          </button>
          <span className="num w-10 text-center text-xs">{zoom.toFixed(1)}×</span>
          <button onClick={() => setZoom(Math.min(4, zoom + 0.5))} className="grid size-8 place-items-center rounded-md text-muted hover:bg-sunken hover:text-ink" title="Zoom in">
            <ZoomIn className="size-4" />
          </button>
        </div>
      </div>
      <div className="max-h-[70vh] overflow-auto bg-black">
        <div className="relative" style={{ width: `${zoom * 100}%` }}>
          <img src={`/api/teacher/sessions/${session.id}/photo`} alt="Class photo" className="block w-full select-none" draggable={false} />
          {boxes && (
            <svg viewBox={`0 0 ${width} ${height}`} className="absolute inset-0 size-full">
              {session.faces.map((face) => {
                const [x1, y1, x2, y2] = face.box;
                const who = assign[face.index];
                const isSel = selected === face.index;
                const named = who != null;
                const unsure = isUnsure(face);
                const color = unsure ? "#f59e0b" : "#22c55e";
                const label = named ? `${roster.get(who!)?.name ?? "Left course"}${unsure ? "?" : ""}` : "Unknown";
                return (
                  <g
                    key={face.index}
                    onClick={() => onSelect(face.index)}
                    onMouseEnter={() => setHover(face.index)}
                    onMouseLeave={() => setHover(null)}
                    className="cursor-pointer"
                    data-face={face.index}
                  >
                    <rect x={x1} y={y1} width={x2 - x1} height={y2 - y1} fill="transparent" />
                    <rect
                      x={x1}
                      y={y1}
                      width={x2 - x1}
                      height={y2 - y1}
                      rx={stroke * 2}
                      fill={isSel ? "rgb(255 255 255 / 0.12)" : "none"}
                      stroke={named ? color : "rgb(255 255 255 / 0.7)"}
                      strokeWidth={stroke * (isSel ? 3.5 : named ? 2.2 : 1.2)}
                      strokeDasharray={named ? undefined : `${stroke * 4} ${stroke * 3}`}
                    />
                    {(named || isSel || hover === face.index) && (
                      <g>
                        <rect
                          x={x1}
                          y={y1 - stroke * 16}
                          width={Math.max(label.length * stroke * 7 + stroke * 10, x2 - x1)}
                          height={stroke * 14}
                          rx={stroke * 2}
                          fill={named ? color : "rgb(24 24 27 / 0.85)"}
                        />
                        <text x={x1 + stroke * 5} y={y1 - stroke * 5.5} fontSize={stroke * 10.5} fontWeight={600} fill={named ? "#052e16" : "white"} fontFamily="Inter Variable, sans-serif">
                          {label}
                        </text>
                      </g>
                    )}
                  </g>
                );
              })}
            </svg>
          )}
        </div>
      </div>
    </Card>
  );
}

// ------------------------------------------------------------------ selected face

function FacePanel({
  session,
  face,
  assign,
  roster,
  onAssign,
  unsure,
  onAccept,
}: {
  session: SessionDetail;
  face: Face;
  assign: Assignments;
  roster: RosterEntry[];
  onAssign: (index: number, student: number | null) => void;
  unsure: boolean;
  onAccept: (index: number) => void;
}) {
  const [query, setQuery] = useState("");
  const current = assign[face.index] ?? null;
  const takenBy = useMemo(() => {
    const map = new Map<number, number>();
    for (const [index, who] of Object.entries(assign)) if (who != null) map.set(who, Number(index));
    return map;
  }, [assign]);
  const matches = roster.filter((s) => `${s.name} ${s.roll_no}`.toLowerCase().includes(query.toLowerCase()));
  return (
    <div className="grid gap-4">
      <div className="flex gap-4">
        <div className="brackets size-24 shrink-0 p-1 text-signal">
          <img src={faceUrl(session.id, face.index)} alt="" className="size-full rounded object-cover" />
        </div>
        <div className="grid content-start gap-1.5">
          <span className="label">Face #{face.index + 1}</span>
          <span className="font-semibold">{current != null ? roster.find((s) => s.id === current)?.name : "Unknown"}</span>
          <span className="text-xs text-muted">
            best similarity <span className="num text-ink">{face.score.toFixed(2)}</span>
            <br />
            height <span className="num text-ink">{face.box[3] - face.box[1]}</span> px
          </span>
        </div>
      </div>
      {unsure && current != null && (
        <div className="grid gap-2 rounded-xl bg-warn-soft px-3 py-2.5 text-sm text-warn">
          <span>
            <span className="font-medium">Not sure.</span> The match is weak, so please check this face.
          </span>
          <Button size="sm" variant="secondary" icon={<Check className="size-3.5" />} onClick={() => onAccept(face.index)}>
            Yes, this is {roster.find((s) => s.id === current)?.first_name || "them"}
          </Button>
        </div>
      )}
      <Button variant={current == null ? "secondary" : "danger"} size="sm" icon={<UserX className="size-3.5" />} disabled={current == null} onClick={() => onAssign(face.index, null)}>
        Not a student · mark unknown
      </Button>
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-faint" />
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Assign to student…" className="pl-9" />
      </div>
      <ul className="-mx-2 grid max-h-64 gap-0.5 overflow-y-auto">
        {matches.map((s) => {
          const other = takenBy.get(s.id);
          return (
            <li key={s.id}>
              <button
                onClick={() => onAssign(face.index, s.id)}
                className={cx(
                  "flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-sunken",
                  current === s.id && "bg-signal-soft",
                )}
              >
                <Avatar name={s.name} size={26} />
                <span className="min-w-0 flex-1 truncate">{s.name}</span>
                {current === s.id ? (
                  <Check className="size-4 text-signal" />
                ) : other !== undefined ? (
                  <span className="text-[11px] text-muted">on #{other + 1}</span>
                ) : !s.registered ? (
                  <span className="text-[11px] text-faint">no face data</span>
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ------------------------------------------------------------------ register

function Register({
  session,
  roster,
  present,
  faceOf,
  onToggle,
  onSetAll,
}: {
  session: SessionDetail;
  roster: RosterEntry[];
  present: Set<number>;
  faceOf: Map<number, number>;
  onToggle: (id: number) => void;
  onSetAll: (ids: number[]) => void;
}) {
  const [query, setQuery] = useState("");
  const shown = roster.filter((s) => `${s.name} ${s.roll_no}`.toLowerCase().includes(query.toLowerCase()));
  return (
    <div className="grid gap-3">
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-faint" />
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search name or roll no" className="pl-9" />
      </div>
      <div className="flex items-center gap-1 text-xs">
        <span className="mr-auto text-muted">Mark</span>
        <button onClick={() => onSetAll(roster.map((s) => s.id))} className="rounded-md px-2 py-1 font-medium text-muted hover:bg-sunken hover:text-ink">
          All
        </button>
        <button onClick={() => onSetAll([...faceOf.keys()])} className="rounded-md px-2 py-1 font-medium text-muted hover:bg-sunken hover:text-ink">
          Only seen in photo
        </button>
        <button onClick={() => onSetAll([])} className="rounded-md px-2 py-1 font-medium text-muted hover:bg-sunken hover:text-ink">
          None
        </button>
      </div>
      <ul className="-mx-2 grid max-h-[52vh] gap-0.5 overflow-y-auto">
        {shown.map((s) => {
          const on = present.has(s.id);
          const face = faceOf.get(s.id);
          return (
            <li key={s.id}>
              <button onClick={() => onToggle(s.id)} className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left hover:bg-sunken">
                {face !== undefined ? (
                  <img src={faceUrl(session.id, face)} alt="" className="size-8 shrink-0 rounded-full object-cover ring-2 ring-signal" />
                ) : (
                  <Avatar name={s.name} size={32} />
                )}
                <span className="grid min-w-0 flex-1 leading-tight">
                  <span className="truncate text-sm font-medium">{s.name}</span>
                  <span className="text-[11px] text-muted">
                    <span className="num">{s.roll_no}</span>
                    {face !== undefined ? " · seen in photo" : !s.registered ? " · no face data" : ""}
                  </span>
                </span>
                <span
                  className={cx(
                    "grid size-5 shrink-0 place-items-center rounded-md border transition",
                    on ? "border-signal bg-signal text-white dark:text-black" : "border-line",
                  )}
                >
                  {on && <Check className="size-3.5" strokeWidth={3} />}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ------------------------------------------------------------------ draft review

function Review({ session }: { session: SessionDetail }) {
  const navigate = useNavigate();
  const client = useQueryClient();
  const rosterById = useMemo(() => new Map(session.roster.map((s) => [s.id, s])), [session]);
  const [assign, setAssign] = useState<Assignments>(() =>
    Object.fromEntries(session.faces.map((f) => [f.index, f.proposed])),
  );
  const [present, setPresent] = useState<Set<number>>(
    () => new Set(session.faces.map((f) => f.proposed).filter((p): p is number => p != null)),
  );
  const [selected, setSelected] = useState<number | null>(null);
  const [checked, setChecked] = useState<Set<number>>(() => new Set());
  const [panel, setPanel] = useState<"register" | "face">("register");
  const [filter, setFilter] = useState<"all" | "named" | "unknown">("all");
  const [confirming, setConfirming] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const viewer = useRef<HTMLDivElement>(null);

  const faceOf = useMemo(() => {
    const map = new Map<number, number>();
    for (const [index, who] of Object.entries(assign)) if (who != null) map.set(who, Number(index));
    return map;
  }, [assign]);

  const named = Object.values(assign).filter((v) => v != null).length;
  // A name the system proposed with a weak score, which the teacher has not yet confirmed or changed.
  const isUnsure = (face: Face) =>
    assign[face.index] != null &&
    assign[face.index] === face.proposed &&
    face.score < session.unsure_below &&
    !checked.has(face.index);
  const unsureFaces = session.faces.filter(isUnsure);
  const accept = (index: number) => setChecked((c) => new Set(c).add(index));
  const unknown = session.faces.length - named;

  const select = (index: number) => {
    setSelected(index);
    setPanel("face");
  };

  const onAssign = (index: number, student: number | null) => {
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

  const confirm = useMutation({
    mutationFn: () => api(`/teacher/sessions/${session.id}/confirm`, { json: { present: [...present] } }),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["teacher"] });
      toast.success("Attendance confirmed. The class photo was deleted.");
      navigate(`/teacher/courses/${session.course.id}`);
    },
    onError: (e) => toast.error(e.message),
  });
  const discard = useMutation({
    mutationFn: () => api(`/teacher/sessions/${session.id}`, { method: "DELETE" }),
    onSuccess: () => {
      navigate(`/teacher/courses/${session.course.id}`);
      client.removeQueries({ queryKey: ["teacher", "session", String(session.id)] });
      client.invalidateQueries({ queryKey: ["teacher"] });
      toast("Draft discarded");
    },
  });

  const shownFaces = session.faces.filter((f) =>
    filter === "all" ? true : filter === "named" ? assign[f.index] != null : assign[f.index] == null,
  );
  const selectedFace = selected === null ? null : session.faces.find((f) => f.index === selected) ?? null;

  return (
    <div className="grid gap-6 pb-24">
      {/* summary */}
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-4 animate-rise">
        {[
          [ScanFace, session.faces.length, "faces detected"],
          [ShieldCheck, named, "named as students"],
          [CircleHelp, unknown, "left unknown"],
          [Timer, `${session.seconds}s`, "processing time"],
        ].map(([Icon, value, label]) => {
          const I = Icon as typeof ScanFace;
          return (
            <div key={label as string} className="flex items-center gap-3 bg-surface px-5 py-4">
              <I className="size-5 text-muted" strokeWidth={1.7} />
              <div className="grid leading-tight">
                <span className="num text-xl font-semibold">{value as string}</span>
                <span className="text-xs text-muted">{label as string}</span>
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]" ref={viewer}>
        <div className="min-w-0 animate-rise [animation-delay:60ms]">
          {session.photo && (
            <>
              {unsureFaces.length > 0 && (
                <button
                  onClick={() => select(unsureFaces[0]!.index)}
                  className="mb-3 flex w-full items-center gap-2 rounded-xl border border-warn/30 bg-warn-soft/60 px-4 py-2.5 text-left text-sm text-warn"
                >
                  <CircleHelp className="size-4 shrink-0" />
                  <span>
                    <span className="font-semibold">{unsureFaces.length}</span> name{unsureFaces.length === 1 ? " is" : "s are"} uncertain (amber with "?").
                    Check {unsureFaces.length === 1 ? "it" : "each"} before confirming.
                  </span>
                  <span className="ml-auto font-medium whitespace-nowrap">Review →</span>
                </button>
              )}
              <PhotoViewer session={session} assign={assign} roster={rosterById} selected={selected} onSelect={select} isUnsure={isUnsure} />
            </>
          )}
        </div>
        <Card className="grid content-start gap-4 self-start p-5 lg:sticky lg:top-20 animate-rise [animation-delay:120ms]">
          <div className="grid grid-cols-2 gap-1 rounded-lg bg-sunken p-1 text-sm">
            <button onClick={() => setPanel("register")} className={cx("rounded-md py-1.5", panel === "register" ? "bg-surface font-medium shadow-sm" : "text-muted")}>
              Register <span className="num text-xs text-muted">{present.size}/{session.roster.length}</span>
            </button>
            <button onClick={() => setPanel("face")} className={cx("rounded-md py-1.5", panel === "face" ? "bg-surface font-medium shadow-sm" : "text-muted")}>
              Selected face
            </button>
          </div>
          {panel === "register" ? (
            <Register
              session={session}
              roster={session.roster}
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
              onAssign={onAssign}
              unsure={isUnsure(selectedFace)}
              onAccept={accept}
            />
          ) : (
            <p className="py-10 text-center text-sm text-muted">Click a face on the photo or below.</p>
          )}
        </Card>
      </div>

      {/* all faces */}
      <section className="grid gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-semibold">Every detected face</h2>
          <div className="flex gap-1 rounded-lg bg-sunken p-1 text-sm">
            {(
              [
                ["all", `All ${session.faces.length}`],
                ["named", `Named ${named}`],
                ["unknown", `Unknown ${unknown}`],
              ] as const
            ).map(([key, label]) => (
              <button key={key} onClick={() => setFilter(key)} className={cx("rounded-md px-3 py-1", filter === key ? "bg-surface font-medium shadow-sm" : "text-muted")}>
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(88px,1fr))] gap-2">
          {shownFaces.map((f) => {
            const who = assign[f.index];
            return (
              <button
                key={f.index}
                onClick={() => {
                  select(f.index);
                  viewer.current?.scrollIntoView({ behavior: "smooth", block: "start" });
                }}
                className={cx(
                  "group grid gap-1 rounded-xl border bg-surface p-1.5 text-left transition hover:border-ink/30",
                  selected === f.index
                    ? "border-ink ring-2 ring-ink/10"
                    : isUnsure(f)
                      ? "border-warn/60"
                      : who != null
                        ? "border-signal/50"
                        : "border-line",
                )}
              >
                <img src={faceUrl(session.id, f.index)} alt="" loading="lazy" className="aspect-square w-full rounded-lg object-cover" />
                <span
                  className={cx(
                    "truncate px-0.5 text-[11px]",
                    isUnsure(f) ? "font-medium text-warn" : who != null ? "font-medium text-signal" : "text-faint",
                  )}
                >
                  {who != null ? `${rosterById.get(who)?.name}${isUnsure(f) ? "?" : ""}` : `#${f.index + 1} unknown`}
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {/* confirm bar */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-paper/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
          <span className="text-sm">
            <span className="num font-semibold">{present.size}</span>
            <span className="text-muted"> of {session.roster.length} students will be marked present</span>
          </span>
          <div className="ml-auto flex gap-2">
            <Button variant="ghost" size="sm" icon={<Trash2 className="size-3.5" />} onClick={() => setDiscarding(true)}>
              Discard
            </Button>
            <Button variant="signal" icon={<Check className="size-4" />} onClick={() => setConfirming(true)}>
              Confirm attendance
            </Button>
          </div>
        </div>
      </div>

      <Dialog
        open={confirming}
        onClose={() => setConfirming(false)}
        title="Confirm attendance?"
        description={`${present.size} present, ${session.roster.length - present.size} absent. The class photo and face crops are deleted afterwards; you can still edit individual marks.`}
      >
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setConfirming(false)}>Keep reviewing</Button>
          <Button variant="signal" loading={confirm.isPending} onClick={() => confirm.mutate()}>Confirm</Button>
        </div>
      </Dialog>
      <Dialog open={discarding} onClose={() => setDiscarding(false)} title="Discard this draft?" description="The photo and all detected faces are deleted. No attendance is recorded.">
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setDiscarding(false)}>Cancel</Button>
          <Button variant="danger" loading={discard.isPending} onClick={() => discard.mutate()}>Discard</Button>
        </div>
      </Dialog>
    </div>
  );
}

// ------------------------------------------------------------------ confirmed record

function Record({ session }: { session: SessionDetail }) {
  const client = useQueryClient();
  const mark = useMutation({
    mutationFn: (body: { student: number; present: boolean }) =>
      api(`/teacher/sessions/${session.id}/mark`, { json: body }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["teacher"] }),
    onError: (e) => toast.error(e.message),
  });
  const present = session.roster.filter((s) => s.present).length;
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <Card className="overflow-hidden animate-rise">
        <ul className="divide-y divide-line">
          {session.roster.map((s) => (
            <li key={s.id} className="flex items-center gap-3 px-5 py-3">
              <Avatar name={s.name} size={32} />
              <span className="grid min-w-0 flex-1 leading-tight">
                <span className="truncate text-sm font-medium">{s.name}</span>
                <span className="num text-[11px] text-muted">{s.roll_no}</span>
              </span>
              <div className="flex gap-1 rounded-lg bg-sunken p-0.5 text-xs">
                {[true, false].map((value) => (
                  <button
                    key={String(value)}
                    onClick={() => s.present !== value && mark.mutate({ student: s.id, present: value })}
                    className={cx(
                      "rounded-md px-2.5 py-1 font-medium transition",
                      s.present === value
                        ? value
                          ? "bg-signal text-white dark:text-black"
                          : "bg-danger text-white dark:text-black"
                        : "text-muted hover:text-ink",
                    )}
                  >
                    {value ? "Present" : "Absent"}
                  </button>
                ))}
              </div>
            </li>
          ))}
        </ul>
      </Card>
      <Card className="grid content-start gap-4 self-start p-6 animate-rise [animation-delay:60ms]">
        <Badge tone="signal" className="justify-self-start">
          <ShieldCheck className="size-3" /> Confirmed
        </Badge>
        <div className="grid gap-1">
          <span className="num text-4xl font-semibold">
            {present}
            <span className="text-xl text-muted">/{session.roster.length}</span>
          </span>
          <span className="text-sm text-muted">students present</span>
        </div>
        <p className="text-sm leading-relaxed text-muted">
          The class photo and face crops were deleted on confirmation. Marks can still be corrected here.
        </p>
      </Card>
    </div>
  );
}

// ------------------------------------------------------------------ page

function EditDetails({ session, open, onClose }: { session: SessionDetail; open: boolean; onClose: () => void }) {
  const client = useQueryClient();
  const save = useMutation({
    mutationFn: (body: { date: string; topic: string }) =>
      api(`/teacher/sessions/${session.id}`, { method: "PATCH", json: body }),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["teacher"] });
      toast.success("Lecture updated");
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    save.mutate({ date: String(f.get("date")), topic: String(f.get("topic")) });
  };
  return (
    <Dialog open={open} onClose={onClose} title="Edit lecture details">
      <form onSubmit={submit} className="grid gap-4">
        <Field label="Date" name="date" type="date" defaultValue={session.date} required />
        <Field label="Topic" name="topic" defaultValue={session.topic} placeholder="e.g. Hough transform" />
        <Button type="submit" loading={save.isPending}>
          Save
        </Button>
      </form>
    </Dialog>
  );
}

export default function Session() {
  const { id } = useParams();
  const navigate = useNavigate();
  const client = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const { data: session, isLoading } = useQuery({
    queryKey: ["teacher", "session", id],
    queryFn: () => api<SessionDetail>(`/teacher/sessions/${id}`),
  });
  const remove = useMutation({
    mutationFn: () => api(`/teacher/sessions/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      navigate(`/teacher/courses/${session!.course.id}`);
      // Drop the deleted lecture instead of refetching it, then refresh the lists.
      client.removeQueries({ queryKey: ["teacher", "session", id] });
      client.invalidateQueries({ queryKey: ["teacher"] });
      toast.success("Lecture and its attendance deleted");
    },
  });
  if (isLoading || !session) return <PageLoader />;
  const confirmed = session.status === "confirmed";
  return (
    <>
      <Link to={`/teacher/courses/${session.course.id}`} className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink">
        <ArrowLeft className="size-4" /> {session.course.subject}
      </Link>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3 animate-rise">
        <div className="grid gap-1.5">
          <span className="label">{confirmed ? "Attendance record" : "Review draft"}</span>
          <h1 className="text-2xl font-semibold sm:text-[28px]">
            {formatDate(session.date, "long")}
            {session.topic && <span className="text-muted"> · {session.topic}</span>}
          </h1>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" icon={<Pencil className="size-4" />} onClick={() => setEditing(true)}>
            Edit details
          </Button>
          {confirmed && (
            <Button variant="danger" icon={<Trash2 className="size-4" />} onClick={() => setDeleting(true)}>
              Delete lecture
            </Button>
          )}
        </div>
      </div>
      {confirmed ? <Record session={session} /> : <Review session={session} />}
      <EditDetails key={`${session.date}-${session.topic}`} session={session} open={editing} onClose={() => setEditing(false)} />
      <Dialog
        open={deleting}
        onClose={() => setDeleting(false)}
        title="Delete this lecture?"
        description="The lecture and its attendance marks are removed from every student's record. This cannot be undone."
      >
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setDeleting(false)}>Cancel</Button>
          <Button variant="danger" loading={remove.isPending} onClick={() => remove.mutate()}>Delete lecture</Button>
        </div>
      </Dialog>
    </>
  );
}
