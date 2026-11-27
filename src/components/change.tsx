import { cn } from "@/lib/utils";

/**
 * A change since election night, like "+0.4" or "−2". Rounds to `digits`
 * and renders nothing when that rounds to zero, so callers can pass any
 * difference. Screen readers hear the whole sentence.
 */
export function Change({
  value,
  unit,
  digits = 0,
  className,
}: {
  value: number;
  /** For screen readers, plural: "percentage points", "seats". A change of 1 drops the "s". */
  unit: string;
  digits?: number;
  className?: string;
}) {
  const size = Math.abs(value).toFixed(digits);
  if (Number(size) === 0) return null;
  const noun = size === "1" ? unit.replace(/s$/, "") : unit;
  return (
    <span
      className={cn("num whitespace-nowrap", className)}
      title="Since election night"
    >
      <span aria-hidden>
        {value > 0 ? "+" : "−"}
        {size}
      </span>
      <span className="sr-only">
        {` (${value > 0 ? "up" : "down"} ${size} ${noun} since election night)`}
      </span>
    </span>
  );
}
