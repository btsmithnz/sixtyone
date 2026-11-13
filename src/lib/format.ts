import { NZ_TIME_ZONE } from "./feed/time";

const int = new Intl.NumberFormat("en-NZ");
export const formatInt = (n: number) => int.format(n);

export const formatPct = (n: number, digits = 1) => `${n.toFixed(digits)}%`;

const time = new Intl.DateTimeFormat("en-NZ", {
  timeZone: NZ_TIME_ZONE,
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});
/** "9:42pm" in NZ time. */
export const formatTime = (ms: number) =>
  time.format(ms).replace(/\s/g, "").toLowerCase();

const day = new Intl.DateTimeFormat("en-NZ", {
  timeZone: NZ_TIME_ZONE,
  weekday: "short",
  day: "numeric",
  month: "short",
});
/** "Fri 6 Nov" in NZ time. Built from parts: en-NZ adds a comma after the weekday. */
export const formatDay = (ms: number) => {
  const p = Object.fromEntries(
    day.formatToParts(ms).map(({ type, value }) => [type, value]),
  );
  return `${p.weekday} ${p.day} ${p.month}`;
};

const dateKey = new Intl.DateTimeFormat("en-CA", {
  timeZone: NZ_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
/** "2026-11-07": the NZ calendar date, for same-day comparisons. */
export const nzDateKey = (ms: number) => dateKey.format(ms);

/** "Labour 34.2%, National 31.0%, Green 11.1%" */
export const formatShares = (items: { label: string; percent: number }[]) =>
  items.map((i) => `${i.label} ${formatPct(i.percent)}`).join(", ");
