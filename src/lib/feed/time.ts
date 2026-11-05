export const NZ_TIME_ZONE = "Pacific/Auckland";

const partsFormatter = new Intl.DateTimeFormat("en-NZ", {
  timeZone: NZ_TIME_ZONE,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

/** Offset of Pacific/Auckland from UTC, in ms, at the given instant. */
function nzOffsetMs(utcMs: number) {
  const p = Object.fromEntries(
    partsFormatter
      .formatToParts(new Date(utcMs))
      .map(({ type, value }) => [type, Number(value)]),
  );
  const asUtc = Date.UTC(
    p.year,
    p.month - 1,
    p.day,
    p.hour,
    p.minute,
    p.second,
  );
  return asUtc - Math.floor(utcMs / 1000) * 1000;
}

/**
 * The feed's `updated` attributes are NZ local time with no offset
 * (e.g. "2026-11-07T21:42:05" is NZDT). Convert to a real instant.
 */
export function parseNzLocal(value: string): Date {
  const m = value
    .trim()
    .match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) throw new Error(`Unrecognised feed timestamp: ${value}`);
  const [, y, mo, d, h, mi, s = "0"] = m;
  const wall = Date.UTC(+y, +mo - 1, +d, +h, +mi, +s);
  // Two passes handle instants near a DST transition.
  let utc = wall - nzOffsetMs(wall);
  utc = wall - nzOffsetMs(utc);
  return new Date(utc);
}

/** Inverse of parseNzLocal, used by the simulator to write feed-shaped XML. */
export function formatNzLocal(date: Date): string {
  const p = Object.fromEntries(
    partsFormatter.formatToParts(date).map(({ type, value }) => [type, value]),
  );
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}`;
}
