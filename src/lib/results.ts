import "server-only";
import { and, asc, desc, eq, gt, inArray, max, sql } from "drizzle-orm";
import { cacheLife, cacheTag } from "next/cache";
import { db, schema } from "@/db";
import { allocateSeats } from "./seats";
import type { CountStage, PrelimLeader } from "./stage";

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
  /** The count this electorate's latest result comes from. */
  stage: CountStage;
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
  /**
   * Party vote share here of the leading candidate's own party: compare with
   * the candidate's share for their personal vote. Null without a party.
   */
  leaderPartyPercent: number | null;
  /** Election night's result here, once the official count is in; else null. */
  preliminary: ElectoratePrelim | null;
};

/** An electorate's final election-night result, to compare with the official one. */
export type ElectoratePrelim = {
  leader: PrelimLeader | null;
  margin: number | null;
  marginPoints: number | null;
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
  /** Election night's numbers, once the official count is in; else null. */
  preliminary: PartyPrelim | null;
};

export type PartyPrelim = {
  percent: number;
  electorateSeats: number;
  listSeats: number;
  totalSeats: number;
};

export type Overview = {
  /** Results version this data was read at; see resultsVersion(). */
  version: number | null;
  updatedAt: number | null;
  /** The count the national result comes from: the latest there is. */
  stage: CountStage;
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
  /** Election night's final national numbers, once the official count is in. */
  preliminary: {
    updatedAt: number;
    totalVotesCast: number;
    houseSize: number;
  } | null;
  electorates: ElectorateSummary[];
  /**
   * Party vote share (%) in each electorate, by electorate number, then
   * party number. Kept apart from ElectorateSummary, which goes to the
   * browser in the map and lists, as only the server needs it.
   */
  electoratePartyShares: Record<number, Record<number, number>>;
  /** Every candidate, for working out who's elected (see lib/parliament.ts). */
  candidates: {
    cNo: number;
    name: string;
    eNo: number | null;
    pNo: number | null;
    listNo: number | null;
  }[];
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

/** Each electorate's newest snapshot, optionally from one count only. */
async function latestElectorateSnapshots(stage?: CountStage) {
  const s = schema.electorateSnapshots;
  return db
    .selectDistinctOn([s.eNo])
    .from(s)
    .where(stage ? eq(s.stage, stage) : undefined)
    .orderBy(s.eNo, desc(s.feedUpdatedAt));
}

/** The newest national snapshot, optionally from one count only. */
async function latestElectionSnapshot(stage?: CountStage) {
  const s = schema.electionSnapshots;
  const [row] = await db
    .select()
    .from(s)
    .where(stage ? eq(s.stage, stage) : undefined)
    .orderBy(desc(s.feedUpdatedAt))
    .limit(1);
  return row;
}

function summarise(
  e: { eNo: number; name: string; slug: string; kind: "general" | "maori" },
  snap: typeof schema.electorateSnapshots.$inferSelect | undefined,
  candidateVotes: { cNo: number; votes: number }[],
  partyVotes: { pNo: number; votes: number }[],
  candidateById: Map<number, typeof schema.candidates.$inferSelect>,
  preliminary: ElectoratePrelim | null = null,
): ElectorateSummary {
  const official = snap?.stage === "official";
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
  // A candidate's party may not be on the party ballot; then there's no comparison.
  const leaderParty =
    hasVotes && first?.pNo
      ? partyVotes.find((p) => p.pNo === first.pNo)
      : undefined;
  return {
    ...e,
    updatedAt: snap?.feedUpdatedAt.getTime() ?? null,
    stage: snap?.stage ?? "preliminary",
    totalPlaces: snap?.totalVotingPlaces ?? 0,
    placesCounted: snap?.votingPlacesCounted ?? 0,
    // The official count is complete by definition, whatever a source says
    // about voting places (the Commission's CSVs don't say at all).
    percentCounted: official ? 100 : (snap?.percentVotingPlacesCounted ?? 0),
    votesCast: snap?.totalVotesCast ?? 0,
    complete:
      official ||
      (!!snap &&
        snap.totalVotingPlaces > 0 &&
        snap.votingPlacesCounted >= snap.totalVotingPlaces),
    candidates,
    margin: hasVotes && second ? first.votes - second.votes : null,
    marginPoints: hasVotes && second ? first.percent - second.percent : null,
    partyVoteLeader:
      partyTotal && topParty
        ? { pNo: topParty.pNo, percent: (topParty.votes / partyTotal) * 100 }
        : null,
    leaderPartyPercent:
      partyTotal && leaderParty ? (leaderParty.votes / partyTotal) * 100 : null,
    preliminary,
  };
}

/** The part of a summary kept as election night's result. */
function prelimOf(s: ElectorateSummary): ElectoratePrelim {
  const lead = s.margin !== null ? s.candidates[0] : undefined;
  return {
    leader: lead ? { cNo: lead.cNo, name: lead.name, pNo: lead.pNo } : null,
    margin: s.margin,
    marginPoints: s.marginPoints,
  };
}

const groupBySnapshot = <T extends { snapshotId: number }>(rows: T[]) => {
  const m = new Map<number, T[]>();
  for (const r of rows) {
    const list = m.get(r.snapshotId);
    if (list) list.push(r);
    else m.set(r.snapshotId, [r]);
  }
  return m;
};

type NationalPartyRow = typeof schema.electionPartySnapshots.$inferSelect;
type SeatCounts = {
  electorateSeats: number;
  listSeats: number;
  totalSeats: number;
};

/**
 * Seats for one national snapshot: the Commission's allocation when it has
 * published one, else our own projection from the votes and electorate leads.
 */
function seatsFor(
  nationalParties: NationalPartyRow[],
  electorates: ElectorateSummary[],
): {
  seatsSource: Overview["seatsSource"];
  houseSize: number;
  seats: Map<number, SeatCounts>;
} {
  const feedSeats = nationalParties.reduce((a, p) => a + p.totalSeats, 0);
  const totalVotes = nationalParties.reduce((a, p) => a + p.votes, 0);
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
  if (feedSeats > 0) {
    return {
      seatsSource: "feed",
      // 120 plus any overhang, which the Commission's party totals include.
      houseSize: Math.max(120, feedSeats + outsideWins),
      seats: new Map(
        nationalParties.map((p) => [
          p.pNo,
          {
            electorateSeats: p.candidateSeats,
            listSeats: p.partySeats,
            totalSeats: p.totalSeats,
          },
        ]),
      ),
    };
  }
  if (totalVotes > 0) {
    const alloc = allocateSeats({
      partyVotes: new Map(nationalParties.map((p) => [p.pNo, p.votes])),
      electorateWins: wins,
      independentWins: outsideWins,
    });
    return {
      seatsSource: "projected",
      houseSize: alloc.totalSeats,
      seats: new Map(alloc.parties.map(({ pNo, ...counts }) => [pNo, counts])),
    };
  }
  return { seatsSource: "none", houseSize: 120, seats: new Map() };
}

export async function getOverview(): Promise<Overview> {
  "use cache";
  cacheLife("results");
  cacheTag(RESULTS_TAG);

  const [ref, national, snaps, version] = await Promise.all([
    loadReference(),
    latestElectionSnapshot(),
    latestElectorateSnapshots(),
    resultsVersion(),
  ]);
  const stage = national?.stage ?? "preliminary";
  // Once the official count is in, election night's final numbers are the
  // baseline for what changed. Only then is this worth the extra queries.
  const [prelimNational, prelimSnaps] =
    stage === "official"
      ? await Promise.all([
          latestElectionSnapshot("preliminary"),
          latestElectorateSnapshots("preliminary"),
        ])
      : [undefined, []];

  const snapIds = snaps.map((s) => s.id);
  const nationalIds = [national?.id, prelimNational?.id].filter(
    (id) => id !== undefined,
  );
  const [cVotes, pVotes, nationalParties] = await Promise.all([
    snapIds.length
      ? db
          .select()
          .from(schema.electorateCandidateVotes)
          .where(
            inArray(schema.electorateCandidateVotes.snapshotId, [
              ...snapIds,
              ...prelimSnaps.map((s) => s.id),
            ]),
          )
      : [],
    snapIds.length
      ? db
          .select()
          .from(schema.electoratePartyVotes)
          .where(inArray(schema.electoratePartyVotes.snapshotId, snapIds))
      : [],
    nationalIds.length
      ? db
          .select()
          .from(schema.electionPartySnapshots)
          .where(inArray(schema.electionPartySnapshots.snapshotId, nationalIds))
      : [],
  ]);

  const candidateById = new Map(ref.candidates.map((c) => [c.cNo, c]));
  const cBySnap = groupBySnapshot(cVotes);
  const pBySnap = groupBySnapshot(pVotes);
  const partiesBySnap = groupBySnapshot(nationalParties);

  /** Every electorate, from one snapshot each (missing: no results yet). */
  const summariseAll = (
    byENo: Map<number, typeof schema.electorateSnapshots.$inferSelect>,
    prelims?: Map<number, ElectoratePrelim>,
  ) =>
    ref.electorates.map((e) => {
      const snap = byENo.get(e.eNo);
      return summarise(
        e,
        snap,
        snap ? (cBySnap.get(snap.id) ?? []) : [],
        snap ? (pBySnap.get(snap.id) ?? []) : [],
        candidateById,
        prelims?.get(e.eNo) ?? null,
      );
    });

  // Election night, summarised the same way, for comparison.
  const prelimElectorates = prelimSnaps.length
    ? summariseAll(new Map(prelimSnaps.map((s) => [s.eNo, s])))
    : [];
  const prelimByENo = new Map(
    prelimElectorates.map((e) => [e.eNo, prelimOf(e)]),
  );
  const electorates = summariseAll(
    new Map(snaps.map((s) => [s.eNo, s])),
    prelimByENo,
  );

  const partyRows = national ? (partiesBySnap.get(national.id) ?? []) : [];
  const { seatsSource, houseSize, seats } = seatsFor(partyRows, electorates);
  const prelimRows = prelimNational
    ? (partiesBySnap.get(prelimNational.id) ?? [])
    : [];
  const prelimSeats = prelimNational
    ? seatsFor(prelimRows, prelimElectorates)
    : null;
  const shareOf = (rows: NationalPartyRow[]) => {
    const total = rows.reduce((a, p) => a + p.votes, 0);
    return new Map(
      rows.map((p) => [p.pNo, total ? (p.votes / total) * 100 : 0]),
    );
  };
  const shares = shareOf(partyRows);
  const prelimShares = shareOf(prelimRows);

  const partyByNo = new Map(ref.parties.map((p) => [p.pNo, p]));
  const noSeats: SeatCounts = {
    electorateSeats: 0,
    listSeats: 0,
    totalSeats: 0,
  };
  const parties: PartyResult[] = partyRows
    .map((p) => {
      const ref = partyByNo.get(p.pNo);
      const prelimPercent = prelimShares.get(p.pNo);
      return {
        pNo: p.pNo,
        abbrev: ref?.abbrev ?? String(p.pNo),
        name: ref?.name ?? `Party ${p.pNo}`,
        votes: p.votes,
        percent: shares.get(p.pNo) ?? 0,
        ...(seats.get(p.pNo) ?? noSeats),
        preliminary:
          prelimSeats && prelimPercent !== undefined
            ? {
                percent: prelimPercent,
                ...(prelimSeats.seats.get(p.pNo) ?? noSeats),
              }
            : null,
      };
    })
    .sort((a, b) => b.votes - a.votes || b.totalSeats - a.totalSeats);

  return {
    version,
    updatedAt: national?.feedUpdatedAt.getTime() ?? null,
    stage,
    stats: national
      ? {
          votingPlacesCounted: national.votingPlacesCounted,
          percentCounted:
            stage === "official" ? 100 : national.percentVotingPlacesCounted,
          totalVotesCast: national.totalVotesCast,
          turnoutPercent: national.percentVotesCast,
          electoratesComplete: electorates.filter((e) => e.complete).length,
        }
      : null,
    parties,
    seatsSource,
    houseSize,
    preliminary:
      prelimNational && prelimSeats
        ? {
            updatedAt: prelimNational.feedUpdatedAt.getTime(),
            totalVotesCast: prelimNational.totalVotesCast,
            houseSize: prelimSeats.houseSize,
          }
        : null,
    electorates,
    electoratePartyShares: Object.fromEntries(
      snaps.map((snap) => {
        const votes = pBySnap.get(snap.id) ?? [];
        const total = votes.reduce((a, p) => a + p.votes, 0);
        return [
          snap.eNo,
          Object.fromEntries(
            votes.map((p) => [p.pNo, total ? (p.votes / total) * 100 : 0]),
          ),
        ];
      }),
    ),
    candidates: ref.candidates.map(({ cNo, name, eNo, pNo, listNo }) => ({
      cNo,
      name,
      eNo,
      pNo,
      listNo,
    })),
  };
}

/* --------------------------------- history -------------------------------- */

export type NationalPoint = {
  t: number;
  counted: number;
  parties: Record<number, { percent: number; seats: number }>;
};

/**
 * National party vote and seats through election night's count, oldest
 * first. The official count isn't a point on this timeline: it lands weeks
 * later, and pages draw it from the overview instead.
 */
export async function getNationalHistory(): Promise<{
  /** Results version this data was read at; see resultsVersion(). */
  version: number | null;
  points: NationalPoint[];
}> {
  "use cache";
  cacheLife("results");
  cacheTag(RESULTS_TAG);

  const s = schema.electionSnapshots;
  const [snaps, version] = await Promise.all([
    chartPoints(
      db
        .selectDistinctOn([countedBucket(s.percentVotingPlacesCounted)], {
          id: s.id,
          feedUpdatedAt: s.feedUpdatedAt,
          percentVotingPlacesCounted: s.percentVotingPlacesCounted,
        })
        .from(s)
        // Election night only: the official count is drawn separately.
        .where(and(eq(s.stage, "preliminary"), gt(s.totalVotesCast, 0)))
        .orderBy(
          countedBucket(s.percentVotingPlacesCounted),
          desc(s.feedUpdatedAt),
        ),
    ),
    resultsVersion(),
  ]);
  if (!snaps.length) return { version, points: [] };
  const rows = await db
    .select({
      snapshotId: schema.electionPartySnapshots.snapshotId,
      pNo: schema.electionPartySnapshots.pNo,
      votes: schema.electionPartySnapshots.votes,
      totalSeats: schema.electionPartySnapshots.totalSeats,
    })
    .from(schema.electionPartySnapshots)
    .where(
      inArray(
        schema.electionPartySnapshots.snapshotId,
        snaps.map((s) => s.id),
      ),
    );
  const bySnap = groupBySnapshot(rows);
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

  const s = schema.electorateSnapshots;
  const newest = (stage?: CountStage) =>
    db
      .select()
      .from(s)
      .where(
        and(eq(s.eNo, electorate.eNo), stage ? eq(s.stage, stage) : undefined),
      )
      .orderBy(desc(s.feedUpdatedAt))
      .limit(1);
  const [[latest], [lastPrelim], snaps, standing, version] = await Promise.all([
    newest(),
    // Election night's final result, for comparison once the official count
    // is in. (Before then it's the same row as `latest`.)
    newest("preliminary"),
    chartPoints(
      db
        .selectDistinctOn([countedBucket(s.percentVotingPlacesCounted)], {
          id: s.id,
          feedUpdatedAt: s.feedUpdatedAt,
          percentVotingPlacesCounted: s.percentVotingPlacesCounted,
        })
        .from(s)
        .where(
          and(
            eq(s.eNo, electorate.eNo),
            eq(s.stage, "preliminary"),
            gt(s.totalVotesCast, 0),
          ),
        )
        .orderBy(
          countedBucket(s.percentVotingPlacesCounted),
          desc(s.feedUpdatedAt),
        ),
    ),
    db
      .select()
      .from(schema.candidates)
      .where(eq(schema.candidates.eNo, electorate.eNo)),
    resultsVersion(),
  ]);
  const baseline = latest?.stage === "official" ? lastPrelim : undefined;
  // The latest snapshots are normally chart points too; they're needed either way.
  const ids = [
    ...new Set(
      [...snaps, latest, baseline]
        .filter((x) => x !== undefined)
        .map((x) => x.id),
    ),
  ];
  const [cVotes, pVotes] = await Promise.all([
    ids.length
      ? db
          .select({
            snapshotId: schema.electorateCandidateVotes.snapshotId,
            cNo: schema.electorateCandidateVotes.cNo,
            votes: schema.electorateCandidateVotes.votes,
          })
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
  const bySnap = groupBySnapshot(cVotes);
  const summary = summarise(
    electorate,
    latest,
    latest
      ? (bySnap.get(latest.id) ?? [])
      : standing.map((c) => ({ cNo: c.cNo, votes: 0 })),
    pVotes,
    candidateById,
    baseline
      ? prelimOf(
          summarise(
            electorate,
            baseline,
            bySnap.get(baseline.id) ?? [],
            [],
            candidateById,
          ),
        )
      : null,
  );

  const partyTotal = pVotes.reduce((a, p) => a + p.votes, 0);

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
    history: snaps.map((s) => {
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
 * Charts get one point per whole percent of voting places counted (the latest
 * snapshot in each), so a history is at most ~101 points however often the
 * feed updates. Without this, every page rebuild re-read every snapshot ever
 * stored, and that grew all night.
 */
const countedBucket = (
  col:
    | typeof schema.electionSnapshots.percentVotingPlacesCounted
    | typeof schema.electorateSnapshots.percentVotingPlacesCounted,
) => sql`floor(${col})`;

/** DISTINCT ON returns rows in bucket order; charts want time order. */
async function chartPoints<T extends { feedUpdatedAt: Date }>(
  rows: Promise<T[]>,
) {
  return (await rows).sort(
    (a, b) => a.feedUpdatedAt.getTime() - b.feedUpdatedAt.getTime(),
  );
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
