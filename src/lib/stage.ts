/**
 * Which count results come from. Election night's count is preliminary; the
 * official count, about three weeks later, adds special votes and rechecks
 * every ordinary vote. Every snapshot is stored with its stage, and pages show
 * the latest stage there is (see docs/official-results.md).
 */
import { formatPct } from "./format";

export const COUNT_STAGES = ["preliminary", "official"] as const;
export type CountStage = (typeof COUNT_STAGES)[number];

export function parseCountStage(value: string | undefined): CountStage {
  if (!value) return "preliminary";
  if ((COUNT_STAGES as readonly string[]).includes(value)) {
    return value as CountStage;
  }
  throw new Error(
    `Unknown count stage "${value}": use ${COUNT_STAGES.join(" or ")}`,
  );
}

/** "with 87.5% of voting places counted", or "on the official count". */
export const countedPhrase = (stage: CountStage, percentCounted: number) =>
  stage === "official"
    ? "on the official count"
    : `with ${formatPct(percentCounted)} of voting places counted`;

/** A result's progress in a few words: "87% counted", or "Official". */
export const countedLabel = (stage: CountStage, percentCounted: number) =>
  stage === "official" ? "Official" : `${formatPct(percentCounted, 0)} counted`;

/** Election night's leader in an electorate, kept to compare with the official result. */
export type PrelimLeader = {
  cNo: number;
  name: string;
  pNo: number | null;
};

/**
 * Whether an electorate's winner on the official count differs from the
 * candidate ahead on election night.
 */
export function changedHands(e: {
  candidates: { cNo: number }[];
  margin: number | null;
  preliminary: { leader: PrelimLeader | null } | null;
}) {
  const before = e.preliminary?.leader;
  const now = e.margin !== null ? e.candidates[0] : undefined;
  return !!before && !!now && before.cNo !== now.cNo;
}
