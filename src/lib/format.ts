import { NZ_TIME_ZONE } from "./feed/time";
import type { CountStage } from "./stage";

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

/**
 * How far a share moved, in points, between the two figures as shown (to
 * 0.1), so the change always matches the numbers beside it.
 */
export const shareChange = (now: number, before: number) =>
  (Math.round(now * 10) - Math.round(before * 10)) / 10;

/** "Labour 34.2%, National 31.0%, Green 11.1%" */
export const formatShares = (items: { label: string; percent: number }[]) =>
  items.map((i) => `${i.label} ${formatPct(i.percent)}`).join(", ");

/** "with 87.5% of voting places counted", or "on the official count". */
export const countedPhrase = (stage: CountStage, percentCounted: number) =>
  stage === "official"
    ? "on the official count"
    : `with ${formatPct(percentCounted)} of voting places counted`;

/** A result's progress in a few words: "87% counted", or "official count". */
export const countedLabel = (stage: CountStage, percentCounted: number) =>
  stage === "official"
    ? "official count"
    : `${formatPct(percentCounted, 0)} counted`;
