import { Check } from "lucide-react";
import { useState } from "react";
import { Avatar, cx, SearchInput } from "../../../components/ui";
import type { RosterEntry, SessionDetail } from "../../../lib/api";
import { faceUrl, matchesQuery } from "./faces";

/** The course roster as a checklist: who will be marked present when the teacher confirms. */
export function RegisterPanel({
  session,
  present,
  faceOf,
  onToggle,
  onSetAll,
}: {
  session: SessionDetail;
  present: Set<number>;
  faceOf: Map<number, number>;
  onToggle: (id: number) => void;
  onSetAll: (ids: number[]) => void;
}) {
  const [query, setQuery] = useState("");
  const roster: RosterEntry[] = session.roster;
  const shortcuts: [string, number[]][] = [
    ["All", roster.map((s) => s.id)],
    ["Only seen in photo", [...faceOf.keys()]],
    ["None", []],
  ];
  return (
    <div className="grid gap-3">
      <SearchInput value={query} onChange={setQuery} placeholder="Search name or roll no" />
      <div className="flex items-center gap-1 text-xs">
        <span className="text-muted mr-auto">Mark</span>
        {shortcuts.map(([label, ids]) => (
          <button
            key={label}
            onClick={() => onSetAll(ids)}
            className="text-muted hover:bg-sunken hover:text-ink rounded-md px-2 py-1 font-medium"
          >
            {label}
          </button>
        ))}
      </div>
      <ul className="-mx-2 grid max-h-[52vh] gap-0.5 overflow-y-auto">
        {roster
          .filter((s) => matchesQuery(s, query))
          .map((s) => {
            const on = present.has(s.id);
            const face = faceOf.get(s.id);
            return (
              <li key={s.id}>
                <button
                  onClick={() => onToggle(s.id)}
                  className="hover:bg-sunken flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left"
                >
                  {face !== undefined ? (
                    <img
                      src={faceUrl(session.id, face)}
                      alt=""
                      className="ring-signal size-8 shrink-0 rounded-full object-cover ring-2"
                    />
                  ) : (
                    <Avatar name={s.name} size={32} />
                  )}
                  <span className="grid min-w-0 flex-1 leading-tight">
                    <span className="truncate text-sm font-medium">{s.name}</span>
                    <span className="text-muted text-[11px]">
                      <span className="num">{s.roll_no}</span>
                      {face !== undefined ? " · seen in photo" : !s.registered ? " · no face data" : ""}
                    </span>
                  </span>
                  <span
                    className={cx(
                      "grid size-5 shrink-0 place-items-center rounded-md border transition",
                      on ? "border-signal bg-signal text-white dark:text-black" : "border-line",
                    )}
                  >
                    {on && <Check className="size-3.5" strokeWidth={3} />}
                  </span>
                </button>
              </li>
            );
          })}
      </ul>
    </div>
  );
}
