import { LogOut, Moon, Sun } from "lucide-react";
import { useState } from "react";
import { Link, NavLink, Navigate, Outlet, useNavigate } from "react-router";
import { toast } from "sonner";
import { api, type Role } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Avatar, cx, PageLoader } from "./ui";

export function Logo({ className }: { className?: string }) {
  return (
    <Link to="/" className={cx("flex items-center gap-2 font-semibold tracking-tight", className)}>
      <svg viewBox="0 0 32 32" className="size-7" aria-hidden>
        <rect width="32" height="32" rx="8" className="fill-ink" />
        <path
          d="M9 13V9h4M19 9h4v4M23 19v4h-4M13 23H9v-4"
          className="stroke-signal"
          strokeWidth="2.5"
          fill="none"
          strokeLinecap="round"
        />
        <circle cx="16" cy="16" r="3" className="fill-paper" />
      </svg>
      <span className="text-[17px]">QuickPic</span>
    </Link>
  );
}

export function ThemeToggle() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains("dark"));
  const toggle = () => {
    const next = !dark;
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("theme", next ? "dark" : "light");
    } catch {
      /* storage unavailable */
    }
    setDark(next);
  };
  return (
    <button
      onClick={toggle}
      className="text-muted hover:bg-sunken hover:text-ink grid size-9 place-items-center rounded-lg"
      aria-label="Toggle dark mode"
    >
      {dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </button>
  );
}

const links: Record<Role, { to: string; label: string }[]> = {
  teacher: [
    { to: "/teacher", label: "Courses" },
    { to: "/teacher/profile", label: "Profile" },
  ],
  student: [
    { to: "/student", label: "Attendance" },
    { to: "/student/face", label: "Face registration" },
    { to: "/student/profile", label: "Profile" },
  ],
};

export function AppShell({ role }: { role: Role }) {
  const { user, loading, setUser } = useAuth();
  const navigate = useNavigate();
  if (loading) return <PageLoader />;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== role) return <Navigate to={user.role === "teacher" ? "/teacher" : "/student"} replace />;

  const logout = async () => {
    await api("/auth/logout", { method: "POST" });
    setUser(null);
    navigate("/");
    toast("Logged out");
  };

  return (
    <div className="min-h-dvh">
      <header className="border-line bg-paper/85 sticky top-0 z-30 border-b backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4 sm:px-6">
          <Logo />
          <nav className="hidden items-center gap-1 sm:flex">
            {links[role].map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                end
                className={({ isActive }) =>
                  cx(
                    "rounded-lg px-3 py-1.5 text-sm transition",
                    isActive ? "bg-sunken text-ink font-medium" : "text-muted hover:text-ink",
                  )
                }
              >
                {link.label}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-1">
            <ThemeToggle />
            <div className="bg-line mx-2 hidden h-6 w-px sm:block" />
            <Link
              to={`/${role}/profile`}
              className="hover:bg-sunken hidden items-center gap-2.5 rounded-lg py-1 pr-2 pl-1 sm:flex"
              title="Your profile"
            >
              <Avatar name={user.name} size={30} />
              <div className="grid leading-tight">
                <span className="text-[13px] font-medium">{user.name}</span>
                <span className="text-muted text-[11px] capitalize">
                  {user.role}
                  {user.roll_no && <span className="num"> · {user.roll_no}</span>}
                </span>
              </div>
            </Link>
            <button
              onClick={logout}
              className="text-muted hover:bg-sunken hover:text-ink ml-1 grid size-9 place-items-center rounded-lg"
              aria-label="Log out"
              title="Log out"
            >
              <LogOut className="size-4" />
            </button>
          </div>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-4 pb-2 sm:hidden">
          {links[role].map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end
              className={({ isActive }) =>
                cx(
                  "rounded-lg px-3 py-1.5 text-sm whitespace-nowrap",
                  isActive ? "bg-sunken font-medium" : "text-muted",
                )
              }
            >
              {link.label}
            </NavLink>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
        <Outlet />
      </main>
    </div>
  );
}

export function PageHeader({
  eyebrow,
  title,
  children,
  actions,
}: {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  children?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="animate-rise mb-8 flex flex-wrap items-end justify-between gap-4">
      <div className="grid min-w-0 gap-1.5">
        {eyebrow && <div className="label">{eyebrow}</div>}
        <h1 className="text-2xl font-semibold sm:text-[28px]">{title}</h1>
        {children && <div className="text-muted text-sm">{children}</div>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
