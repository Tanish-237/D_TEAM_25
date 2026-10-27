import { GraduationCap, Presentation } from "lucide-react";
import { useRef, useState, type FormEvent, type ReactNode } from "react";
import { Link, Navigate, useNavigate } from "react-router";
import { toast } from "sonner";
import { Logo, ThemeToggle } from "../components/Layout";
import { Button, cx, Field } from "../components/ui";
import { api, type Role, type User } from "../lib/api";
import { homeFor, useAuth } from "../lib/auth";

function AuthFrame({ title, sub, children }: { title: string; sub: ReactNode; children: ReactNode }) {
  return (
    <div className="grid min-h-dvh grid-rows-[auto_1fr]">
      <header className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
        <Logo />
        <ThemeToggle />
      </header>
      <main className="grid place-items-center px-4 pb-16">
        <div className="animate-rise w-full max-w-sm">
          <div className="mb-8 grid gap-2 text-center">
            <h1 className="text-2xl font-semibold">{title}</h1>
            <p className="text-muted text-sm">{sub}</p>
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}

function ErrorNote({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p className="bg-danger-soft text-danger rounded-lg px-3 py-2 text-sm" role="alert">
      {message}
    </p>
  );
}

export function Login() {
  const { user, setUser } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (user) return <Navigate to={homeFor(user)} replace />;

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError(null);
    try {
      const { user } = await api<{ user: User }>("/auth/login", {
        json: { username: form.get("username"), password: form.get("password") },
      });
      setUser(user);
      toast.success(`Welcome back, ${user.first_name || user.username}`);
      navigate(homeFor(user));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthFrame
      title="Log in to QuickPic"
      sub={
        <>
          New here?{" "}
          <Link to="/signup" className="text-ink font-medium underline-offset-4 hover:underline">
            Create an account
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="grid gap-4">
        <Field label="Username" name="username" autoComplete="username" required autoFocus />
        <Field label="Password" name="password" type="password" autoComplete="current-password" required />
        <ErrorNote message={error} />
        <Button type="submit" loading={busy} className="mt-1">
          Log in
        </Button>
      </form>
    </AuthFrame>
  );
}

export function Signup() {
  const { user, setUser } = useAuth();
  const navigate = useNavigate();
  const [role, setRole] = useState<Role>("student");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Set once this form signs the user up, so the redirect below does not override
  // the navigation to face registration.
  const signedUp = useRef(false);
  if (user && !signedUp.current) return <Navigate to={homeFor(user)} replace />;

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = Object.fromEntries(new FormData(event.currentTarget));
    setBusy(true);
    setError(null);
    try {
      const { user } = await api<{ user: User }>("/auth/signup", { json: form });
      signedUp.current = true;
      setUser(user);
      toast.success("Account created");
      navigate(user.role === "student" ? "/student/face" : "/teacher");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthFrame
      title="Create your account"
      sub={
        <>
          Already registered?{" "}
          <Link to="/login" className="text-ink font-medium underline-offset-4 hover:underline">
            Log in
          </Link>
        </>
      }
    >
      <div className="bg-sunken mb-6 grid grid-cols-2 gap-1 rounded-xl p-1">
        {(
          [
            ["student", "Student", GraduationCap],
            ["teacher", "Teacher", Presentation],
          ] as const
        ).map(([value, label, Icon]) => (
          <button
            key={value}
            type="button"
            onClick={() => setRole(value)}
            className={cx(
              "flex h-9 items-center justify-center gap-2 rounded-lg text-sm transition",
              role === value ? "bg-surface font-medium shadow-sm" : "text-muted hover:text-ink",
            )}
          >
            <Icon className="size-4" /> {label}
          </button>
        ))}
      </div>
      <form onSubmit={submit} className="grid gap-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="First name" name="first_name" autoComplete="given-name" required />
          <Field label="Last name" name="last_name" autoComplete="family-name" />
        </div>
        {role === "student" ? (
          <Field label="Roll number" name="roll_no" placeholder="20233288" required className="[&_input]:font-mono" />
        ) : (
          <Field
            label="Teacher code"
            name="teacher_code"
            type="password"
            hint="Given by the administrator, so students cannot sign up as teachers."
            required
          />
        )}
        <Field label="Username" name="username" autoComplete="username" required />
        <Field
          label="Password"
          name="password"
          type="password"
          autoComplete="new-password"
          hint="At least 8 characters."
          minLength={8}
          required
        />
        <ErrorNote message={error} />
        <Button type="submit" loading={busy} className="mt-1">
          Create {role} account
        </Button>
      </form>
    </AuthFrame>
  );
}
