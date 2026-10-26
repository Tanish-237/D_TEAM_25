import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRight,
  Camera,
  CameraOff,
  Check,
  CircleAlert,
  Loader2,
  RotateCcw,
  ShieldCheck,
  Upload,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { toast } from "sonner";
import { PageHeader } from "../../components/Layout";
import { Button, Card, cx, PageLoader } from "../../components/ui";
import { api, ApiError, type EnrollmentStep, type PhotoCheck } from "../../lib/api";

interface Shot {
  blob: Blob;
  url: string;
  check: PhotoCheck | null;
  checking: boolean;
}

// A small head diagram for each pose, so the instruction is visual too.
function PoseGlyph({ step }: { step: string }) {
  const turn = step === "left" ? -1 : step === "right" ? 1 : 0;
  return (
    <svg viewBox="0 0 64 64" className="size-14" aria-hidden>
      <ellipse cx="32" cy="30" rx="15" ry="18" className="fill-sunken stroke-line" strokeWidth="1.5" />
      <circle cx={26 + turn * 5} cy="27" r="1.8" className="fill-ink" />
      <circle cx={38 + turn * 5} cy="27" r="1.8" className="fill-ink" />
      <path d={`M${32 + turn * 7} 30 l${turn * 2} 6 h${-3 - turn}`} className="stroke-ink" strokeWidth="1.5" fill="none" strokeLinecap="round" />
      {step === "light" && (
        <g className="stroke-warn" strokeWidth="2" strokeLinecap="round">
          <path d="M54 8v5M60 14h-5M58 9l-3 3" />
        </g>
      )}
      {turn !== 0 && (
        <path
          d={turn < 0 ? "M14 52 q-6 -8 0 -16" : "M50 52 q6 -8 0 -16"}
          className="stroke-signal"
          strokeWidth="2"
          fill="none"
          strokeLinecap="round"
        />
      )}
    </svg>
  );
}

function CameraCapture({ onCapture }: { onCapture: (blob: Blob) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [state, setState] = useState<"starting" | "live" | "denied">("starting");
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    let stream: MediaStream | null = null;
    navigator.mediaDevices
      ?.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 960 }, facingMode: "user" } })
      .then((s) => {
        stream = s;
        if (video.current) video.current.srcObject = s;
        setState("live");
      })
      .catch(() => setState("denied"));
    if (!navigator.mediaDevices) setState("denied");
    return () => stream?.getTracks().forEach((t) => t.stop());
  }, []);

  const snap = () => {
    const v = video.current;
    if (!v) return;
    const canvas = document.createElement("canvas");
    canvas.width = v.videoWidth;
    canvas.height = v.videoHeight;
    canvas.getContext("2d")!.drawImage(v, 0, 0);
    canvas.toBlob((blob) => blob && onCapture(blob), "image/jpeg", 0.92);
  };

  const countdown = () => {
    let n = 3;
    setCount(n);
    const timer = setInterval(() => {
      n -= 1;
      if (n === 0) {
        clearInterval(timer);
        setCount(null);
        snap();
      } else setCount(n);
    }, 700);
  };

  if (state === "denied") {
    return (
      <div className="grid aspect-[4/3] place-items-center rounded-xl bg-sunken p-6 text-center">
        <div className="grid justify-items-center gap-2 text-sm text-muted">
          <CameraOff className="size-6" />
          Camera not available. Upload a photo instead.
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-3">
      <div className="relative aspect-[4/3] overflow-hidden rounded-xl bg-black">
        <video ref={video} autoPlay playsInline muted className="size-full -scale-x-100 object-cover" />
        {/* face guide */}
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <div className="brackets aspect-[3/4] h-[62%] text-white/80" />
        </div>
        {state === "starting" && (
          <div className="absolute inset-0 grid place-items-center text-white/70">
            <Loader2 className="size-6 animate-spin" />
          </div>
        )}
        {count !== null && (
          <div className="num absolute inset-0 grid place-items-center text-7xl font-semibold text-white drop-shadow">
            {count}
          </div>
        )}
      </div>
      <Button onClick={countdown} disabled={state !== "live" || count !== null} icon={<Camera className="size-4" />}>
        Take photo
      </Button>
    </div>
  );
}

export default function RegisterFace() {
  const navigate = useNavigate();
  const client = useQueryClient();
  const { data: steps } = useQuery({
    queryKey: ["face-steps"],
    queryFn: () => api<EnrollmentStep[]>("/student/face/steps"),
    staleTime: Infinity,
  });
  const [current, setCurrent] = useState(0);
  const [shots, setShots] = useState<Record<string, Shot>>({});
  const [mode, setMode] = useState<"camera" | "upload">("camera");
  const fileInput = useRef<HTMLInputElement>(null);

  const save = useMutation({
    mutationFn: () => {
      const form = new FormData();
      for (const step of steps!) form.append(step.key, shots[step.key]!.blob, `${step.key}.jpg`);
      return api("/student/face", { form });
    },
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["student"] });
      toast.success("Face registered. Your photos were not stored.");
      navigate("/student");
    },
    onError: (error) => {
      const failed = (error as ApiError).data as { failed?: { step: string; message: string }[] };
      if (failed?.failed?.length) {
        const first = failed.failed[0]!;
        setShots((prev) => ({
          ...prev,
          [first.step]: { ...prev[first.step]!, check: { ok: false, message: first.message, yaw: 0, preview: null } },
        }));
        setCurrent(steps!.findIndex((s) => s.key === first.step));
        toast.error(first.message);
      } else toast.error(error.message);
    },
  });

  if (!steps) return <PageLoader />;
  const step = steps[current]!;
  const shot = shots[step.key];
  const allOk = steps.every((s) => shots[s.key]?.check?.ok);

  const check = async (blob: Blob) => {
    const key = step.key;
    const url = URL.createObjectURL(blob);
    setShots((prev) => ({ ...prev, [key]: { blob, url, check: null, checking: true } }));
    const form = new FormData();
    form.append("step", key);
    form.append("photo", blob, `${key}.jpg`);
    try {
      const result = await api<PhotoCheck>("/student/face/check", { form });
      setShots((prev) => ({ ...prev, [key]: { blob, url, check: result, checking: false } }));
    } catch (e) {
      setShots((prev) => ({
        ...prev,
        [key]: { blob, url, check: { ok: false, message: (e as Error).message, yaw: 0, preview: null }, checking: false },
      }));
    }
  };

  const retake = () =>
    setShots((prev) => {
      const next = { ...prev };
      delete next[step.key];
      return next;
    });

  return (
    <>
      <PageHeader
        eyebrow="Face registration"
        title="Four photos, checked as you go"
        actions={
          <Link to="/student">
            <Button variant="ghost" icon={<ArrowLeft className="size-4" />}>
              Back
            </Button>
          </Link>
        }
      >
        Each photo is checked for one clear face, size, sharpness, light and head turn. Only a numeric
        signature is saved; the photos are discarded.
      </PageHeader>

      <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
        {/* stepper */}
        <ol className="grid content-start gap-1 animate-rise">
          {steps.map((s, i) => {
            const st = shots[s.key];
            const status = st?.checking ? "checking" : st?.check?.ok ? "ok" : st?.check ? "fail" : "todo";
            return (
              <li key={s.key}>
                <button
                  onClick={() => setCurrent(i)}
                  className={cx(
                    "flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition",
                    i === current ? "bg-surface shadow-sm ring-1 ring-line" : "hover:bg-sunken",
                  )}
                >
                  <span
                    className={cx(
                      "grid size-7 shrink-0 place-items-center rounded-full text-xs font-semibold",
                      status === "ok" && "bg-signal text-white dark:text-black",
                      status === "fail" && "bg-danger-soft text-danger",
                      status === "checking" && "bg-sunken",
                      status === "todo" && (i === current ? "bg-ink text-paper" : "bg-sunken text-muted"),
                    )}
                  >
                    {status === "ok" ? (
                      <Check className="size-3.5" />
                    ) : status === "fail" ? (
                      "!"
                    ) : status === "checking" ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      i + 1
                    )}
                  </span>
                  <span className="grid min-w-0">
                    <span className="truncate text-sm font-medium">{s.title}</span>
                    <span className="text-xs text-muted">
                      {status === "ok" ? "Accepted" : status === "fail" ? "Needs a retake" : status === "checking" ? "Checking…" : "Not taken"}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
          <li className="mt-4">
            <Button
              className="w-full"
              variant="signal"
              disabled={!allOk}
              loading={save.isPending}
              icon={<ShieldCheck className="size-4" />}
              onClick={() => save.mutate()}
            >
              Save my face
            </Button>
            {!allOk && <p className="mt-2 text-center text-xs text-muted">All four photos must be accepted.</p>}
          </li>
        </ol>

        {/* current step */}
        <Card key={step.key} className="grid gap-6 p-6 animate-rise">
          <div className="flex items-center gap-4">
            <PoseGlyph step={step.key} />
            <div className="grid gap-1">
              <span className="label">
                Step {current + 1} of {steps.length}
              </span>
              <h2 className="text-lg font-semibold">{step.title}</h2>
              <p className="text-sm text-muted">{step.instruction}</p>
            </div>
          </div>

          {!shot ? (
            <div className="grid gap-4">
              <div className="flex gap-1 justify-self-start rounded-lg bg-sunken p-1 text-sm">
                {(["camera", "upload"] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => setMode(m)}
                    className={cx("rounded-md px-3 py-1", mode === m ? "bg-surface font-medium shadow-sm" : "text-muted")}
                  >
                    {m === "camera" ? "Webcam" : "Upload file"}
                  </button>
                ))}
              </div>
              {mode === "camera" ? (
                <div className="w-full max-w-xl">
                  <CameraCapture onCapture={check} />
                </div>
              ) : (
                <button
                  onClick={() => fileInput.current?.click()}
                  className="grid aspect-[4/3] w-full max-w-xl place-items-center rounded-xl border-2 border-dashed border-line text-muted transition hover:border-ink/30 hover:text-ink"
                >
                  <span className="grid justify-items-center gap-2 text-sm">
                    <Upload className="size-6" />
                    Choose a photo (JPEG, PNG or HEIC)
                  </span>
                </button>
              )}
              <input
                ref={fileInput}
                type="file"
                accept="image/*,.heic,.heif"
                hidden
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) check(file);
                  e.target.value = "";
                }}
              />
            </div>
          ) : (
            <div className="grid gap-5">
              <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
                <div className="relative overflow-hidden rounded-xl bg-sunken">
                  <img src={shot.url} alt="" className="aspect-[4/3] max-h-[420px] w-full object-cover" />
                  {shot.checking && (
                    <div className="absolute inset-0 overflow-hidden bg-black/20">
                      <div className="h-1/2 w-full animate-scan bg-gradient-to-b from-transparent via-white/30 to-transparent" />
                    </div>
                  )}
                </div>
                <div className="grid content-start justify-items-center gap-2">
                  <span className="label">What we see</span>
                  <div className="brackets grid size-28 place-items-center rounded-md bg-sunken p-1.5 text-signal">
                    {shot.check?.preview ? (
                      <img src={shot.check.preview} alt="Aligned face" className="size-full rounded" />
                    ) : shot.checking ? (
                      <Loader2 className="size-5 animate-spin text-faint" />
                    ) : (
                      <CircleAlert className="size-5 text-faint" />
                    )}
                  </div>
                  <span className="text-center text-[11px] text-muted">
                    aligned 112×112
                    {shot.check && shot.check.preview && (
                      <>
                        <br />
                        yaw <span className="num">{shot.check.yaw.toFixed(2)}</span>
                      </>
                    )}
                  </span>
                </div>
              </div>
              {shot.check && (
                <div
                  className={cx(
                    "flex items-center gap-3 rounded-xl px-4 py-3 text-sm",
                    shot.check.ok ? "bg-signal-soft text-signal" : "bg-danger-soft text-danger",
                  )}
                >
                  {shot.check.ok ? <Check className="size-4 shrink-0" /> : <CircleAlert className="size-4 shrink-0" />}
                  <span className="font-medium">{shot.check.message}</span>
                </div>
              )}
              <div className="flex flex-wrap justify-between gap-2">
                <Button variant="secondary" icon={<RotateCcw className="size-4" />} onClick={retake} disabled={shot.checking}>
                  Retake
                </Button>
                {current < steps.length - 1 && (
                  <Button
                    onClick={() => setCurrent(current + 1)}
                    disabled={!shot.check?.ok}
                    icon={<ArrowRight className="size-4" />}
                    className="flex-row-reverse"
                  >
                    Next step
                  </Button>
                )}
              </div>
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
