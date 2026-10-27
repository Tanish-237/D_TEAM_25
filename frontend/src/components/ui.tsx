import { Loader2, Search, X } from "lucide-react";
import {
  forwardRef,
  useEffect,
  useRef,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
} from "react";

export function cx(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}

// ---------------------------------------------------------------- Button

type Variant = "primary" | "secondary" | "ghost" | "danger" | "signal";

const variants: Record<Variant, string> = {
  primary: "bg-ink text-paper hover:opacity-90",
  secondary: "bg-surface text-ink border border-line hover:bg-sunken",
  ghost: "text-muted hover:text-ink hover:bg-sunken",
  danger: "bg-surface text-danger border border-line hover:bg-danger-soft",
  signal: "bg-signal text-white hover:opacity-90 dark:text-black",
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: "sm" | "md" | "lg";
  loading?: boolean;
  icon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", loading, icon, className, children, disabled, ...rest },
  ref,
) {
  const sizes = {
    sm: "h-8 px-3 text-[13px] gap-1.5",
    md: "h-10 px-4 text-sm gap-2",
    lg: "h-12 px-6 text-[15px] gap-2",
  };
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cx(
        "inline-flex items-center justify-center rounded-lg font-medium whitespace-nowrap",
        "focus-visible:outline-signal transition focus-visible:outline-2 focus-visible:outline-offset-2",
        "cursor-pointer disabled:pointer-events-none disabled:opacity-50",
        variants[variant],
        sizes[size],
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 className="size-4 animate-spin" /> : icon}
      {children}
    </button>
  );
});

// ---------------------------------------------------------------- Form fields

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  hint?: string;
}

export const Field = forwardRef<HTMLInputElement, FieldProps>(function Field(
  { label, hint, className, id, ...rest },
  ref,
) {
  const inputId = id ?? rest.name;
  return (
    <label htmlFor={inputId} className={cx("grid gap-1.5", className)}>
      <span className="text-ink text-[13px] font-medium">{label}</span>
      <Input ref={ref} id={inputId} {...rest} />
      {hint && <span className="text-muted text-xs">{hint}</span>}
    </label>
  );
});

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, ...rest },
  ref,
) {
  return (
    <input
      ref={ref}
      className={cx(
        "border-line bg-surface text-ink h-10 w-full min-w-0 rounded-lg border px-3 text-sm",
        "placeholder:text-faint transition outline-none",
        "focus:border-ink/40 focus:ring-ink/5 focus:ring-4",
        className,
      )}
      {...rest}
    />
  );
});

// ---------------------------------------------------------------- Surfaces

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cx("border-line bg-surface rounded-2xl border", className)}>{children}</div>;
}

export function Badge({
  tone = "neutral",
  children,
  className,
}: {
  tone?: "neutral" | "signal" | "warn" | "danger";
  children: ReactNode;
  className?: string;
}) {
  const tones = {
    neutral: "bg-sunken text-muted",
    signal: "bg-signal-soft text-signal",
    warn: "bg-warn-soft text-warn",
    danger: "bg-danger-soft text-danger",
  };
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Avatar({ name, size = 36 }: { name: string; size?: number }) {
  const letters = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
  return (
    <span
      className="bg-sunken text-muted inline-grid shrink-0 place-items-center rounded-full font-semibold"
      style={{ width: size, height: size, fontSize: size * 0.36 }}
    >
      {letters}
    </span>
  );
}

function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cx("text-faint size-5 animate-spin", className)} />;
}

export function PageLoader() {
  return (
    <div className="grid min-h-[50vh] place-items-center">
      <Spinner />
    </div>
  );
}

export function Empty({
  icon,
  title,
  children,
  action,
}: {
  icon: ReactNode;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="border-line grid place-items-center gap-3 rounded-2xl border border-dashed px-6 py-12 text-center">
      <div className="bg-sunken text-muted grid size-11 place-items-center rounded-xl">{icon}</div>
      <div className="grid gap-1">
        <p className="font-medium">{title}</p>
        {children && <p className="text-muted max-w-sm text-sm">{children}</p>}
      </div>
      {action}
    </div>
  );
}

export function ProgressRing({
  value,
  size = 56,
  stroke = 5,
}: {
  value: number | null;
  size?: number;
  stroke?: number;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = value ?? 0;
  const tone = value === null ? "text-faint" : v >= 75 ? "text-signal" : "text-warn";
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="stroke-sunken" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - v / 100)}
          className={cx("stroke-current transition-[stroke-dashoffset] duration-700", tone)}
        />
      </svg>
      <span className="num absolute inset-0 grid place-items-center text-[13px] font-semibold">
        {value === null ? "–" : `${Math.round(v)}%`}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------- Dialog

export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      className={cx(
        "border-line bg-surface text-ink m-auto w-[calc(100%-2rem)] rounded-2xl border p-0 shadow-2xl",
        wide ? "max-w-2xl" : "max-w-md",
      )}
    >
      {open && (
        <div className="grid gap-5 p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="grid gap-1">
              <h2 className="text-lg font-semibold">{title}</h2>
              {description && <p className="text-muted text-sm">{description}</p>}
            </div>
            <button
              onClick={onClose}
              className="text-muted hover:bg-sunken hover:text-ink -m-1 rounded-md p-1"
              aria-label="Close"
            >
              <X className="size-4" />
            </button>
          </div>
          {children}
        </div>
      )}
    </dialog>
  );
}

export function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="grid gap-1">
      <span className="label">{label}</span>
      <span className="num text-2xl font-semibold">{value}</span>
      {sub && <span className="text-muted text-xs">{sub}</span>}
    </div>
  );
}

// ---------------------------------------------------------------- Confirmation

/** A yes/no dialog for actions that change or delete data. */
export function ConfirmDialog({
  open,
  onClose,
  title,
  description,
  confirmLabel,
  onConfirm,
  loading,
  tone = "danger",
  cancelLabel = "Cancel",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  confirmLabel: string;
  onConfirm: () => void;
  loading?: boolean;
  tone?: "danger" | "signal" | "primary";
  cancelLabel?: string;
}) {
  return (
    <Dialog open={open} onClose={onClose} title={title} description={description}>
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          {cancelLabel}
        </Button>
        <Button variant={tone} loading={loading} onClick={onConfirm}>
          {confirmLabel}
        </Button>
      </div>
    </Dialog>
  );
}

// ---------------------------------------------------------------- Search

export function SearchInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <div className="relative">
      <Search className="text-faint pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
      <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="pl-9" />
    </div>
  );
}
