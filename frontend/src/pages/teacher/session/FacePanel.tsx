import { Check, UserX } from "lucide-react";
import { useMemo, useState } from "react";
import { Avatar, Button, cx, SearchInput } from "../../../components/ui";
import type { Face, RosterEntry, SessionDetail } from "../../../lib/api";
import { faceUrl, facesByStudent, matchesQuery, type Assignments } from "./faces";

/** Details of the selected face, with controls to confirm, rename or reject it. */
export function FacePanel({
  session,
  face,
  assign,
  roster,
  unsure,
  onAssign,
  onAccept,
}: {
  session: SessionDetail;
  face: Face;
  assign: Assignments;
  roster: RosterEntry[];
  unsure: boolean;
  onAssign: (index: number, student: number | null) => void;
  onAccept: (index: number) => void;
}) {
  const [query, setQuery] = useState("");
  const current = assign[face.index] ?? null;
  const currentStudent = roster.find((s) => s.id === current);
  const takenBy = useMemo(() => facesByStudent(assign), [assign]);

  return (
    <div className="grid gap-4">
      <div className="flex gap-4">
        <div className="brackets text-signal size-24 shrink-0 p-1">
          <img src={faceUrl(session.id, face.index)} alt="" className="size-full rounded object-cover" />
        </div>
        <div className="grid content-start gap-1.5">
          <span className="label">Face #{face.index + 1}</span>
          <span className="font-semibold">{currentStudent?.name ?? "Unknown"}</span>
          <span className="text-muted text-xs">
            best similarity <span className="num text-ink">{face.score.toFixed(2)}</span>
            <br />
            {face.margin !== null && (
              <>
                gap to next student <span className="num text-ink">{face.margin.toFixed(2)}</span>
                <br />
              </>
            )}
            height <span className="num text-ink">{face.box[3] - face.box[1]}</span> px
          </span>
        </div>
      </div>

      {unsure && currentStudent && (
        <div className="bg-warn-soft text-warn grid gap-2 rounded-xl px-3 py-2.5 text-sm">
          <span>
            <span className="font-medium">Not sure.</span> Another student looks almost as similar, so please check this
            face.
          </span>
          <Button
            size="sm"
            variant="secondary"
            icon={<Check className="size-3.5" />}
            onClick={() => onAccept(face.index)}
          >
            Yes, this is {currentStudent.first_name || currentStudent.name}
          </Button>
        </div>
      )}

      <Button
        variant={current == null ? "secondary" : "danger"}
        size="sm"
        icon={<UserX className="size-3.5" />}
        disabled={current == null}
        onClick={() => onAssign(face.index, null)}
      >
        Not a student · mark unknown
      </Button>
      <SearchInput value={query} onChange={setQuery} placeholder="Assign to student…" />
      <ul className="-mx-2 grid max-h-64 gap-0.5 overflow-y-auto">
        {roster
          .filter((s) => matchesQuery(s, query))
          .map((s) => {
            const otherFace = takenBy.get(s.id);
            return (
              <li key={s.id}>
                <button
                  onClick={() => onAssign(face.index, s.id)}
                  className={cx(
                    "hover:bg-sunken flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm",
                    current === s.id && "bg-signal-soft",
                  )}
                >
                  <Avatar name={s.name} size={26} />
                  <span className="min-w-0 flex-1 truncate">{s.name}</span>
                  {current === s.id ? (
                    <Check className="text-signal size-4" />
                  ) : otherFace !== undefined ? (
                    <span className="text-muted text-[11px]">on #{otherFace + 1}</span>
                  ) : !s.registered ? (
                    <span className="text-faint text-[11px]">no face data</span>
                  ) : null}
                </button>
              </li>
            );
          })}
      </ul>
    </div>
  );
}
