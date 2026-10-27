import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, Check, KeyRound, ScanFace, Trash2, UserRound } from "lucide-react";
import { useState, type FormEvent, type ReactNode } from "react";
import { Link, useNavigate } from "react-router";
import { toast } from "sonner";
import { PageHeader } from "../components/Layout";
import { Avatar, Badge, Button, Card, Dialog, Field, PageLoader, ProgressRing } from "../components/ui";
import { api, formatDate, type FaceStatus, type User } from "../lib/api";
import { useAuth } from "../lib/auth";

interface ProfileData {
  user: User;
  joined: string;
  face: FaceStatus | null;
  stats: Record<string, number | null>;
}

function ProfileCard({ data }: { data: ProfileData }) {
  const { user, stats, face } = data;
  const items: [string, string | number][] =
    user.role === "teacher"
      ? [
          ["Courses", stats.courses ?? 0],
          ["Students", stats.students ?? 0],
          ["Lectures taken", stats.lectures ?? 0],
        ]
      : [
          ["Courses", stats.courses ?? 0],
          ["Lectures attended", `${stats.attended ?? 0}/${stats.lectures ?? 0}`],
        ];
  return (
    <Card className="overflow-hidden">
      <div className="h-20 bg-[linear-gradient(135deg,var(--sunken),var(--surface))]" />
      <div className="-mt-10 flex flex-wrap items-end gap-5 px-6 pb-6">
        <div className="bg-surface rounded-full p-1">
          <Avatar name={user.name} size={80} />
        </div>
        <div className="grid min-w-0 flex-1 gap-1 pb-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-semibold">{user.name}</h2>
            <Badge className="capitalize">{user.role}</Badge>
            {user.role === "student" &&
              (face ? (
                <Badge tone="signal">
                  <Check className="size-3" /> Face registered
                </Badge>
              ) : (
                <Link to="/student/face">
                  <Badge tone="warn">
                    <ScanFace className="size-3" /> Face not registered
                  </Badge>
                </Link>
              ))}
          </div>
          <div className="text-muted flex flex-wrap gap-x-4 gap-y-1 text-sm">
            <span className="num">@{user.username}</span>
            {user.roll_no && (
              <span>
                Roll no <span className="num text-ink">{user.roll_no}</span>
              </span>
            )}
            <span className="inline-flex items-center gap-1">
              <CalendarDays className="size-3.5" /> Joined {formatDate(data.joined, "long")}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-6">
          {items.map(([label, value]) => (
            <div key={label} className="grid gap-0.5 text-right">
              <span className="num text-xl font-semibold">{value}</span>
              <span className="text-muted text-xs">{label}</span>
            </div>
          ))}
          {user.role === "student" && <ProgressRing value={stats.percent ?? null} size={52} />}
        </div>
      </div>
    </Card>
  );
}

function Section({
  icon,
  title,
  description,
  children,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <Card className="grid gap-6 p-6 md:grid-cols-[240px_1fr]">
      <div className="grid content-start gap-1.5">
        <div className="flex items-center gap-2 font-semibold">
          {icon}
          {title}
        </div>
        <p className="text-muted text-sm">{description}</p>
      </div>
      <div className="min-w-0">{children}</div>
    </Card>
  );
}

function ProfileForm({ user }: { user: User }) {
  const client = useQueryClient();
  const save = useMutation({
    mutationFn: (body: Record<string, FormDataEntryValue>) =>
      api<{ user: User }>("/account/profile", { method: "PATCH", json: body }),
    onSuccess: ({ user }) => {
      client.setQueryData(["me"], { user });
      client.invalidateQueries({ queryKey: ["profile"] });
      toast.success("Profile saved");
    },
    onError: (e) => toast.error(e.message),
  });
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    save.mutate(Object.fromEntries(new FormData(event.currentTarget)));
  };
  return (
    <form onSubmit={submit} className="grid max-w-md gap-4">
      <div className="grid grid-cols-2 gap-3">
        <Field label="First name" name="first_name" defaultValue={user.first_name} required />
        <Field label="Last name" name="last_name" defaultValue={user.last_name} />
      </div>
      {user.role === "student" && (
        <Field
          label="Roll number"
          name="roll_no"
          defaultValue={user.roll_no}
          required
          className="[&_input]:font-mono"
        />
      )}
      <Field
        label="Username"
        name="username_display"
        value={user.username}
        disabled
        hint="Usernames cannot be changed."
      />
      <Button type="submit" loading={save.isPending} className="justify-self-start">
        Save profile
      </Button>
    </form>
  );
}

function Password() {
  const [error, setError] = useState<string | null>(null);
  const change = useMutation({
    mutationFn: (body: { current: string; new: string }) => api("/account/password", { json: body }),
    onError: (e) => setError(e.message),
  });
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const f = new FormData(form);
    setError(null);
    if (f.get("new") !== f.get("repeat")) return setError("The new passwords do not match.");
    change.mutate(
      { current: String(f.get("current")), new: String(f.get("new")) },
      {
        onSuccess: () => {
          form.reset();
          toast.success("Password changed");
        },
      },
    );
  };
  return (
    <form onSubmit={submit} className="grid max-w-md gap-4">
      <Field label="Current password" name="current" type="password" autoComplete="current-password" required />
      <Field
        label="New password"
        name="new"
        type="password"
        autoComplete="new-password"
        minLength={8}
        required
        hint="At least 8 characters."
      />
      <Field label="Repeat new password" name="repeat" type="password" autoComplete="new-password" required />
      {error && <p className="text-danger text-sm">{error}</p>}
      <Button type="submit" variant="secondary" loading={change.isPending} className="justify-self-start">
        Change password
      </Button>
    </form>
  );
}

function DeleteAccount({ user }: { user: User }) {
  const { setUser } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const remove = useMutation({
    mutationFn: (password: string) => api("/account/delete", { json: { password } }),
    onSuccess: () => {
      setUser(null);
      navigate("/");
      toast("Your account was deleted");
    },
    onError: (e) => setError(e.message),
  });
  const consequence =
    user.role === "teacher"
      ? "Your courses, their lectures and all attendance records in them are deleted."
      : "Your face data and your attendance records are deleted, and you leave every course.";
  return (
    <>
      <div className="grid max-w-md gap-3">
        <p className="text-muted text-sm">{consequence} This cannot be undone.</p>
        <Button
          variant="danger"
          icon={<Trash2 className="size-4" />}
          onClick={() => setOpen(true)}
          className="justify-self-start"
        >
          Delete my account
        </Button>
      </div>
      <Dialog open={open} onClose={() => setOpen(false)} title="Delete your account?" description={consequence}>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            setError(null);
            remove.mutate(String(new FormData(event.currentTarget).get("password")));
          }}
          className="grid gap-4"
        >
          <Field label="Type your password to confirm" name="password" type="password" required autoFocus />
          {error && <p className="text-danger text-sm">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="danger" loading={remove.isPending}>
              Delete account
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}

export default function Profile() {
  const { user } = useAuth();
  const { data } = useQuery({
    queryKey: ["profile", user?.id],
    queryFn: () => api<ProfileData>("/account/profile"),
  });
  if (!user || !data) return <PageLoader />;
  return (
    <>
      <PageHeader eyebrow="Profile" title="Your profile" />
      <div className="animate-rise grid gap-4">
        <ProfileCard data={data} />
        <Section
          icon={<UserRound className="size-4" />}
          title="Details"
          description="Your name as teachers and students see it."
        >
          <ProfileForm user={user} />
        </Section>
        <Section
          icon={<KeyRound className="size-4" />}
          title="Password"
          description="You stay logged in on this device after changing it."
        >
          <Password />
        </Section>
        <Section
          icon={<Trash2 className="text-danger size-4" />}
          title="Delete account"
          description="Permanently remove your account and its data."
        >
          <DeleteAccount user={user} />
        </Section>
      </div>
    </>
  );
}
