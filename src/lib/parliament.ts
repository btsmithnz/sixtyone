/**
 * Who's in the new Parliament, worked out the way the Electoral Commission
 * fills it: every electorate winner, then each party's list seats from the
 * top of its list, skipping anyone who already won an electorate.
 *
 * Compared with the outgoing Parliament (src/data/outgoing-mps.ts) to mark
 * MPs as new or returning, and to list who's leaving.
 */
import { OUTGOING_MPS } from "@/data/outgoing-mps";
import type { ListQueue } from "./list-queue";
import { displayCandidateName } from "./parties";
import type { Overview } from "./results";

/** How someone did in the electorate they stood in. */
export type ElectorateResult = {
  electorate: string;
  /** Their share of the candidate vote there (%). */
  candidate: number;
  /** Their party's share of the party vote there (%), if it's on the ballot. */
  party: number | null;
};

export type Mp = {
  cNo: number;
  name: string;
  /** "SURNAME, Given", as the feed has it, for sorting A–Z. */
  sortName: string;
  pNo: number | null;
  /** Electorate MPs: where they won. List MPs: null. */
  electorate: { name: string; slug: string } | null;
  listNo: number | null;
  returning: boolean;
  /** Anyone who stood in an electorate (list MPs too), once it's counting. */
  result: ElectorateResult | null;
};

export type LeavingMp = {
  name: string;
  /** "Surname, Given", for sorting A–Z. */
  sortName: string;
  /** Party they were elected for (mid-term switches aside). */
  pNo: number;
  /** "lost": stood again and wasn't elected. "retired": didn't stand. */
  reason: "lost" | "retired";
  /** For "lost": what they stood for in 2026. */
  stood: {
    pNo: number | null;
    electorate: string | null;
    listNo: number | null;
  } | null;
  /** For "lost": how they did in the electorate they stood in. */
  result: ElectorateResult | null;
};

export type Parliament = {
  mps: Mp[];
  leaving: LeavingMp[];
  /** List seats each party fills now. */
  listSeats: Map<number, number>;
  queues: Map<number, ListQueue>;
};

export function buildParliament({
  electorates,
  parties,
  candidates,
  electoratePartyShares,
}: Pick<
  Overview,
  "electorates" | "parties" | "candidates" | "electoratePartyShares"
>): Parliament {
  const incumbents = new Set(
    OUTGOING_MPS.map((m) => m.cNo).filter((c): c is number => c !== null),
  );
  const byCNo = new Map(candidates.map((c) => [c.cNo, c]));
  const electorateName = new Map(electorates.map((e) => [e.eNo, e.name]));
  const electorateByENo = new Map(electorates.map((e) => [e.eNo, e]));
  const resultOf = (cNo: number): ElectorateResult | null => {
    const c = byCNo.get(cNo);
    const e = c?.eNo != null ? electorateByENo.get(c.eNo) : undefined;
    const mine = e?.candidates.find((x) => x.cNo === cNo);
    if (!c || !e || !mine || e.votesCast === 0) return null;
    return {
      electorate: e.name,
      candidate: mine.percent,
      party:
        c.pNo !== null ? (electoratePartyShares[e.eNo]?.[c.pNo] ?? null) : null,
    };
  };

  const mps: Mp[] = [];
  const winners = new Set<number>();
  for (const e of electorates) {
    const lead = e.margin !== null ? e.candidates[0] : undefined;
    if (!lead) continue;
    winners.add(lead.cNo);
    mps.push({
      cNo: lead.cNo,
      name: displayCandidateName(lead.name),
      sortName: lead.name,
      pNo: lead.pNo,
      electorate: { name: e.name, slug: e.slug },
      listNo: byCNo.get(lead.cNo)?.listNo ?? null,
      returning: incumbents.has(lead.cNo),
      result: resultOf(lead.cNo),
    });
  }

  const listSeats = new Map<number, number>();
  const queues = new Map<number, ListQueue>();
  for (const p of parties) {
    const queue = listQueue(candidates, p.pNo, winners);
    queues.set(
      p.pNo,
      queue.map((c) => ({
        name: displayCandidateName(c.name),
        listNo: c.listNo ?? 0,
      })),
    );
    listSeats.set(p.pNo, p.listSeats);
    for (const c of queue.slice(0, p.listSeats)) {
      mps.push({
        cNo: c.cNo,
        name: displayCandidateName(c.name),
        sortName: c.name,
        pNo: c.pNo,
        electorate: null,
        listNo: c.listNo,
        returning: incumbents.has(c.cNo),
        result: resultOf(c.cNo),
      });
    }
  }

  const elected = new Set(mps.map((m) => m.cNo));
  const leaving: LeavingMp[] = OUTGOING_MPS.filter(
    (m) => m.cNo === null || !elected.has(m.cNo),
  ).map((m) => {
    const c = m.cNo !== null ? byCNo.get(m.cNo) : undefined;
    return {
      name: m.name,
      sortName: c ? c.name : surnameFirst(m.name),
      pNo: m.pNo,
      reason: c ? "lost" : "retired",
      stood: c
        ? {
            pNo: c.pNo,
            electorate:
              c.eNo !== null ? (electorateName.get(c.eNo) ?? null) : null,
            listNo: c.listNo,
          }
        : null,
      result: c ? resultOf(c.cNo) : null,
    };
  });

  return { mps, leaving, listSeats, queues };
}

/** A party's list in order, minus anyone who won an electorate. */
function listQueue(
  candidates: Overview["candidates"],
  pNo: number,
  winners: Set<number>,
) {
  return candidates
    .filter((c) => c.pNo === pNo && c.listNo !== null && !winners.has(c.cNo))
    .sort((a, b) => (a.listNo ?? 0) - (b.listNo ?? 0));
}

/** Someone elected on one count but not the other. */
export type MovedMp = {
  cNo: number;
  name: string;
  sortName: string;
  pNo: number | null;
  /** How they were (or are) elected: an electorate's name, or null for the list. */
  electorate: string | null;
  listNo: number | null;
};

/**
 * Who's in on the official count but wasn't on election night's, and who
 * was in on election night but isn't now. Both empty before the official
 * count, or when the same people are elected.
 */
export function sinceElectionNight(
  {
    electorates,
    parties,
    candidates,
  }: Pick<Overview, "electorates" | "parties" | "candidates">,
  { mps }: Parliament,
): { arrived: MovedMp[]; departed: MovedMp[] } {
  if (!parties.some((p) => p.preliminary)) return { arrived: [], departed: [] };

  // Election night's Parliament, filled the same way as today's.
  const nightWinners = new Map<number, string>();
  for (const e of electorates) {
    // An electorate still on election night's count is its own baseline.
    const leader =
      e.stage === "official"
        ? e.preliminary?.leader
        : e.margin !== null
          ? e.candidates[0]
          : undefined;
    if (leader) nightWinners.set(leader.cNo, e.name);
  }
  const winnerSet = new Set(nightWinners.keys());
  const night = new Map<number, string | null>(nightWinners);
  for (const p of parties) {
    const seats = p.preliminary?.listSeats ?? 0;
    for (const c of listQueue(candidates, p.pNo, winnerSet).slice(0, seats))
      night.set(c.cNo, null);
  }

  const byCNo = new Map(candidates.map((c) => [c.cNo, c]));
  const now = new Set(mps.map((m) => m.cNo));
  const arrived = mps
    .filter((m) => !night.has(m.cNo))
    .map((m) => ({
      cNo: m.cNo,
      name: m.name,
      sortName: m.sortName,
      pNo: m.pNo,
      electorate: m.electorate?.name ?? null,
      listNo: m.listNo,
    }));
  const departed = [...night]
    .filter(([cNo]) => !now.has(cNo))
    .flatMap(([cNo, electorate]) => {
      const c = byCNo.get(cNo);
      return c
        ? [
            {
              cNo,
              name: displayCandidateName(c.name),
              sortName: c.name,
              pNo: c.pNo,
              electorate,
              listNo: c.listNo,
            },
          ]
        : [];
    });
  return { arrived, departed };
}

/**
 * "Brooke van Velden" → "van Velden, Brooke": the last word, plus any
 * lowercase particles before it. For people who aren't in the feed.
 */
function surnameFirst(name: string) {
  const words = name.split(" ");
  let i = words.length - 1;
  while (i > 1 && /^\p{Ll}/u.test(words[i - 1])) i--;
  return `${words.slice(i).join(" ")}, ${words.slice(0, i).join(" ")}`;
}
