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

const dayTime = new Intl.DateTimeFormat("en-NZ", {
  timeZone: NZ_TIME_ZONE,
  weekday: "short",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});
export const formatDayTime = (ms: number) =>
  dayTime
    .format(ms)
    .replace(/\s(am|pm)/i, "$1")
    .toLowerCase();
