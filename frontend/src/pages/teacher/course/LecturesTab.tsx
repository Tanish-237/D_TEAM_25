import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Camera, ChevronRight, Trash2 } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { Badge, Button, Card, ConfirmDialog, Empty } from "../../../components/ui";
import { api, formatDate, type CourseDetail, type SessionRow } from "../../../lib/api";
import { Bar } from "./Bar";

export function LecturesTab({ course, onNew }: { course: CourseDetail; onNew: () => void }) {
  const navigate = useNavigate();
  const client = useQueryClient();
  const [removing, setRemoving] = useState<SessionRow | null>(null);
  const remove = useMutation({
    mutationFn: (id: number) => api(`/teacher/sessions/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["teacher"] });
      toast.success("Lecture and its attendance deleted");
      setRemoving(null);
    },
  });

  if (course.session_list.length === 0)
    return (
      <Empty
        icon={<Camera className="size-5" />}
        title="No lectures yet"
        action={<Button onClick={onNew}>Take attendance</Button>}
      >
        Upload a class photo; QuickPic proposes who is present and you confirm.
      </Empty>
    );

  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-line border-b text-left">
              <th className="label px-5 py-3 font-semibold">Date</th>
              <th className="label px-5 py-3 font-semibold">Topic</th>
              <th className="label px-5 py-3 font-semibold">Status</th>
              <th className="label w-56 px-5 py-3 font-semibold">Present</th>
              <th className="px-5 py-3" />
            </tr>
          </thead>
          <tbody className="divide-line divide-y">
            {course.session_list.map((s) => (
              <tr
                key={s.id}
                onClick={() => navigate(`/teacher/sessions/${s.id}`)}
                className="hover:bg-sunken/60 cursor-pointer transition"
              >
                <td className="num px-5 py-3.5 whitespace-nowrap">{formatDate(s.date, "long")}</td>
                <td className="text-muted max-w-64 truncate px-5 py-3.5">{s.topic || "—"}</td>
                <td className="px-5 py-3.5">
                  {s.status === "draft" ? (
                    <Badge tone="warn">Review · {s.faces} faces</Badge>
                  ) : (
                    <Badge tone="signal">Confirmed</Badge>
                  )}
                </td>
                <td className="px-5 py-3.5">
                  {s.status === "confirmed" ? (
                    <div className="flex items-center gap-3">
                      <Bar value={s.marked ? (100 * s.present) / s.marked : null} />
                      <span className="num w-12 shrink-0 text-right text-xs">
                        {s.present}/{s.marked}
                      </span>
                    </div>
                  ) : (
                    <span className="text-muted text-xs">—</span>
                  )}
                </td>
                <td className="px-5 py-3.5 text-right">
                  <span className="inline-flex items-center gap-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setRemoving(s);
                      }}
                      className="text-faint hover:bg-danger-soft hover:text-danger rounded-md p-1.5"
                      title="Delete this lecture"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                    <span className="text-muted inline-flex items-center gap-1 text-xs font-medium">
                      {s.status === "draft" ? "Review" : "Open"} <ChevronRight className="size-3.5" />
                    </span>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ConfirmDialog
        open={removing !== null}
        onClose={() => setRemoving(null)}
        title="Delete this lecture?"
        description={
          removing
            ? `${formatDate(removing.date, "long")}${removing.topic ? ` · ${removing.topic}` : ""}. Its attendance marks are removed from every student's record.`
            : ""
        }
        confirmLabel="Delete lecture"
        loading={remove.isPending}
        onConfirm={() => removing && remove.mutate(removing.id)}
      />
    </Card>
  );
}
