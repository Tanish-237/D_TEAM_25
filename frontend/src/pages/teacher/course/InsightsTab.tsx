import { Camera } from "lucide-react";
import { Link } from "react-router";
import { Card, Empty } from "../../../components/ui";
import { formatDate, type CourseDetail } from "../../../lib/api";
import { Bar } from "./Bar";

/** Students present per confirmed lecture, and the students below 75% attendance. */
export function InsightsTab({ course }: { course: CourseDetail }) {
  const confirmed = course.session_list.filter((s) => s.status === "confirmed").reverse();
  const low = course.student_list.filter((s) => s.percent !== null && s.percent < 75);
  if (confirmed.length === 0)
    return (
      <Empty icon={<Camera className="size-5" />} title="No confirmed lectures yet">
        Charts appear after the first confirmed lecture.
      </Empty>
    );
  const max = Math.max(course.students, ...confirmed.map((s) => s.marked), 1);

  return (
    <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
      <Card className="grid gap-5 p-6">
        <div className="flex items-baseline justify-between">
          <h3 className="font-semibold">Present per lecture</h3>
          <span className="text-muted text-xs">of {course.students} enrolled</span>
        </div>
        <div className="border-line flex h-48 items-end gap-2 overflow-x-auto border-b pb-px">
          {confirmed.map((s) => (
            <Link
              key={s.id}
              to={`/teacher/sessions/${s.id}`}
              className="group grid h-full min-w-8 flex-1 grid-rows-[1fr_auto] items-end justify-items-center gap-1"
              title={`${formatDate(s.date)}: ${s.present}/${s.marked}`}
            >
              <div className="relative flex h-full w-full max-w-12 items-end">
                <div
                  className="bg-ink/85 group-hover:bg-signal w-full rounded-t-md transition"
                  style={{ height: `${(100 * s.present) / max}%` }}
                />
                <span className="num text-muted absolute left-1/2 -translate-x-1/2 -translate-y-full text-[10px] opacity-0 group-hover:opacity-100">
                  {s.present}
                </span>
              </div>
            </Link>
          ))}
        </div>
        <div className="flex gap-2 overflow-x-auto">
          {confirmed.map((s) => (
            <span key={s.id} className="num text-muted min-w-8 flex-1 text-center text-[10px]">
              {formatDate(s.date)}
            </span>
          ))}
        </div>
      </Card>
      <Card className="grid content-start gap-4 p-6">
        <h3 className="font-semibold">Below 75%</h3>
        {low.length === 0 ? (
          <p className="text-muted text-sm">Every student is at or above 75%.</p>
        ) : (
          <ul className="grid gap-3">
            {low.map((s) => (
              <li key={s.id} className="grid gap-1.5">
                <div className="flex justify-between text-sm">
                  <span className="truncate">{s.name}</span>
                  <span className="num text-warn">{Math.round(s.percent!)}%</span>
                </div>
                <Bar value={s.percent} />
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
