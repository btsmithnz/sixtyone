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

export type Mp = {
  cNo: number;
  name: string;
  pNo: number | null;
  /** Electorate MPs: where they won. List MPs: null. */
  electorate: { name: string; slug: string } | null;
  listNo: number | null;
  returning: boolean;
};

export type LeavingMp = {
  name: string;
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
}: Pick<Overview, "electorates" | "parties" | "candidates">): Parliament {
  const incumbents = new Set(
    OUTGOING_MPS.map((m) => m.cNo).filter((c): c is number => c !== null),
  );
  const byCNo = new Map(candidates.map((c) => [c.cNo, c]));
  const electorateName = new Map(electorates.map((e) => [e.eNo, e.name]));

  const mps: Mp[] = [];
  const winners = new Set<number>();
  for (const e of electorates) {
    const lead = e.margin !== null ? e.candidates[0] : undefined;
    if (!lead) continue;
    winners.add(lead.cNo);
    mps.push({
      cNo: lead.cNo,
      name: displayCandidateName(lead.name),
      pNo: lead.pNo,
      electorate: { name: e.name, slug: e.slug },
      listNo: byCNo.get(lead.cNo)?.listNo ?? null,
      returning: incumbents.has(lead.cNo),
    });
  }

  const listSeats = new Map<number, number>();
  const queues = new Map<number, ListQueue>();
  for (const p of parties) {
    const queue = candidates
      .filter(
        (c) => c.pNo === p.pNo && c.listNo !== null && !winners.has(c.cNo),
      )
      .sort((a, b) => (a.listNo ?? 0) - (b.listNo ?? 0));
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
        pNo: c.pNo,
        electorate: null,
        listNo: c.listNo,
        returning: incumbents.has(c.cNo),
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
    };
  });

  return { mps, leaving, listSeats, queues };
}
