import type { BoothPlace, BoothResults } from "./booths";

/*
 * Standout voting places: where a candidate or party did far better than
 * across the rest of their electorate. The rules are simple on purpose, so
 * the page can say exactly how places were picked:
 *
 *  - at least STANDOUT_MIN_VOTES votes (in the vote being compared), as
 *    small places swing wildly
 *  - counted only for its home electorate: the general and Māori electorates
 *    it took the most votes for. A place also takes a few votes for
 *    electorates elsewhere (students voting for home at a university, say),
 *    and those voters are nothing like the electorate's own
 *  - not a mobile team, which is many places at once
 *
 * A place's standout is its biggest gap, in percentage points, between a
 * share here and the same share across the electorate's voting places.
 */

export const STANDOUT_MIN_VOTES = 100;
/** Gaps smaller than this (in points) aren't standouts. */
export const STANDOUT_MIN_GAP = 15;

export type Vote = "candidate" | "party";

export type Standout = {
  placeId: number;
  vote: Vote;
  /** Index into BoothResults.candidates or .parties, as `vote` says. */
  choice: number;
  /** Their share here and across the electorate's voting places (%). */
  share: number;
  electorateShare: number;
};

export const gapOf = (s: Pick<Standout, "share" | "electorateShare">) =>
  s.share - s.electorateShare;

export const votesIn = (place: BoothPlace, vote: Vote) =>
  vote === "candidate" ? place.candidate : place.party;

const sum = (ns: number[]) => ns.reduce((a, n) => a + n, 0);

/** The places that can be standouts: see the rules above. */
export function eligiblePlaces(
  data: BoothResults,
  home: Iterable<number>,
  vote: Vote,
) {
  const homes = new Set(home);
  return data.places.filter(
    (p) =>
      homes.has(p.id) &&
      p.located !== "mobile" &&
      sum(votesIn(p, vote)) >= STANDOUT_MIN_VOTES,
  );
}

/** Each choice's share (%) of a vote across all of the electorate's places. */
export function electorateShares(data: BoothResults, vote: Vote) {
  const width =
    vote === "candidate" ? data.candidates.length : data.parties.length;
  const totals = Array.from({ length: width }, (_, i) =>
    sum(data.places.map((p) => votesIn(p, vote)[i] ?? 0)),
  );
  const grand = sum(totals) || 1;
  return totals.map((n) => (n / grand) * 100);
}

/**
 * An electorate's standout places, biggest gap first: one per place, its
 * biggest gap in `votes` (both, unless you say). `home` is the places it's
 * the home electorate of (see getHomePlaces).
 */
export function findStandouts(
  data: BoothResults,
  home: Iterable<number>,
  votes: readonly Vote[] = ["candidate", "party"],
): Standout[] {
  const best = new Map<number, Standout>();
  for (const vote of votes) {
    const overall = electorateShares(data, vote);
    for (const place of eligiblePlaces(data, home, vote)) {
      const votes = votesIn(place, vote);
      const total = sum(votes);
      votes.forEach((n, choice) => {
        const s = {
          placeId: place.id,
          vote,
          choice,
          share: (n / total) * 100,
          electorateShare: overall[choice] ?? 0,
        };
        const current = best.get(place.id);
        if (!current || gapOf(s) > gapOf(current)) best.set(place.id, s);
      });
    }
  }
  return [...best.values()]
    .filter((s) => gapOf(s) >= STANDOUT_MIN_GAP)
    .sort((a, b) => gapOf(b) - gapOf(a));
}
