import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { cacheLife, cacheTag } from "next/cache";
import mapData from "@/data/electorate-map.json";
import { db, schema } from "@/db";
import { displayCandidateName, partyStyle } from "./parties";
import {
  eligiblePlaces,
  findStandouts,
  gapOf,
  type Standout,
} from "./standouts";

const ALL_ELECTORATES = [...mapData.general, ...mapData.maori];

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
  // A few have an empty part ("Flaxmere,, Flaxmere College Hall, …").
  const [area, venue, ...rest] = name
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (!venue) return { venue: area, area: "", address: "" };
  return { venue, area, address: rest.join(", ") };
}

/**
 * One voting place's results, for its share page and image: the place, its
 * electorate's results it's part of, and the electorate. Null if there's no
 * such electorate or place (or no votes there for that electorate).
 */
export async function findBooth(slug: string, id: string) {
  const electorate = ALL_ELECTORATES.find((e) => e.slug === slug);
  // Only an id as we write it ("16", not "016" or "0x10"): one page per place.
  const placeId = Number(id);
  if (!electorate || String(placeId) !== id) return null;
  const data = await getBoothResults(electorate.eNo);
  const place = data?.places.find((p) => p.id === placeId);
  return data && place ? { electorate, data, place } : null;
}

/**
 * A voting place to prerender, for routes under /booths/[id]: Cache
 * Components needs at least one to check the route at build. Any place will
 * do; with no booth data yet, a made-up id stands in.
 */
export async function boothSample() {
  const [first] = ALL_ELECTORATES;
  const data = await getBoothResults(first.eNo);
  return { slug: first.slug, id: String(data?.places[0]?.id ?? 0) };
}

export const isElectorateSlug = (slug: string) =>
  ALL_ELECTORATES.some((e) => e.slug === slug);

/** The top `n` in one vote at a place (`votes`, in `choices` order), with shares. */
export function boothTop<T>(votes: number[], choices: T[], n: number) {
  const total = votes.reduce((a, v) => a + v, 0);
  return votes
    .map((v, i) => ({ votes: v, i, choice: choices[i] }))
    .filter((v): v is typeof v & { choice: T } => v.votes > 0 && !!v.choice)
    .sort((a, b) => b.votes - a.votes)
    .slice(0, n)
    .map((v) => ({ ...v, percent: total ? (v.votes / total) * 100 : 0 }));
}

/**
 * Each electorate's home voting places: the places it took the most votes
 * for, among general electorates or among Māori electorates (every place
 * takes votes for both kinds, and Māori electorate votes are always the
 * smaller share). Standouts only count a place for its home electorates.
 */
export async function getHomePlaces(): Promise<Record<number, number[]>> {
  "use cache";
  cacheLife("hours");
  cacheTag(BOOTHS_TAG);

  const r = schema.boothResults;
  const rows = await db
    .select({
      placeId: r.votingPlaceId,
      eNo: r.eNo,
      stage: r.stage,
      votes: sql<number>`sum(${schema.boothPartyVotes.votes})::int`,
    })
    .from(r)
    .innerJoin(
      schema.boothPartyVotes,
      eq(schema.boothPartyVotes.boothResultId, r.id),
    )
    .groupBy(r.votingPlaceId, r.eNo, r.stage);

  // Each electorate's results come from one stage, as in getBoothResults.
  const official = new Set(
    rows.filter((x) => x.stage === STAGES.official).map((x) => x.eNo),
  );
  const top = new Map<string, { eNo: number; votes: number }>();
  for (const x of rows) {
    const stage = official.has(x.eNo) ? STAGES.official : STAGES.preliminary;
    if (x.stage !== stage) continue;
    const key = `${x.placeId}:${x.eNo > MAORI_FROM ? "maori" : "general"}`;
    const current = top.get(key);
    if (!current || x.votes > current.votes)
      top.set(key, { eNo: x.eNo, votes: x.votes });
  }
  const homes: Record<number, number[]> = {};
  for (const [key, { eNo }] of top) {
    const placeId = Number(key.split(":")[0]);
    const list = homes[eNo] ?? [];
    list.push(placeId);
    homes[eNo] = list;
  }
  return homes;
}

/** Electorate numbers above this are Māori electorates. */
const MAORI_FROM = 64;

/** How many standout places the nationwide list shows. */
const NATIONAL_STANDOUTS = 6;

type PlaceRef = {
  placeId: number;
  venue: string;
  area: string;
  electorate: string;
  slug: string;
};

export type NationalStandout = Standout &
  PlaceRef & { label: string; pNo: number | null };

export type BestPlace = PlaceRef & {
  pNo: number;
  label: string;
  share: number;
  votes: number;
};

/**
 * Standout voting places across the country (one per electorate, biggest
 * gap first), and every party's best voting place for the party vote. Null
 * before any booth results are loaded.
 */
export async function getNationalStandouts(): Promise<{
  stage: BoothResults["stage"];
  standouts: NationalStandout[];
  best: BestPlace[];
} | null> {
  "use cache";
  cacheLife("hours");
  cacheTag(BOOTHS_TAG);

  const [homes, all] = await Promise.all([
    getHomePlaces(),
    Promise.all(
      ALL_ELECTORATES.map(async (e) => ({
        e,
        data: await getBoothResults(e.eNo),
      })),
    ),
  ]);
  const loaded = all.flatMap(({ e, data }) => (data ? [{ e, data }] : []));
  if (!loaded.length) return null;

  const ref = (e: (typeof ALL_ELECTORATES)[number], place: BoothPlace) => ({
    placeId: place.id,
    venue: place.venue,
    area: place.area,
    electorate: e.name,
    slug: e.slug,
  });

  // The biggest standout in each electorate, then the biggest of those. A
  // place can be home to two electorates (general and Māori): once is enough.
  const standouts: NationalStandout[] = [];
  const seen = new Set<number>();
  const firsts = loaded
    .flatMap(({ e, data }) => {
      const [s] = findStandouts(data, homes[e.eNo] ?? []);
      return s ? [{ e, data, s }] : [];
    })
    .sort((a, b) => gapOf(b.s) - gapOf(a.s));
  for (const { e, data, s } of firsts) {
    if (standouts.length === NATIONAL_STANDOUTS) break;
    if (seen.has(s.placeId)) continue;
    seen.add(s.placeId);
    const place = data.places.find((p) => p.id === s.placeId);
    if (!place) continue;
    const c =
      s.vote === "candidate"
        ? data.candidates[s.choice]
        : data.parties[s.choice];
    standouts.push({
      ...s,
      ...ref(e, place),
      label:
        s.vote === "candidate"
          ? displayCandidateName(c?.name ?? "")
          : partyStyle(c?.pNo, c?.name).short,
      pNo: c?.pNo ?? null,
    });
  }

  // Each party's best place.
  const best = new Map<number, BestPlace>();
  for (const { e, data } of loaded) {
    for (const place of eligiblePlaces(data, homes[e.eNo] ?? [], "party")) {
      const total = place.party.reduce((a, n) => a + n, 0);
      place.party.forEach((n, i) => {
        const party = data.parties[i];
        if (!party) return;
        const share = (n / total) * 100;
        const current = best.get(party.pNo);
        if (current && current.share >= share) return;
        best.set(party.pNo, {
          ...ref(e, place),
          pNo: party.pNo,
          label: partyStyle(party.pNo, party.name).short,
          share,
          votes: total,
        });
      });
    }
  }
  return { stage: loaded[0].data.stage, standouts, best: [...best.values()] };
}
