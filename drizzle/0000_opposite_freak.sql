CREATE TABLE "candidates" (
	"c_no" integer PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"e_no" integer,
	"p_no" integer,
	"list_no" integer
);
--> statement-breakpoint
CREATE TABLE "election_party_snapshots" (
	"snapshot_id" integer NOT NULL,
	"p_no" integer NOT NULL,
	"votes" integer NOT NULL,
	"percent_votes" real NOT NULL,
	"party_seats" integer NOT NULL,
	"candidate_seats" integer NOT NULL,
	"total_seats" integer NOT NULL,
	CONSTRAINT "election_party_snapshots_snapshot_id_p_no_pk" PRIMARY KEY("snapshot_id","p_no")
);
--> statement-breakpoint
CREATE TABLE "election_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"feed_updated_at" timestamp with time zone NOT NULL,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL,
	"voting_places_counted" integer NOT NULL,
	"percent_voting_places_counted" real NOT NULL,
	"total_votes_cast" integer NOT NULL,
	"percent_votes_cast" real NOT NULL,
	"electorates_final" integer NOT NULL,
	"percent_electorates_final" real NOT NULL,
	"minimal_votes" integer NOT NULL,
	"special_votes" integer NOT NULL,
	CONSTRAINT "election_snapshots_feed_updated_at_unique" UNIQUE("feed_updated_at")
);
--> statement-breakpoint
CREATE TABLE "electorate_candidate_votes" (
	"snapshot_id" integer NOT NULL,
	"c_no" integer NOT NULL,
	"votes" integer NOT NULL,
	CONSTRAINT "electorate_candidate_votes_snapshot_id_c_no_pk" PRIMARY KEY("snapshot_id","c_no")
);
--> statement-breakpoint
CREATE TABLE "electorate_party_votes" (
	"snapshot_id" integer NOT NULL,
	"p_no" integer NOT NULL,
	"votes" integer NOT NULL,
	CONSTRAINT "electorate_party_votes_snapshot_id_p_no_pk" PRIMARY KEY("snapshot_id","p_no")
);
--> statement-breakpoint
CREATE TABLE "electorate_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"e_no" integer NOT NULL,
	"feed_updated_at" timestamp with time zone NOT NULL,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL,
	"final" boolean NOT NULL,
	"total_voting_places" integer NOT NULL,
	"voting_places_counted" integer NOT NULL,
	"percent_voting_places_counted" real NOT NULL,
	"total_votes_cast" integer NOT NULL,
	"percent_votes_cast" real NOT NULL,
	"party_informals" integer NOT NULL,
	"candidate_informals" integer NOT NULL,
	CONSTRAINT "electorate_snapshots_e_no_updated" UNIQUE("e_no","feed_updated_at")
);
--> statement-breakpoint
CREATE TABLE "electorates" (
	"e_no" integer PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"kind" text NOT NULL,
	CONSTRAINT "electorates_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "feed_files" (
	"path" text PRIMARY KEY NOT NULL,
	"last_modified" text,
	"checked_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "parties" (
	"p_no" integer PRIMARY KEY NOT NULL,
	"abbrev" text NOT NULL,
	"short_name" text NOT NULL,
	"name" text NOT NULL,
	"registered" boolean NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scrape_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"status" text NOT NULL,
	"requests" integer DEFAULT 0 NOT NULL,
	"election_changed" boolean DEFAULT false NOT NULL,
	"electorates_changed" integer DEFAULT 0 NOT NULL,
	"error" text
);
--> statement-breakpoint
ALTER TABLE "election_party_snapshots" ADD CONSTRAINT "election_party_snapshots_snapshot_id_election_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."election_snapshots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "electorate_candidate_votes" ADD CONSTRAINT "electorate_candidate_votes_snapshot_id_electorate_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."electorate_snapshots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "electorate_party_votes" ADD CONSTRAINT "electorate_party_votes_snapshot_id_electorate_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."electorate_snapshots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "candidates_e_no_idx" ON "candidates" USING btree ("e_no");--> statement-breakpoint
CREATE INDEX "electorate_snapshots_e_no_updated_idx" ON "electorate_snapshots" USING btree ("e_no","feed_updated_at" DESC NULLS LAST);