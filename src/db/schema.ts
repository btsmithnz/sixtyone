import {
  boolean,
  doublePrecision,
  index,
  integer,
  pgTable,
  primaryKey,
  real,
  serial,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";

/* ------------------------------------------------------------------ */
/* Reference data (from parties.xml, electorates.xml, candidates.xml) */
/* ------------------------------------------------------------------ */

export const parties = pgTable("parties", {
  pNo: integer("p_no").primaryKey(),
  abbrev: text("abbrev").notNull(),
  shortName: text("short_name").notNull(),
  name: text("name").notNull(),
  registered: boolean("registered").notNull(),
});

export const electorates = pgTable("electorates", {
  eNo: integer("e_no").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  kind: text("kind", { enum: ["general", "maori"] }).notNull(),
});

export const candidates = pgTable(
  "candidates",
  {
    cNo: integer("c_no").primaryKey(),
    /** As published: "SURNAME, Given". */
    name: text("name").notNull(),
    /** null for list-only candidates. */
    eNo: integer("e_no"),
    /** null for independents. */
    pNo: integer("p_no"),
    /** null when not on a party list. */
    listNo: integer("list_no"),
  },
  (t) => [index("candidates_e_no_idx").on(t.eNo)],
);

/* ------------------------------------------------------------------ */
/* Snapshots. One row per distinct `updated` timestamp in the feed.   */
/* ------------------------------------------------------------------ */

export const electionSnapshots = pgTable("election_snapshots", {
  id: serial("id").primaryKey(),
  /** The feed's `updated` attribute, converted from NZ local time. */
  feedUpdatedAt: timestamp("feed_updated_at", { withTimezone: true })
    .notNull()
    .unique(),
  capturedAt: timestamp("captured_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  votingPlacesCounted: integer("voting_places_counted").notNull(),
  percentVotingPlacesCounted: real("percent_voting_places_counted").notNull(),
  totalVotesCast: integer("total_votes_cast").notNull(),
  percentVotesCast: real("percent_votes_cast").notNull(),
  electoratesFinal: integer("electorates_final").notNull(),
  percentElectoratesFinal: real("percent_electorates_final").notNull(),
  minimalVotes: integer("minimal_votes").notNull(),
  specialVotes: integer("special_votes").notNull(),
});

export const electionPartySnapshots = pgTable(
  "election_party_snapshots",
  {
    snapshotId: integer("snapshot_id")
      .notNull()
      .references(() => electionSnapshots.id, { onDelete: "cascade" }),
    pNo: integer("p_no").notNull(),
    votes: integer("votes").notNull(),
    percentVotes: real("percent_votes").notNull(),
    partySeats: integer("party_seats").notNull(),
    candidateSeats: integer("candidate_seats").notNull(),
    totalSeats: integer("total_seats").notNull(),
  },
  (t) => [primaryKey({ columns: [t.snapshotId, t.pNo] })],
);

export const electorateSnapshots = pgTable(
  "electorate_snapshots",
  {
    id: serial("id").primaryKey(),
    eNo: integer("e_no").notNull(),
    feedUpdatedAt: timestamp("feed_updated_at", {
      withTimezone: true,
    }).notNull(),
    capturedAt: timestamp("captured_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    final: boolean("final").notNull(),
    totalVotingPlaces: integer("total_voting_places").notNull(),
    votingPlacesCounted: integer("voting_places_counted").notNull(),
    percentVotingPlacesCounted: real("percent_voting_places_counted").notNull(),
    totalVotesCast: integer("total_votes_cast").notNull(),
    percentVotesCast: real("percent_votes_cast").notNull(),
    partyInformals: integer("party_informals").notNull(),
    candidateInformals: integer("candidate_informals").notNull(),
  },
  (t) => [
    unique("electorate_snapshots_e_no_updated").on(t.eNo, t.feedUpdatedAt),
    // (The unique constraint's index also serves "latest per electorate".)
    // For the global "latest update" lookup that drives live refresh.
    index("electorate_snapshots_updated_idx").on(t.feedUpdatedAt.desc()),
  ],
);

export const electorateCandidateVotes = pgTable(
  "electorate_candidate_votes",
  {
    snapshotId: integer("snapshot_id")
      .notNull()
      .references(() => electorateSnapshots.id, { onDelete: "cascade" }),
    cNo: integer("c_no").notNull(),
    votes: integer("votes").notNull(),
  },
  (t) => [primaryKey({ columns: [t.snapshotId, t.cNo] })],
);

export const electoratePartyVotes = pgTable(
  "electorate_party_votes",
  {
    snapshotId: integer("snapshot_id")
      .notNull()
      .references(() => electorateSnapshots.id, { onDelete: "cascade" }),
    pNo: integer("p_no").notNull(),
    votes: integer("votes").notNull(),
  },
  (t) => [primaryKey({ columns: [t.snapshotId, t.pNo] })],
);

/* ------------------------------------------------------------------ */
/* Booth (voting place) results, from the Commission's per-electorate */
/* voting place statistics. Loaded by scripts/import-booths.ts.        */
/* ------------------------------------------------------------------ */

export const votingPlaces = pgTable("voting_places", {
  id: serial("id").primaryKey(),
  /** As published: "Ponsonby, Ponsonby Primary School, 44 Curran Street". */
  name: text("name").notNull().unique(),
  /** null when the place can't be mapped (mobile teams, care homes). */
  lat: doublePrecision("lat"),
  lon: doublePrecision("lon"),
  /** How it was geocoded: manual, address, nearby, corner, road, locality or mobile. */
  geoPrecision: text("geo_precision"),
});

export const boothResults = pgTable(
  "booth_results",
  {
    id: serial("id").primaryKey(),
    /** e.g. "2026-preliminary", "2026-official". */
    stage: text("stage").notNull(),
    /** The electorate whose votes these are (not where the place is). */
    eNo: integer("e_no").notNull(),
    votingPlaceId: integer("voting_place_id")
      .notNull()
      .references(() => votingPlaces.id),
    section: text("section", { enum: ["advance", "election_day"] }).notNull(),
    partyInformals: integer("party_informals").notNull(),
    candidateInformals: integer("candidate_informals").notNull(),
  },
  (t) => [
    // e_no first: pages read one electorate's results at a time.
    unique("booth_results_place").on(
      t.eNo,
      t.stage,
      t.votingPlaceId,
      t.section,
    ),
  ],
);

/** Places with fewer than 6 votes are published as all zeros, for secrecy. */
export const boothPartyVotes = pgTable(
  "booth_party_votes",
  {
    boothResultId: integer("booth_result_id")
      .notNull()
      .references(() => boothResults.id, { onDelete: "cascade" }),
    pNo: integer("p_no").notNull(),
    votes: integer("votes").notNull(),
  },
  (t) => [primaryKey({ columns: [t.boothResultId, t.pNo] })],
);

export const boothCandidateVotes = pgTable(
  "booth_candidate_votes",
  {
    boothResultId: integer("booth_result_id")
      .notNull()
      .references(() => boothResults.id, { onDelete: "cascade" }),
    cNo: integer("c_no").notNull(),
    votes: integer("votes").notNull(),
  },
  (t) => [primaryKey({ columns: [t.boothResultId, t.cNo] })],
);

/* ------------------------------------------------------------------ */
/* Scraper bookkeeping                                                 */
/* ------------------------------------------------------------------ */

/** Last-Modified per feed file, for conditional (If-Modified-Since) requests. */
export const feedFiles = pgTable("feed_files", {
  path: text("path").primaryKey(),
  lastModified: text("last_modified"),
  checkedAt: timestamp("checked_at", { withTimezone: true }).notNull(),
});

export const scrapeRuns = pgTable("scrape_runs", {
  id: serial("id").primaryKey(),
  startedAt: timestamp("started_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  status: text("status", { enum: ["running", "ok", "error"] }).notNull(),
  requests: integer("requests").notNull().default(0),
  electionChanged: boolean("election_changed").notNull().default(false),
  electoratesChanged: integer("electorates_changed").notNull().default(0),
  error: text("error"),
});
