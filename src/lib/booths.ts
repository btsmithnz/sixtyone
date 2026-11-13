import "server-only";
import { and, eq } from "drizzle-orm";
import { cacheLife, cacheTag } from "next/cache";
import { db, schema } from "@/db";

/**
 * Booth (voting place) results for one electorate, from the Commission's
 * voting place statistics (loaded by scripts/import-booths.ts). The official
 * count replaces the preliminary one once it's loaded.
 */
export type BoothResults = {
  stage: "preliminary" | "official";
  /** Party vote columns, biggest first. */
  parties: { pNo: number; name: string }[];
  /** Candidate vote columns, biggest first. */
  candidates: { cNo: number; name: string; pNo: number | null }[];
  /** Places with at least one vote for this electorate. */
  places: BoothPlace[];
  /** Places published as all zeros: they took fewer than 6 votes. */
  suppressed: number;
};

export type BoothPlace = {
  id: number;
  /** "Ponsonby Primary School" */
  venue: string;
  /** "Ponsonby" */
  area: string;
  /** "44 Curran Street" (may be empty). */
  address: string;
  /** Null when the place isn't on the map. */
  lat: number | null;
  lon: number | null;
  /**
   * "approximate": located to a road or suburb, not an address. "mobile": a
   * team visiting care homes, hospitals and the like, so not one place.
   * "unknown": a place we couldn't locate.
   */
  located: "address" | "approximate" | "mobile" | "unknown";
  /** Valid party votes cast in advance and on election day. */
  advance: number;
  electionDay: number;
  /** Votes in the order of BoothResults.parties / .candidates. */
  party: number[];
  candidate: number[];
};

const STAGES = { official: "2026-official", preliminary: "2026-preliminary" };

/**
 * Booth results only change when scripts/import-booths.ts runs, so they get
 * their own tag (scrapes don't throw them away) and refresh hourly: pages pick
 * up an import within the hour, or straight away on a redeploy.
 */
export const BOOTHS_TAG = "booths";

export async function getBoothResults(
  eNo: number,
): Promise<BoothResults | null> {
  "use cache";
  cacheLife("hours");
  cacheTag(BOOTHS_TAG);

  const r = schema.boothResults;
  const rows = await db
    .select({
      id: r.id,
      stage: r.stage,
      section: r.section,
      placeId: schema.votingPlaces.id,
      name: schema.votingPlaces.name,
      lat: schema.votingPlaces.lat,
      lon: schema.votingPlaces.lon,
      geoPrecision: schema.votingPlaces.geoPrecision,
    })
    .from(r)
    .innerJoin(schema.votingPlaces, eq(r.votingPlaceId, schema.votingPlaces.id))
    .where(eq(r.eNo, eNo));
  const stage = rows.some((x) => x.stage === STAGES.official)
    ? "official"
    : rows.some((x) => x.stage === STAGES.preliminary)
      ? "preliminary"
      : null;
  if (!stage) return null;

  const inStage = and(eq(r.eNo, eNo), eq(r.stage, STAGES[stage]));
  const [partyVotes, candidateVotes, standing, parties] = await Promise.all([
    db
      .select({
        id: schema.boothPartyVotes.boothResultId,
        key: schema.boothPartyVotes.pNo,
        votes: schema.boothPartyVotes.votes,
      })
      .from(schema.boothPartyVotes)
      .innerJoin(r, eq(schema.boothPartyVotes.boothResultId, r.id))
      .where(inStage),
    db
      .select({
        id: schema.boothCandidateVotes.boothResultId,
        key: schema.boothCandidateVotes.cNo,
        votes: schema.boothCandidateVotes.votes,
      })
      .from(schema.boothCandidateVotes)
      .innerJoin(r, eq(schema.boothCandidateVotes.boothResultId, r.id))
      .where(inStage),
    db.select().from(schema.candidates).where(eq(schema.candidates.eNo, eNo)),
    db
      .select({ pNo: schema.parties.pNo, name: schema.parties.shortName })
      .from(schema.parties),
  ]);

  // Columns: every party or candidate with a vote here, biggest first.
  const columns = (votes: { key: number; votes: number }[]) => {
    const totals = new Map<number, number>();
    for (const v of votes)
      totals.set(v.key, (totals.get(v.key) ?? 0) + v.votes);
    return [...totals]
      .filter(([, n]) => n > 0)
      .sort((a, b) => b[1] - a[1] || a[0] - b[0])
      .map(([key]) => key);
  };
  const partyCols = columns(partyVotes);
  const candidateCols = columns(candidateVotes);
  const partyIndex = new Map(partyCols.map((k, i) => [k, i]));
  const candidateIndex = new Map(candidateCols.map((k, i) => [k, i]));

  // One entry per place: advance and election-day results at the same venue
  // are added together.
  const byPlace = new Map<number, BoothPlace>();
  const placeOf = new Map<number, BoothPlace>();
  for (const row of rows) {
    if (row.stage !== STAGES[stage]) continue;
    let place = byPlace.get(row.placeId);
    if (!place) {
      place = {
        id: row.placeId,
        // Mobile teams' names don't follow the pattern, so keep them whole.
        ...(row.geoPrecision === "mobile"
          ? { venue: row.name, area: "", address: "" }
          : splitName(row.name)),
        lat: row.lat,
        lon: row.lon,
        located: locatedOf(row),
        advance: 0,
        electionDay: 0,
        party: partyCols.map(() => 0),
        candidate: candidateCols.map(() => 0),
      };
      byPlace.set(row.placeId, place);
    }
    placeOf.set(row.id, place);
  }
  const sectionOf = new Map(rows.map((x) => [x.id, x.section]));
  for (const v of partyVotes) {
    const place = placeOf.get(v.id);
    const i = partyIndex.get(v.key);
    if (!place || i === undefined) continue;
    place.party[i] += v.votes;
    if (sectionOf.get(v.id) === "advance") place.advance += v.votes;
    else place.electionDay += v.votes;
  }
  for (const v of candidateVotes) {
    const place = placeOf.get(v.id);
    const i = candidateIndex.get(v.key);
    if (place && i !== undefined) place.candidate[i] += v.votes;
  }

  const all = [...byPlace.values()];
  const places = all.filter(
    (p) => p.advance + p.electionDay > 0 || p.candidate.some((n) => n > 0),
  );
  const candidateById = new Map(standing.map((c) => [c.cNo, c]));
  const partyName = new Map(parties.map((p) => [p.pNo, p.name]));
  return {
    stage,
    parties: partyCols.map((pNo) => ({
      pNo,
      name: partyName.get(pNo) ?? `Party ${pNo}`,
    })),
    candidates: candidateCols.map((cNo) => ({
      cNo,
      name: candidateById.get(cNo)?.name ?? `Candidate ${cNo}`,
      pNo: candidateById.get(cNo)?.pNo ?? null,
    })),
    places,
    suppressed: all.length - places.length,
  };
}

function locatedOf(place: {
  lat: number | null;
  geoPrecision: string | null;
}): BoothPlace["located"] {
  if (place.geoPrecision === "mobile") return "mobile";
  if (place.lat === null) return "unknown";
  return place.geoPrecision === "road" || place.geoPrecision === "locality"
    ? "approximate"
    : "address";
}

/**
 * The Commission names places "Suburb, Venue, address…":
 * "Ponsonby, Ponsonby Primary School, 44 Curran Street". Mobile voting is
 * just "Taken in Wellington Hospital" or similar, so that's the venue.
 */
export function splitName(name: string) {
  const [area, venue, ...rest] = name.split(",").map((s) => s.trim());
  if (!venue) return { venue: area, area: "", address: "" };
  return { venue, area, address: rest.join(", ") };
}
