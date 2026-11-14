/**
 * Which count results come from. Election night's count is preliminary; the
 * official count, about three weeks later, adds special votes and rechecks
 * every ordinary vote. Every snapshot is stored with its stage, and an
 * official snapshot always outranks a preliminary one (see
 * docs/official-results.md).
 *
 * No imports: drizzle-kit loads this through src/db/schema.ts.
 */
export const COUNT_STAGES = ["preliminary", "official"] as const;
export type CountStage = (typeof COUNT_STAGES)[number];

export function parseCountStage(value: string): CountStage {
  if ((COUNT_STAGES as readonly string[]).includes(value)) {
    return value as CountStage;
  }
  throw new Error(
    `Unknown count stage "${value}": use ${COUNT_STAGES.join(" or ")}`,
  );
}

/**
 * Whether an electorate's winner on the official count differs from the
 * candidate ahead on election night.
 */
export function changedHands(e: {
  candidates: { cNo: number }[];
  margin: number | null;
  preliminary: { leader: { cNo: number } | null } | null;
}) {
  const before = e.preliminary?.leader;
  const now = e.margin !== null ? e.candidates[0] : undefined;
  return !!before && !!now && before.cNo !== now.cNo;
}
