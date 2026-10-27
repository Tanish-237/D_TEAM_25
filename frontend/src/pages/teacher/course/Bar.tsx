import { cx } from "../../../components/ui";

/** A thin percentage bar: green at or above 75% attendance, amber below. */
export function Bar({ value }: { value: number | null }) {
  const v = value ?? 0;
  return (
    <div className="bg-sunken h-1.5 w-full overflow-hidden rounded-full">
      <div
        className={cx("h-full rounded-full transition-all duration-700", v >= 75 ? "bg-signal" : "bg-warn")}
        style={{ width: `${v}%` }}
      />
    </div>
  );
}
