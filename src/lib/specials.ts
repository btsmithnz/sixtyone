/**
 * "What could the special votes change?": project the official result from
 * the preliminary count, using how special votes leaned in past elections.
 *
 * Special votes (overseas, enrolled late, voting outside their electorate…)
 * aren't counted on election night. Historically they lean differently from
 * ordinary votes, so the official result moves. A preset applies a past
 * election's lean to this year's numbers, party by party:
 *
 *   lean = party's share of that year's special votes
 *          ÷ its share of that year's preliminary count
 *
 * Specials then split in proportion to (this year's preliminary share × lean).
 * Leans are relative, so they carry over between elections where parties are
 * at very different levels (Te Pāti Māori on 2.6% in 2023, 0.6% in 2026).
 * Electorate seats are held fixed: specials can flip a close electorate, but
 * there's no per-electorate history to model that from.
 */
import { allocateSeats, majorityOf } from "./seats";

/**
 * The Electoral Commission's election-night estimate of special votes still
 * to count, including 96,947 overseas and dictation votes. Official results
 * are due Friday 27 November 2026.
 * https://elections.nz/media-and-news/2026/2026-general-election-preliminary-results
 */
export const SPECIALS_ESTIMATE = 399_365;
export const OFFICIAL_RESULTS_DATE = "Friday 27 November";

/**
 * The start of that day, NZ time. The feed doesn't change between election
 * night and the official results, so anything updated from then on is the
 * official count.
 */
const OFFICIAL_RESULTS_FROM = Date.parse("2026-11-27T00:00:00+13:00");

/** Which count results last updated at `updatedAt` come from. */
export const countStage = (updatedAt: number) =>
  updatedAt >= OFFICIAL_RESULTS_FROM ? "official" : "preliminary";

/** Parties tracked across elections. Everyone else is grouped as "other". */
type PartyKey =
  | "national"
  | "labour"
  | "green"
  | "act"
  | "nzfirst"
  | "maori"
  | "top"
  | "other";

/** 2026 feed p_no → key. */
const KEY_BY_PNO: Record<number, PartyKey> = {
  16: "national",
  13: "labour",
  10: "green",
  5: "act",
  17: "nzfirst",
  14: "maori",
  24: "top",
};

/**
 * Party votes in the preliminary and official counts, from the Commission's
 * media releases (2017: archive.electionresults.govt.nz). `total` is all
 * valid party votes, so "other" is total minus the named parties.
 */
const HISTORY = {
  2017: {
    total: [2_169_802, 2_591_896],
    national: [998_813, 1_152_075],
    labour: [776_556, 956_184],
    green: [126_995, 162_443],
    act: [10_959, 13_075],
    nzfirst: [162_988, 186_706],
    maori: [23_456, 30_580],
    top: [48_018, 63_261],
  },
  2020: {
    total: [2_381_472, 2_886_427],
    national: [638_393, 738_275],
    labour: [1_169_397, 1_443_546],
    green: [180_224, 226_754],
    act: [190_106, 219_030],
    nzfirst: [63_447, 75_021],
    maori: [23_938, 33_632],
    top: [33_718, 43_449],
  },
  2023: {
    total: [2_244_380, 2_850_527],
    national: [875_234, 1_085_016],
    labour: [602_816, 767_236],
    green: [241_977, 330_883],
    act: [202_077, 246_409],
    nzfirst: [145_084, 173_425],
    maori: [58_393, 87_973],
    top: [46_471, 63_330],
  },
} satisfies Record<
  number,
  Record<Exclude<PartyKey, "other"> | "total", [number, number]>
>;

export type Year = keyof typeof HISTORY;
export const YEARS = Object.keys(HISTORY).map(Number) as Year[];

/** Each party's lean in one past election (see the top of this file). */
function leansFor(year: Year): Record<PartyKey, number> {
  const h = HISTORY[year];
  const [prelimTotal, officialTotal] = h.total;
  const specialsTotal = officialTotal - prelimTotal;
  const leans = {} as Record<PartyKey, number>;
  let prelimOther = prelimTotal;
  let specialsOther = specialsTotal;
  for (const [key, [prelim, official]] of Object.entries(h)) {
    if (key === "total") continue;
    const specials = official - prelim;
    prelimOther -= prelim;
    specialsOther -= specials;
    leans[key as PartyKey] = specials / specialsTotal / (prelim / prelimTotal);
  }
  leans.other = specialsOther / specialsTotal / (prelimOther / prelimTotal);
  return leans;
}

export type Preset = Year | "average" | "none";

/** Leans for a preset. "none": specials vote exactly like election night. */
export function presetLeans(preset: Preset): Record<PartyKey, number> {
  if (preset === "none") {
    return {
      national: 1,
      labour: 1,
      green: 1,
      act: 1,
      nzfirst: 1,
      maori: 1,
      top: 1,
      other: 1,
    };
  }
  if (preset !== "average") return leansFor(preset);
  const all = YEARS.map(leansFor);
  const avg = {} as Record<PartyKey, number>;
  for (const key of Object.keys(all[0]) as PartyKey[]) {
    avg[key] = all.reduce((a, l) => a + l[key], 0) / all.length;
  }
  return avg;
}

export const leanOf = (leans: Record<PartyKey, number>, pNo: number) =>
  leans[KEY_BY_PNO[pNo] ?? "other"];

export type Blocs = { left: number[]; right: number[] };

/**
 * Split the special votes between parties. `shift` moves that many
 * percentage points of the special vote from the right bloc to the left
 * (negative: the other way), in proportion within each bloc.
 */
export function splitSpecials({
  prelim,
  leans,
  specials,
  shift = 0,
  blocs,
}: {
  prelim: Map<number, number>;
  leans: Record<PartyKey, number>;
  specials: number;
  shift?: number;
  blocs: Blocs;
}): Map<number, number> {
  const weights = new Map<number, number>();
  for (const [pNo, votes] of prelim)
    weights.set(pNo, votes * leanOf(leans, pNo));
  const total = [...weights.values()].reduce((a, b) => a + b, 0);
  const shares = new Map(
    [...weights].map(([p, w]) => [p, total ? w / total : 0]),
  );
  if (shift) {
    const sum = (ids: number[]) =>
      ids.reduce((a, p) => a + (shares.get(p) ?? 0), 0);
    const left = sum(blocs.left);
    const right = sum(blocs.right);
    // Never move more than a bloc has.
    const d = Math.max(-left, Math.min(right, shift / 100));
    for (const p of blocs.left)
      if (left) shares.set(p, (shares.get(p) ?? 0) * ((left + d) / left));
    for (const p of blocs.right)
      if (right) shares.set(p, (shares.get(p) ?? 0) * ((right - d) / right));
  }
  return new Map([...shares].map(([p, s]) => [p, s * specials]));
}

export type Seats = {
  /** Seats by party (only parties with any). */
  byParty: Map<number, number>;
  houseSize: number;
  majority: number;
};

/** MMP seats for a set of party votes, with electorate seats held fixed. */
export function seatsFor(
  votes: Map<number, number>,
  electorateWins: Map<number, number>,
  outsideWins: number,
): Seats {
  const { parties, totalSeats } = allocateSeats({
    partyVotes: votes,
    electorateWins,
    independentWins: outsideWins,
  });
  // allocateSeats' total is the whole House: 120 (independents included) plus overhang.
  const houseSize = totalSeats;
  return {
    byParty: new Map(
      parties.filter((p) => p.totalSeats > 0).map((p) => [p.pNo, p.totalSeats]),
    ),
    houseSize,
    majority: majorityOf(houseSize),
  };
}

export type KnifeEdge = {
  pNo: number;
  /** "gain": votes short of one more seat. "lose": votes to spare. */
  kind: "gain" | "lose";
  /** The seat in question: their next seat, or their last one. */
  seat: number;
  votes: number;
  /** Who'd lose (for a gain) or gain (for a loss) that seat; null: the House changes size. */
  other: number | null;
  /** House size if it happened. */
  houseSize: number;
};

/**
 * For each seated party: the fewest extra party votes that win it another
 * seat, and the most it could lose before dropping one. Found by binary
 * search over the real allocation, so thresholds and overhang are handled.
 */
export function knifeEdges(
  votes: Map<number, number>,
  electorateWins: Map<number, number>,
  outsideWins: number,
): KnifeEdge[] {
  const base = seatsFor(votes, electorateWins, outsideWins);
  const seatsWith = (pNo: number, delta: number) => {
    const v = new Map(votes);
    v.set(pNo, (v.get(pNo) ?? 0) + delta);
    return seatsFor(v, electorateWins, outsideWins);
  };
  const total = [...votes.values()].reduce((a, b) => a + b, 0);
  const edges: KnifeEdge[] = [];

  for (const [pNo, seats] of base.byParty) {
    if (!votes.has(pNo)) continue;
    const own = votes.get(pNo) ?? 0;

    // Gain: smallest x with more seats. Electorate-heavy parties may need
    // more than the whole count; skip those.
    const gains = (x: number) =>
      (seatsWith(pNo, x).byParty.get(pNo) ?? 0) > seats;
    if (gains(total)) {
      let lo = 0;
      let hi = total;
      while (hi - lo > 1) {
        const mid = Math.floor((lo + hi) / 2);
        if (gains(mid)) hi = mid;
        else lo = mid;
      }
      const after = seatsWith(pNo, hi);
      edges.push({
        pNo,
        kind: "gain",
        seat: seats + 1,
        votes: hi,
        other: changed(base, after, pNo, -1),
        houseSize: after.houseSize,
      });
    }

    // Lose: smallest x with fewer seats (electorates can't be lost this way).
    const loses = (x: number) =>
      (seatsWith(pNo, -x).byParty.get(pNo) ?? 0) < seats;
    if (loses(own)) {
      let lo = 0;
      let hi = own;
      while (hi - lo > 1) {
        const mid = Math.floor((lo + hi) / 2);
        if (loses(mid)) hi = mid;
        else lo = mid;
      }
      const after = seatsWith(pNo, -hi);
      edges.push({
        pNo,
        kind: "lose",
        seat: seats,
        // `hi` votes lost costs the seat, so it can lose one fewer.
        votes: hi - 1,
        other: changed(base, after, pNo, 1),
        houseSize: after.houseSize,
      });
    }
  }
  return edges.sort((a, b) => a.votes - b.votes);
}

/** The other party whose seats moved by `dir`, or null if none did. */
function changed(before: Seats, after: Seats, self: number, dir: 1 | -1) {
  const ids = new Set([...before.byParty.keys(), ...after.byParty.keys()]);
  for (const p of ids) {
    if (p === self) continue;
    const d = (after.byParty.get(p) ?? 0) - (before.byParty.get(p) ?? 0);
    if (Math.sign(d) === dir) return p;
  }
  return null;
}
