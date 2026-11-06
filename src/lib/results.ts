import "server-only";
import { asc, desc, eq, gt, inArray, max } from "drizzle-orm";
import { cacheLife, cacheTag } from "next/cache";
import { db, schema } from "@/db";
import { allocateSeats } from "./seats";

/**
 * Every results query is cached with `use cache` under this tag. The scraper
 * calls revalidateTag(RESULTS_TAG, "max") when new data lands, and the
 * "results" cacheLife profile (next.config.ts) adds a time-based fallback.
 * Pages therefore come from the CDN/ISR cache, and Postgres only sees a
 * handful of queries per scrape, however many people visit.
 */
export const RESULTS_TAG = "results";

/* --------------------------------- types --------------------------------- */

export type CandidateResult = {
  cNo: number;
  name: string;
  pNo: number | null;
  listNo: number | null;
  votes: number;
  percent: number;
};

export type ElectorateSummary = {
  eNo: number;
  name: string;
  slug: string;
  kind: "general" | "maori";
  updatedAt: number | null;
  totalPlaces: number;
  placesCounted: number;
  percentCounted: number;
  votesCast: number;
  /** Every voting place counted. The feed's `final` flag isn't trustworthy pre-count. */
  complete: boolean;
  candidates: CandidateResult[];
  /** Lead of first over second place, in votes and percentage points. */
  margin: number | null;
  marginPoints: number | null;
  partyVoteLeader: { pNo: number; percent: number } | null;
};

export type PartyResult = {
  pNo: number;
  abbrev: string;
  name: string;
  votes: number;
  percent: number;
  electorateSeats: number;
  listSeats: number;
  totalSeats: number;
};

export type Overview = {
  /** Results version this data was read at; see resultsVersion(). */
  version: number | null;
  updatedAt: number | null;
  stats: {
    votingPlacesCounted: number;
    percentCounted: number;
    totalVotesCast: number;
    turnoutPercent: number;
    electoratesComplete: number;
  } | null;
  parties: PartyResult[];
  /** "feed": the Commission's own allocation; "projected": ours (Sainte-Laguë). */
  seatsSource: "feed" | "projected" | "none";
  houseSize: number;
  electorates: ElectorateSummary[];
};

/* ------------------------------- reference ------------------------------- */

async function loadReference() {
  const [parties, electorates, candidates] = await Promise.all([
    db.select().from(schema.parties),
    db.select().from(schema.electorates).orderBy(asc(schema.electorates.eNo)),
    db.select().from(schema.candidates),
  ]);
  return { parties, electorates, candidates };
}

/* ----------------------------- latest results ----------------------------- */

async function latestElectorateSnapshots() {
  return db
    .selectDistinctOn([schema.electorateSnapshots.eNo])
    .from(schema.electorateSnapshots)
    .orderBy(
      schema.electorateSnapshots.eNo,
      desc(schema.electorateSnapshots.feedUpdatedAt),
    );
}

function summarise(
  e: { eNo: number; name: string; slug: string; kind: "general" | "maori" },
  snap: typeof schema.electorateSnapshots.$inferSelect | undefined,
  candidateVotes: { cNo: number; votes: number }[],
  partyVotes: { pNo: number; votes: number }[],
  candidateById: Map<number, typeof schema.candidates.$inferSelect>,
): ElectorateSummary {
  const total = candidateVotes.reduce((a, c) => a + c.votes, 0);
  const candidates = candidateVotes
    .map((cv) => {
      const c = candidateById.get(cv.cNo);
      return {
        cNo: cv.cNo,
        name: c?.name ?? `Candidate ${cv.cNo}`,
        pNo: c?.pNo ?? null,
        listNo: c?.listNo ?? null,
        votes: cv.votes,
        percent: total ? (cv.votes / total) * 100 : 0,
      };
    })
    .sort((a, b) => b.votes - a.votes || a.name.localeCompare(b.name));
  const [first, second] = candidates;
  const hasVotes = total > 0;
  const partyTotal = partyVotes.reduce((a, p) => a + p.votes, 0);
  const topParty = [...partyVotes].sort((a, b) => b.votes - a.votes)[0];
  return {
    ...e,
    updatedAt: snap?.feedUpdatedAt.getTime() ?? null,
    totalPlaces: snap?.totalVotingPlaces ?? 0,
    placesCounted: snap?.votingPlacesCounted ?? 0,
    percentCounted: snap?.percentVotingPlacesCounted ?? 0,
    votesCast: snap?.totalVotesCast ?? 0,
    complete:
      !!snap &&
      snap.totalVotingPlaces > 0 &&
      snap.votingPlacesCounted >= snap.totalVotingPlaces,
    candidates,
    margin: hasVotes && second ? first.votes - second.votes : null,
    marginPoints: hasVotes && second ? first.percent - second.percent : null,
    partyVoteLeader:
      partyTotal && topParty
        ? { pNo: topParty.pNo, percent: (topParty.votes / partyTotal) * 100 }
        : null,
  };
}

export async function getOverview(): Promise<Overview> {
  "use cache";
  cacheLife("results");
  cacheTag(RESULTS_TAG);

  const [ref, [national], snaps, version] = await Promise.all([
    loadReference(),
    db
      .select()
      .from(schema.electionSnapshots)
      .orderBy(desc(schema.electionSnapshots.feedUpdatedAt))
      .limit(1),
    latestElectorateSnapshots(),
    resultsVersion(),
  ]);
  const snapIds = snaps.map((s) => s.id);
  const [cVotes, pVotes, nationalParties] = await Promise.all([
    snapIds.length
      ? db
          .select()
          .from(schema.electorateCandidateVotes)
          .where(inArray(schema.electorateCandidateVotes.snapshotId, snapIds))
      : [],
    snapIds.length
      ? db
          .select()
          .from(schema.electoratePartyVotes)
          .where(inArray(schema.electoratePartyVotes.snapshotId, snapIds))
      : [],
    national
      ? db
          .select()
          .from(schema.electionPartySnapshots)
          .where(eq(schema.electionPartySnapshots.snapshotId, national.id))
      : [],
  ]);

  const candidateById = new Map(ref.candidates.map((c) => [c.cNo, c]));
  const snapByENo = new Map(snaps.map((s) => [s.eNo, s]));
  const group = <T extends { snapshotId: number }>(rows: T[]) => {
    const m = new Map<number, T[]>();
    for (const r of rows)
      m.set(r.snapshotId, [...(m.get(r.snapshotId) ?? []), r]);
    return m;
  };
  const cBySnap = group(cVotes);
  const pBySnap = group(pVotes);

  const electorates = ref.electorates.map((e) => {
    const snap = snapByENo.get(e.eNo);
    return summarise(
      e,
      snap,
      snap ? (cBySnap.get(snap.id) ?? []) : [],
      snap ? (pBySnap.get(snap.id) ?? []) : [],
      candidateById,
    );
  });

  // Seats: prefer the Commission's published allocation, else project our own.
  const partyByNo = new Map(ref.parties.map((p) => [p.pNo, p]));
  const feedSeats = nationalParties.reduce((a, p) => a + p.totalSeats, 0);
  const totalVotes = nationalParties.reduce((a, p) => a + p.votes, 0);
  let seatsSource: Overview["seatsSource"] = "none";
  let seatMap = new Map<
    number,
    { electorateSeats: number; listSeats: number; totalSeats: number }
  >();
  // Electorate leaders by party. Seats won outside the party vote
  // (independents, or a party not on the party ballot) aren't in any party's
  // total but still count towards the size of the House.
  const partyNos = new Set(nationalParties.map((p) => p.pNo));
  const wins = new Map<number, number>();
  let outsideWins = 0;
  for (const e of electorates) {
    const lead = e.margin !== null ? e.candidates[0] : undefined;
    if (!lead) continue;
    if (lead.pNo && partyNos.has(lead.pNo))
      wins.set(lead.pNo, (wins.get(lead.pNo) ?? 0) + 1);
    else outsideWins++;
  }
  let houseSize = 120;
  if (feedSeats > 0) {
    seatsSource = "feed";
    // 120 plus any overhang, which the Commission's party totals include.
    houseSize = Math.max(120, feedSeats + outsideWins);
    seatMap = new Map(
      nationalParties.map((p) => [
        p.pNo,
        {
          electorateSeats: p.candidateSeats,
          listSeats: p.partySeats,
          totalSeats: p.totalSeats,
        },
      ]),
    );
  } else if (totalVotes > 0) {
    seatsSource = "projected";
    const alloc = allocateSeats({
      partyVotes: new Map(nationalParties.map((p) => [p.pNo, p.votes])),
      electorateWins: wins,
      independentWins: outsideWins,
    });
    houseSize = alloc.totalSeats;
    seatMap = new Map(alloc.parties.map((p) => [p.pNo, p]));
  }

  const parties: PartyResult[] = nationalParties
    .map((p) => {
      const ref = partyByNo.get(p.pNo);
      const seats = seatMap.get(p.pNo);
      return {
        pNo: p.pNo,
        abbrev: ref?.abbrev ?? String(p.pNo),
        name: ref?.name ?? `Party ${p.pNo}`,
        votes: p.votes,
        percent: totalVotes ? (p.votes / totalVotes) * 100 : 0,
        electorateSeats: seats?.electorateSeats ?? 0,
        listSeats: seats?.listSeats ?? 0,
        totalSeats: seats?.totalSeats ?? 0,
      };
    })
    .sort((a, b) => b.votes - a.votes || b.totalSeats - a.totalSeats);

  return {
    version,
    updatedAt: national?.feedUpdatedAt.getTime() ?? null,
    stats: national
      ? {
          votingPlacesCounted: national.votingPlacesCounted,
          percentCounted: national.percentVotingPlacesCounted,
          totalVotesCast: national.totalVotesCast,
          turnoutPercent: national.percentVotesCast,
          electoratesComplete: electorates.filter((e) => e.complete).length,
        }
      : null,
    parties,
    seatsSource,
    houseSize,
    electorates,
  };
}

/* --------------------------------- history -------------------------------- */

export type NationalPoint = {
  t: number;
  counted: number;
  parties: Record<number, { percent: number; seats: number }>;
};

/** National party vote and seats at each snapshot, oldest first. */
export async function getNationalHistory(): Promise<{
  /** Results version this data was read at; see resultsVersion(). */
  version: number | null;
  points: NationalPoint[];
}> {
  "use cache";
  cacheLife("results");
  cacheTag(RESULTS_TAG);

  const [snaps, version] = await Promise.all([
    db
      .select()
      .from(schema.electionSnapshots)
      .where(gt(schema.electionSnapshots.totalVotesCast, 0))
      .orderBy(asc(schema.electionSnapshots.feedUpdatedAt)),
    resultsVersion(),
  ]);
  if (!snaps.length) return { version, points: [] };
  const rows = await db
    .select()
    .from(schema.electionPartySnapshots)
    .where(
      inArray(
        schema.electionPartySnapshots.snapshotId,
        snaps.map((s) => s.id),
      ),
    );
  const bySnap = new Map<number, typeof rows>();
  for (const r of rows)
    bySnap.set(r.snapshotId, [...(bySnap.get(r.snapshotId) ?? []), r]);
  const points = snaps.map((s) => {
    const ps = bySnap.get(s.id) ?? [];
    const total = ps.reduce((a, p) => a + p.votes, 0);
    return {
      t: s.feedUpdatedAt.getTime(),
      counted: s.percentVotingPlacesCounted,
      parties: Object.fromEntries(
        ps.map((p) => [
          p.pNo,
          {
            percent: total ? Math.round((p.votes / total) * 10000) / 100 : 0,
            seats: p.totalSeats,
          },
        ]),
      ),
    };
  });
  return { version, points };
}

export type ElectorateDetail = {
  /** Results version this data was read at; see resultsVersion(). */
  version: number | null;
  summary: ElectorateSummary;
  partyVotes: { pNo: number; votes: number; percent: number }[];
  history: {
    t: number;
    counted: number;
    /** Candidate vote share (%) by c_no. */
    candidates: Record<number, number>;
  }[];
};

export async function getElectorateDetail(
  slug: string,
): Promise<ElectorateDetail | null> {
  "use cache";
  cacheLife("results");
  cacheTag(RESULTS_TAG);

  const [electorate] = await db
    .select()
    .from(schema.electorates)
    .where(eq(schema.electorates.slug, slug));
  if (!electorate) return null;

  const [snaps, standing, version] = await Promise.all([
    db
      .select()
      .from(schema.electorateSnapshots)
      .where(eq(schema.electorateSnapshots.eNo, electorate.eNo))
      .orderBy(asc(schema.electorateSnapshots.feedUpdatedAt)),
    db
      .select()
      .from(schema.candidates)
      .where(eq(schema.candidates.eNo, electorate.eNo)),
    resultsVersion(),
  ]);
  const latest = snaps.at(-1);
  const ids = snaps.map((s) => s.id);
  const [cVotes, pVotes] = await Promise.all([
    ids.length
      ? db
          .select()
          .from(schema.electorateCandidateVotes)
          .where(inArray(schema.electorateCandidateVotes.snapshotId, ids))
      : [],
    latest
      ? db
          .select()
          .from(schema.electoratePartyVotes)
          .where(eq(schema.electoratePartyVotes.snapshotId, latest.id))
      : [],
  ]);

  const candidateById = new Map(standing.map((c) => [c.cNo, c]));
  const latestVotes = latest
    ? cVotes.filter((v) => v.snapshotId === latest.id)
    : standing.map((c) => ({ cNo: c.cNo, votes: 0 }));
  const summary = summarise(
    electorate,
    latest,
    latestVotes,
    pVotes,
    candidateById,
  );

  const partyTotal = pVotes.reduce((a, p) => a + p.votes, 0);
  const bySnap = new Map<number, typeof cVotes>();
  for (const v of cVotes)
    bySnap.set(v.snapshotId, [...(bySnap.get(v.snapshotId) ?? []), v]);

  return {
    version,
    summary,
    partyVotes: pVotes
      .map((p) => ({
        pNo: p.pNo,
        votes: p.votes,
        percent: partyTotal ? (p.votes / partyTotal) * 100 : 0,
      }))
      .sort((a, b) => b.votes - a.votes),
    history: snaps
      .filter((s) => s.totalVotesCast > 0)
      .map((s) => {
        const vs = bySnap.get(s.id) ?? [];
        const total = vs.reduce((a, v) => a + v.votes, 0);
        return {
          t: s.feedUpdatedAt.getTime(),
          counted: s.percentVotingPlacesCounted,
          candidates: Object.fromEntries(
            vs.map((v) => [
              v.cNo,
              total ? Math.round((v.votes / total) * 10000) / 100 : 0,
            ]),
          ),
        };
      }),
  };
}

/**
 * The newest feed timestamp across national *and* electorate snapshots: the
 * "version" of the results. Not cached itself: it's read inside each cached
 * page-data function, so a page's data and its version always come from the
 * same cache entry (both fresh or both stale), and by /api/status.
 */
async function resultsVersion(): Promise<number | null> {
  const [election, electorate] = await Promise.all([
    db
      .select({ t: max(schema.electionSnapshots.feedUpdatedAt) })
      .from(schema.electionSnapshots),
    db
      .select({ t: max(schema.electorateSnapshots.feedUpdatedAt) })
      .from(schema.electorateSnapshots),
  ]);
  const times = [election[0]?.t, electorate[0]?.t]
    .filter((t): t is Date => t instanceof Date)
    .map((t) => t.getTime());
  return times.length ? Math.max(...times) : null;
}

/**
 * Polled by browsers (via /api/status) to decide when to refresh. Cached, so
 * it runs once per revalidation rather than once per visitor.
 */
export async function getLastUpdated(): Promise<number | null> {
  "use cache";
  cacheLife("results");
  cacheTag(RESULTS_TAG);
  return resultsVersion();
}
