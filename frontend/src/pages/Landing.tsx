import {
  ArrowRight,
  Camera,
  CheckCheck,
  Grid3x3,
  ScanFace,
  ShieldCheck,
  Sparkles,
  Trash2,
  UserCheck,
  Users,
} from "lucide-react";
import { Link, Navigate } from "react-router";
import { Logo, ThemeToggle } from "../components/Layout";
import { Button, cx } from "../components/ui";
import { homeFor, useAuth } from "../lib/auth";

// ------------------------------------------------------------------ hero illustration

interface Seat {
  x: number;
  y: number;
  s: number;
  roll?: string;
}

// Four rows of a lecture hall, back rows smaller. Some seats are enrolled students.
const ROWS: { y: number; s: number; n: number; enrolled: Record<number, string> }[] = [
  { y: 92, s: 0.42, n: 11, enrolled: { 2: "3298", 8: "3350" } },
  { y: 142, s: 0.56, n: 9, enrolled: { 4: "3259" } },
  { y: 205, s: 0.74, n: 7, enrolled: { 1: "3288", 5: "3301" } },
  { y: 285, s: 0.96, n: 5, enrolled: { 3: "3274" } },
];

const SEATS: Seat[] = ROWS.flatMap((row) =>
  Array.from({ length: row.n }, (_, i) => {
    const span = 460 * (0.6 + row.s * 0.38);
    const x = 280 - span / 2 + (span / (row.n - 1)) * i + (row.y % 7) - 3;
    return { x, y: row.y, s: row.s, roll: row.enrolled[i] };
  }),
);

function ClassroomIllustration() {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-line bg-surface shadow-[0_30px_80px_-40px_rgb(0_0_0/0.35)]">
      <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
        <div className="flex items-center gap-2 text-xs text-muted">
          <Camera className="size-3.5" />
          <span className="num">IMG_8694.HEIC</span>
        </div>
        <div className="flex items-center gap-3 text-[11px]">
          <span className="flex items-center gap-1.5 text-signal">
            <span className="size-2 rounded-[2px] border-2 border-current" /> enrolled
          </span>
          <span className="flex items-center gap-1.5 text-faint">
            <span className="size-2 rounded-[2px] border-2 border-dashed border-current" /> unknown
          </span>
        </div>
      </div>
      <div className="relative">
        <svg viewBox="0 0 560 345" className="block w-full" role="img" aria-label="Illustration of a class photo with detected faces">
          <defs>
            <linearGradient id="floor" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" className="[stop-color:var(--sunken)]" />
              <stop offset="1" className="[stop-color:var(--surface)]" />
            </linearGradient>
          </defs>
          <rect width="560" height="345" fill="url(#floor)" />
          {/* board */}
          <rect x="150" y="18" width="260" height="44" rx="3" className="fill-line" />
          {ROWS.map((row) => (
            <rect
              key={row.y}
              x={20}
              y={row.y + 30 * row.s}
              width={520}
              height={10 * row.s}
              rx={2}
              className="fill-line"
              opacity={0.7}
            />
          ))}
          {SEATS.map((seat, i) => {
            const r = 13 * seat.s;
            const delay = 0.25 + (i % 9) * 0.11 + (seat.y > 200 ? 0.4 : 0);
            const enrolled = Boolean(seat.roll);
            const box = { x: seat.x - r * 1.35, y: seat.y - r * 1.5, w: r * 2.7, h: r * 3 };
            return (
              <g key={i}>
                <path
                  d={`M${seat.x - r * 1.9} ${seat.y + r * 2.6} q0 ${-r * 1.6} ${r * 1.9} ${-r * 1.6} q${r * 1.9} 0 ${r * 1.9} ${r * 1.6}z`}
                  className="fill-faint"
                  opacity={0.35}
                />
                <circle cx={seat.x} cy={seat.y} r={r} className="fill-faint" opacity={0.55} />
                <g
                  className="animate-rise"
                  style={{ animationDelay: `${delay}s` }}
                >
                  <rect
                    x={box.x}
                    y={box.y}
                    width={box.w}
                    height={box.h}
                    rx={2}
                    fill="none"
                    strokeWidth={enrolled ? 1.8 : 1.1}
                    strokeDasharray={enrolled ? undefined : "3 2.5"}
                    className={enrolled ? "stroke-signal" : "stroke-faint"}
                  />
                  {enrolled && (
                    <g>
                      <rect
                        x={box.x - 0.9}
                        y={box.y - 13 * Math.max(seat.s, 0.6)}
                        width={44 * Math.max(seat.s, 0.6)}
                        height={12 * Math.max(seat.s, 0.6)}
                        rx={2}
                        className="fill-signal"
                      />
                      <text
                        x={box.x + 3}
                        y={box.y - 4 * Math.max(seat.s, 0.6)}
                        fontSize={8.5 * Math.max(seat.s, 0.6)}
                        className="fill-white font-mono font-semibold dark:fill-black"
                      >
                        {seat.roll}
                      </text>
                    </g>
                  )}
                </g>
              </g>
            );
          })}
        </svg>
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="h-1/2 w-full animate-scan bg-gradient-to-b from-transparent via-signal/10 to-transparent" />
        </div>
      </div>
      <div className="grid grid-cols-3 divide-x divide-line border-t border-line text-center">
        {[
          ["32", "faces found"],
          ["6", "students named"],
          ["26", "marked unknown"],
        ].map(([n, label]) => (
          <div key={label} className="py-3">
            <div className="num text-lg font-semibold">{n}</div>
            <div className="text-[11px] text-muted">{label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ page

const STEPS = [
  {
    icon: Grid3x3,
    title: "Detect, in tiles",
    body: "The photo is scanned in overlapping 1280 px tiles at full resolution, so faces 30 px tall at the back of the room are still found.",
    ours: true,
  },
  {
    icon: ScanFace,
    title: "Align and embed",
    body: "Five landmarks align every face to a 112 × 112 template; a frozen ArcFace network turns it into a 512-number signature.",
  },
  {
    icon: Sparkles,
    title: "Match against a degraded gallery",
    body: "Each student's enrollment photos are stored with blurred, darkened and shrunk copies, so they resemble a back-row classroom face.",
    ours: true,
  },
  {
    icon: UserCheck,
    title: "Assign one face per student",
    body: "The Hungarian method assigns names jointly across the whole photo: no student can be claimed twice, and strangers stay unknown.",
    ours: true,
  },
  {
    icon: CheckCheck,
    title: "Teacher confirms",
    body: "The draft register is ticked for you. Review each face next to its proposed name, fix anything, confirm. The photo is then deleted.",
  },
];

export default function Landing() {
  const { user, loading } = useAuth();
  if (!loading && user) return <Navigate to={homeFor(user)} replace />;

  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4 sm:px-6">
        <Logo />
        <nav className="hidden items-center gap-6 text-sm text-muted md:flex">
          <a href="#how" className="hover:text-ink">How it works</a>
          <a href="#results" className="hover:text-ink">Results</a>
          <a href="#privacy" className="hover:text-ink">Privacy</a>
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <ThemeToggle />
          <Link to="/login" className="hidden sm:block">
            <Button variant="ghost" size="sm">Log in</Button>
          </Link>
          <Link to="/signup">
            <Button size="sm">Get started</Button>
          </Link>
        </div>
      </header>

      {/* hero */}
      <section className="mx-auto grid max-w-6xl items-center gap-12 px-4 pt-10 pb-20 sm:px-6 lg:grid-cols-[1fr_1.1fr] lg:pt-16">
        <div className="grid gap-6 animate-rise">
          <span className="label flex items-center gap-2">
            <span className="size-1.5 rounded-full bg-signal" /> Face recognition attendance
          </span>
          <h1 className="text-4xl font-semibold leading-[1.05] sm:text-5xl lg:text-[56px]">
            One photo.
            <br />
            <span className="text-muted">The whole register.</span>
          </h1>
          <p className="max-w-md text-[17px] leading-relaxed text-muted">
            Take a single photograph of the lecture hall. QuickPic finds every face, recognises the
            students enrolled in your course, and leaves everyone else as unknown. You review the
            list and confirm.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link to="/signup">
              <Button size="lg" icon={<ArrowRight className="size-4" />} className="flex-row-reverse">
                Create an account
              </Button>
            </Link>
            <Link to="/login">
              <Button size="lg" variant="secondary">
                Log in
              </Button>
            </Link>
          </div>
        </div>
        <div className="animate-rise [animation-delay:120ms]">
          <ClassroomIllustration />
        </div>
      </section>

      {/* results */}
      <section id="results" className="border-y border-line bg-surface">
        <div className="mx-auto grid max-w-6xl grid-cols-2 gap-y-8 px-4 py-10 sm:px-6 md:grid-cols-4">
          {[
            ["0.973", "attendance F1", "on 10 real class photos"],
            ["97.1%", "faces detected", "of 795 labelled, with tiling"],
            ["21 → 2", "strangers misnamed", "baseline vs. QuickPic"],
            ["6.3 s", "per class photo", "88 faces, laptop CPU"],
          ].map(([value, label, sub]) => (
            <div key={label} className="grid gap-1 border-l border-line pl-5">
              <span className="num text-3xl font-semibold tracking-tight">{value}</span>
              <span className="text-sm font-medium">{label}</span>
              <span className="text-xs text-muted">{sub}</span>
            </div>
          ))}
        </div>
      </section>

      {/* how */}
      <section id="how" className="mx-auto max-w-6xl px-4 py-24 sm:px-6">
        <div className="mb-12 grid max-w-2xl gap-3">
          <span className="label">How it works</span>
          <h2 className="text-3xl font-semibold">Frozen networks, a classroom-aware decision layer</h2>
          <p className="text-muted">
            The detector and recogniser are pretrained and never retrained. What we built is the
            layer between them and the register, marked <span className="font-medium text-signal">ours</span>.
          </p>
        </div>
        <ol className="grid gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-2 lg:grid-cols-5">
          {STEPS.map((step, i) => (
            <li key={step.title} className="grid content-start gap-4 bg-surface p-6">
              <div className="flex items-center justify-between">
                <span className="num text-xs text-faint">0{i + 1}</span>
                {step.ours && (
                  <span className="rounded-full border border-signal/30 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-signal uppercase">
                    ours
                  </span>
                )}
              </div>
              <step.icon className={cx("size-6", step.ours ? "text-signal" : "text-ink")} strokeWidth={1.6} />
              <div className="grid gap-2">
                <h3 className="font-semibold">{step.title}</h3>
                <p className="text-sm leading-relaxed text-muted">{step.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* roles */}
      <section className="mx-auto grid max-w-6xl gap-4 px-4 pb-24 sm:px-6 md:grid-cols-2">
        <div className="grid gap-4 rounded-2xl border border-line bg-surface p-8">
          <Users className="size-6" strokeWidth={1.6} />
          <h3 className="text-xl font-semibold">For teachers</h3>
          <ul className="grid gap-2 text-sm text-muted">
            <li>Create a course; students join with its six-letter code.</li>
            <li>Upload the class photo; get a pre-ticked register in seconds.</li>
            <li>Every face is shown on the photo with its proposed name.</li>
            <li>Per-student percentages, session history and CSV export.</li>
          </ul>
        </div>
        <div className="grid gap-4 rounded-2xl border border-line bg-surface p-8">
          <ScanFace className="size-6" strokeWidth={1.6} />
          <h3 className="text-xl font-semibold">For students</h3>
          <ul className="grid gap-2 text-sm text-muted">
            <li>Register your face with four guided photos, from the webcam or files.</li>
            <li>Each photo is checked instantly: size, sharpness, light and head turn.</li>
            <li>See your attendance in every course, lecture by lecture.</li>
            <li>Delete your face data at any time with one click.</li>
          </ul>
        </div>
      </section>

      {/* privacy */}
      <section id="privacy" className="border-t border-line bg-surface">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-20 sm:px-6 lg:grid-cols-[1fr_2fr]">
          <div className="grid content-start gap-3">
            <span className="label">Privacy by design</span>
            <h2 className="text-3xl font-semibold">Signatures, not photos</h2>
          </div>
          <div className="grid gap-6 sm:grid-cols-3">
            {[
              [ShieldCheck, "No enrollment photos kept", "Registration photos are turned into embeddings in memory and discarded."],
              [Trash2, "Class photo deleted", "The photo and face crops are deleted the moment the teacher confirms."],
              [Camera, "Runs on one laptop", "No cloud service. Everything, including the models, runs locally on CPU."],
            ].map(([Icon, title, body]) => {
              const I = Icon as typeof ShieldCheck;
              return (
                <div key={title as string} className="grid content-start gap-2">
                  <I className="size-5 text-signal" strokeWidth={1.8} />
                  <h3 className="font-medium">{title as string}</h3>
                  <p className="text-sm leading-relaxed text-muted">{body as string}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <footer className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-10 text-xs text-muted sm:px-6">
        <span>
          IPCV · Semester VII · Team 25 · MNNIT Allahabad
        </span>
        <span>Tanish Mittal · Shashank Kanaujiya · Utkarsh Raj Singh · Shinde Ritesh Tirupati</span>
      </footer>
    </div>
  );
}
