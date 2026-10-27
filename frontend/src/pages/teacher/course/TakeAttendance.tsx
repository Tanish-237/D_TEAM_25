import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Camera, Check, ImageUp, Loader2 } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { Button, cx, Dialog, Field } from "../../../components/ui";
import { api } from "../../../lib/api";

const STAGES = [
  ["Reading photo", "decode, fix rotation"],
  ["Detecting faces", "SCRFD on 1280 px tiles + full view"],
  ["Aligning", "5 landmarks → 112×112"],
  ["Embedding", "ArcFace ResNet-50, 512-d"],
  ["Matching", "cosine vs. degraded gallery"],
  ["Assigning", "Hungarian, one face per student"],
] as const;

/** The pipeline stages, ticked off while the server works (timed to a typical CPU run). */
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
              <Check className="text-signal size-4" />
            ) : i === stage ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <span className="bg-faint size-1.5 rounded-full" />
            )}
          </span>
          <span className="text-sm font-medium">{title}</span>
          <span className="text-muted ml-auto text-xs">{detail}</span>
        </li>
      ))}
    </ol>
  );
}

/** Upload a class photo; the server detects and recognises faces and returns a draft to review. */
export function TakeAttendance({ courseId, open, onClose }: { courseId: number; open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const client = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const pick = (f: File | undefined) => {
    if (!f) return;
    setFile(f);
    // Browsers cannot display HEIC, so those get a file card instead of a preview.
    setPreview(/\.hei[cf]$/i.test(f.name) ? null : URL.createObjectURL(f));
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
      description={upload.isPending ? "Usually done in a few seconds." : "Upload one photo of the whole class."}
    >
      {upload.isPending ? (
        <div className="grid gap-5 sm:grid-cols-[1fr_1.1fr]">
          <div className="bg-sunken relative overflow-hidden rounded-xl">
            {preview ? (
              <img src={preview} alt="" className="size-full object-cover" />
            ) : (
              <div className="text-faint grid aspect-[4/3] place-items-center">
                <Camera className="size-8" />
              </div>
            )}
            <div className="absolute inset-0 overflow-hidden">
              <div className="animate-scan via-signal/25 h-1/2 w-full bg-gradient-to-b from-transparent to-transparent" />
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
            {file && preview ? (
              <img src={preview} alt="" className="max-h-72 w-full object-contain" />
            ) : file ? (
              <span className="grid justify-items-center gap-2 text-sm">
                <ImageUp className="text-signal size-7" />
                <span className="font-medium">{file.name}</span>
                <span className="text-muted">HEIC photo, ready to upload</span>
              </span>
            ) : (
              <span className="text-muted grid justify-items-center gap-2 p-6 text-sm">
                <ImageUp className="size-7" />
                <span>
                  <span className="text-ink font-medium">Drop the class photo here</span> or click to choose
                </span>
                <span className="text-xs">JPEG, PNG or HEIC · full phone resolution works best</span>
              </span>
            )}
          </button>
          <input
            ref={input}
            type="file"
            accept="image/*,.heic,.heif"
            hidden
            onChange={(e) => pick(e.target.files?.[0])}
          />
          <div className="grid gap-3 sm:grid-cols-[180px_1fr]">
            <Field
              label="Date"
              name="date"
              type="date"
              defaultValue={new Date().toLocaleDateString("en-CA")}
              required
            />
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
