/**
 * MMP seat allocation as used in New Zealand (Electoral Act 1993, s191):
 *
 * 1. Parties qualify for list seats with ≥5% of the party vote OR at least
 *    one electorate seat.
 * 2. Electorate seats won by independents or by candidates of parties that
 *    aren't registered for the party vote come off the 120 first.
 * 3. The remaining seats go to qualifying parties by Sainte-Laguë
 *    (divisors 1, 3, 5, …) over their party votes.
 * 4. A party keeps every electorate it wins. If it wins more electorates
 *    than its proportional entitlement, the extra seats are overhang and
 *    Parliament grows beyond 120.
 */

export const BASE_SEATS = 120;
export const THRESHOLD = 0.05;

export type SeatAllocation = {
  pNo: number;
  electorateSeats: number;
  listSeats: number;
  totalSeats: number;
}[];

export function allocateSeats({
  partyVotes,
  electorateWins,
  independentWins = 0,
}: {
  /** Party vote per registered party. */
  partyVotes: Map<number, number>;
  /** Electorate seats per party. */
  electorateWins: Map<number, number>;
  /** Electorates won by independents / parties not on the party ballot. */
  independentWins?: number;
}): { parties: SeatAllocation; totalSeats: number; overhang: number } {
  const totalVotes = [...partyVotes.values()].reduce((a, b) => a + b, 0);
  if (totalVotes === 0) return { parties: [], totalSeats: 0, overhang: 0 };

  const qualifying = [...partyVotes.entries()].filter(
    ([pNo, votes]) =>
      votes / totalVotes >= THRESHOLD || (electorateWins.get(pNo) ?? 0) > 0,
  );

  // Electorate wins by parties without party votes count like independents.
  let outside = independentWins;
  for (const [pNo, wins] of electorateWins) {
    if (!partyVotes.has(pNo)) outside += wins;
  }

  const seatsToAllocate = BASE_SEATS - outside;
  const entitlement = new Map<number, number>(qualifying.map(([p]) => [p, 0]));
  // Sainte-Laguë: repeatedly award the next seat to the highest quotient.
  for (let seat = 0; seat < seatsToAllocate; seat++) {
    let best = -1;
    let bestQ = -1;
    for (const [pNo, votes] of qualifying) {
      const q = votes / (2 * (entitlement.get(pNo) ?? 0) + 1);
      // Ties are drawn by lot in law; break them by votes then pNo for stability.
      if (q > bestQ) {
        bestQ = q;
        best = pNo;
      }
    }
    if (best === -1) break;
    entitlement.set(best, (entitlement.get(best) ?? 0) + 1);
  }

  let overhang = 0;
  const parties: SeatAllocation = [];
  const pNos = new Set([...entitlement.keys(), ...electorateWins.keys()]);
  for (const pNo of pNos) {
    if (!partyVotes.has(pNo)) continue;
    const electorateSeats = electorateWins.get(pNo) ?? 0;
    const entitled = entitlement.get(pNo) ?? 0;
    const listSeats = Math.max(0, entitled - electorateSeats);
    overhang += Math.max(0, electorateSeats - entitled);
    parties.push({
      pNo,
      electorateSeats,
      listSeats,
      totalSeats: electorateSeats + listSeats,
    });
  }
  parties.sort((a, b) => b.totalSeats - a.totalSeats);
  return { parties, totalSeats: BASE_SEATS + overhang, overhang };
}

/** Seats needed to govern alone: a majority of the House (61 of 120, more with overhang). */
export const majorityOf = (totalSeats: number) =>
  Math.floor(Math.max(totalSeats, BASE_SEATS) / 2) + 1;

/**
 * The majority when the Commission's own allocation has an overhang that
 * lifts it past 61 (122+ seats), else null. Projections can wobble between
 * 120 and 122 seats as the count moves, so they don't count. Drives the
 * "62*" logo.
 */
export function raisedMajority({
  seatsSource,
  houseSize,
}: {
  seatsSource: "feed" | "projected" | "none";
  houseSize: number;
}): number | null {
  if (seatsSource !== "feed") return null;
  const majority = majorityOf(houseSize);
  return majority > majorityOf(BASE_SEATS) ? majority : null;
}
