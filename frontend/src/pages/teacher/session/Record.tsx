import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Avatar, Badge, Card, cx } from "../../../components/ui";
import { api, type SessionDetail } from "../../../lib/api";

/** A confirmed lecture: the final register, where single marks can still be corrected. */
export function Record({ session }: { session: SessionDetail }) {
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
      <Card className="animate-rise overflow-hidden">
        <ul className="divide-line divide-y">
          {session.roster.map((s) => (
            <li key={s.id} className="flex items-center gap-3 px-5 py-3">
              <Avatar name={s.name} size={32} />
              <span className="grid min-w-0 flex-1 leading-tight">
                <span className="truncate text-sm font-medium">{s.name}</span>
                <span className="num text-muted text-[11px]">{s.roll_no}</span>
              </span>
              <div className="bg-sunken flex gap-1 rounded-lg p-0.5 text-xs">
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
      <Card className="animate-rise grid content-start gap-4 self-start p-6 [animation-delay:60ms]">
        <Badge tone="signal" className="justify-self-start">
          <ShieldCheck className="size-3" /> Confirmed
        </Badge>
        <div className="grid gap-1">
          <span className="num text-4xl font-semibold">
            {present}
            <span className="text-muted text-xl">/{session.roster.length}</span>
          </span>
          <span className="text-muted text-sm">students present</span>
        </div>
        <p className="text-muted text-sm leading-relaxed">
          The class photo and face crops were deleted on confirmation. Marks can still be corrected here.
        </p>
      </Card>
    </div>
  );
}
