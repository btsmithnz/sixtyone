import {
  boolean,
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
    index("electorate_snapshots_e_no_updated_idx").on(
      t.eNo,
      t.feedUpdatedAt.desc(),
    ),
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
