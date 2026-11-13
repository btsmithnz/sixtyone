import type { ElectorateSummary } from "./results";

/**
 * The tightest electorate races, closest first, by the gap between first and
 * second in percentage points. Shared by the Nail-biters section, its share
 * image and its description, so all three agree.
 */
export function closestRaces(electorates: ElectorateSummary[]) {
  return electorates
    .filter((e) => e.marginPoints !== null && e.votesCast > 0)
    .sort((a, b) => (a.marginPoints ?? 0) - (b.marginPoints ?? 0));
}
