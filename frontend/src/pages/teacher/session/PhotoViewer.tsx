import { Eye, EyeOff, ZoomIn, ZoomOut } from "lucide-react";
import { useState } from "react";
import { Card } from "../../../components/ui";
import type { Face, RosterEntry, SessionDetail } from "../../../lib/api";
import type { Assignments } from "./faces";

const NAMED = "#22c55e";
const UNSURE = "#f59e0b";

function ToolButton({ title, onClick, children }: { title: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="text-muted hover:bg-sunken hover:text-ink grid size-8 place-items-center rounded-md"
    >
      {children}
    </button>
  );
}

/** The class photo with a box per detected face: green when named, amber when unsure, dashed when unknown. */
export function PhotoViewer({
  session,
  assign,
  roster,
  selected,
  onSelect,
  isUnsure,
}: {
  session: SessionDetail;
  assign: Assignments;
  roster: Map<number, RosterEntry>;
  selected: number | null;
  onSelect: (index: number) => void;
  isUnsure: (face: Face) => boolean;
}) {
  const [zoom, setZoom] = useState(1);
  const [showBoxes, setShowBoxes] = useState(true);
  const [hover, setHover] = useState<number | null>(null);
  const { width, height } = session.photo!;
  const stroke = Math.max(width, height) / 900;

  return (
    <Card className="overflow-hidden">
      <div className="border-line flex items-center gap-2 border-b px-4 py-2">
        <span className="text-muted text-xs">
          <span className="num">
            {width}×{height}
          </span>{" "}
          · click a face to edit
        </span>
        <div className="ml-auto flex items-center gap-1">
          <ToolButton title="Toggle boxes" onClick={() => setShowBoxes(!showBoxes)}>
            {showBoxes ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
          </ToolButton>
          <ToolButton title="Zoom out" onClick={() => setZoom(Math.max(1, zoom - 0.5))}>
            <ZoomOut className="size-4" />
          </ToolButton>
          <span className="num w-10 text-center text-xs">{zoom.toFixed(1)}×</span>
          <ToolButton title="Zoom in" onClick={() => setZoom(Math.min(4, zoom + 0.5))}>
            <ZoomIn className="size-4" />
          </ToolButton>
        </div>
      </div>
      <div className="max-h-[70vh] overflow-auto bg-black">
        <div className="relative" style={{ width: `${zoom * 100}%` }}>
          <img
            src={`/api/teacher/sessions/${session.id}/photo`}
            alt="Class photo"
            className="block w-full select-none"
            draggable={false}
          />
          {showBoxes && (
            <svg viewBox={`0 0 ${width} ${height}`} className="absolute inset-0 size-full">
              {session.faces.map((face) => {
                const [x1, y1, x2, y2] = face.box;
                const who = assign[face.index];
                const named = who != null;
                const isSelected = selected === face.index;
                const unsure = isUnsure(face);
                const color = unsure ? UNSURE : NAMED;
                const label = named ? `${roster.get(who)?.name ?? "Left course"}${unsure ? "?" : ""}` : "Unknown";
                return (
                  <g
                    key={face.index}
                    onClick={() => onSelect(face.index)}
                    onMouseEnter={() => setHover(face.index)}
                    onMouseLeave={() => setHover(null)}
                    className="cursor-pointer"
                    data-face={face.index}
                  >
                    <rect
                      x={x1}
                      y={y1}
                      width={x2 - x1}
                      height={y2 - y1}
                      rx={stroke * 2}
                      fill={isSelected ? "rgb(255 255 255 / 0.12)" : "transparent"}
                      stroke={named ? color : "rgb(255 255 255 / 0.7)"}
                      strokeWidth={stroke * (isSelected ? 3.5 : named ? 2.2 : 1.2)}
                      strokeDasharray={named ? undefined : `${stroke * 4} ${stroke * 3}`}
                    />
                    {(named || isSelected || hover === face.index) && (
                      <g>
                        <rect
                          x={x1}
                          y={y1 - stroke * 16}
                          width={Math.max(label.length * stroke * 7 + stroke * 10, x2 - x1)}
                          height={stroke * 14}
                          rx={stroke * 2}
                          fill={named ? color : "rgb(24 24 27 / 0.85)"}
                        />
                        <text
                          x={x1 + stroke * 5}
                          y={y1 - stroke * 5.5}
                          fontSize={stroke * 10.5}
                          fontWeight={600}
                          fill={named ? "#052e16" : "white"}
                          fontFamily="Inter Variable, sans-serif"
                        >
                          {label}
                        </text>
                      </g>
                    )}
                  </g>
                );
              })}
            </svg>
          )}
        </div>
      </div>
    </Card>
  );
}
