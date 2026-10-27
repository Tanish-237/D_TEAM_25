import { useMutation, useQueryClient } from "@tanstack/react-query";
import { UserMinus, Users } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Badge, Card, ConfirmDialog, Empty } from "../../../components/ui";
import { api, type CourseDetail, type StudentRow } from "../../../lib/api";
import { Bar } from "./Bar";

export function StudentsTab({ course }: { course: CourseDetail }) {
  const client = useQueryClient();
  const [removing, setRemoving] = useState<StudentRow | null>(null);
  const remove = useMutation({
    mutationFn: (id: number) => api(`/teacher/courses/${course.id}/students/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["teacher"] });
      toast.success("Student removed from the course");
      setRemoving(null);
    },
  });

  if (course.student_list.length === 0)
    return (
      <Empty icon={<Users className="size-5" />} title="No students yet">
        Share the code <span className="num text-ink font-medium">{course.code}</span>. Students join from their
        dashboard.
      </Empty>
    );

  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-line border-b text-left">
              <th className="label px-5 py-3 font-semibold">Roll no</th>
              <th className="label px-5 py-3 font-semibold">Name</th>
              <th className="label px-5 py-3 font-semibold">Face</th>
              <th className="label w-56 px-5 py-3 font-semibold">Attendance</th>
              <th className="px-5 py-3" />
            </tr>
          </thead>
          <tbody className="divide-line divide-y">
            {course.student_list.map((s) => (
              <tr key={s.id}>
                <td className="num text-muted px-5 py-3">{s.roll_no}</td>
                <td className="px-5 py-3 font-medium whitespace-nowrap">{s.name}</td>
                <td className="px-5 py-3">
                  {s.registered ? <Badge tone="signal">Registered</Badge> : <Badge tone="warn">Missing</Badge>}
                </td>
                <td className="px-5 py-3">
                  <div className="flex items-center gap-3">
                    <Bar value={s.percent} />
                    <span className="num w-12 shrink-0 text-right text-xs">
                      {s.percent === null ? "–" : `${Math.round(s.percent)}%`}
                    </span>
                  </div>
                </td>
                <td className="px-5 py-3 text-right">
                  <button
                    onClick={() => setRemoving(s)}
                    className="text-faint hover:bg-danger-soft hover:text-danger rounded-md p-1.5"
                    title="Remove from course"
                  >
                    <UserMinus className="size-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ConfirmDialog
        open={removing !== null}
        onClose={() => setRemoving(null)}
        title={`Remove ${removing?.name}?`}
        description="They leave the course roster. Their past attendance records stay."
        confirmLabel="Remove"
        loading={remove.isPending}
        onConfirm={() => removing && remove.mutate(removing.id)}
      />
    </Card>
  );
}
