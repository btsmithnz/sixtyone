CREATE TABLE "booth_candidate_votes" (
	"booth_result_id" integer NOT NULL,
	"c_no" integer NOT NULL,
	"votes" integer NOT NULL,
	CONSTRAINT "booth_candidate_votes_booth_result_id_c_no_pk" PRIMARY KEY("booth_result_id","c_no")
);
--> statement-breakpoint
CREATE TABLE "booth_party_votes" (
	"booth_result_id" integer NOT NULL,
	"p_no" integer NOT NULL,
	"votes" integer NOT NULL,
	CONSTRAINT "booth_party_votes_booth_result_id_p_no_pk" PRIMARY KEY("booth_result_id","p_no")
);
--> statement-breakpoint
CREATE TABLE "booth_results" (
	"id" serial PRIMARY KEY NOT NULL,
	"stage" text NOT NULL,
	"e_no" integer NOT NULL,
	"voting_place_id" integer NOT NULL,
	"section" text NOT NULL,
	"party_informals" integer NOT NULL,
	"candidate_informals" integer NOT NULL,
	CONSTRAINT "booth_results_place" UNIQUE("e_no","stage","voting_place_id","section")
);
--> statement-breakpoint
CREATE TABLE "voting_places" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"lat" double precision,
	"lon" double precision,
	"geo_precision" text,
	CONSTRAINT "voting_places_name_unique" UNIQUE("name")
);
--> statement-breakpoint
ALTER TABLE "booth_candidate_votes" ADD CONSTRAINT "booth_candidate_votes_booth_result_id_booth_results_id_fk" FOREIGN KEY ("booth_result_id") REFERENCES "public"."booth_results"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booth_party_votes" ADD CONSTRAINT "booth_party_votes_booth_result_id_booth_results_id_fk" FOREIGN KEY ("booth_result_id") REFERENCES "public"."booth_results"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booth_results" ADD CONSTRAINT "booth_results_voting_place_id_voting_places_id_fk" FOREIGN KEY ("voting_place_id") REFERENCES "public"."voting_places"("id") ON DELETE no action ON UPDATE no action;