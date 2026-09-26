CREATE TYPE "public"."chamber" AS ENUM('house', 'senate');--> statement-breakpoint
CREATE TYPE "public"."position" AS ENUM('Yea', 'Nay', 'Present', 'NotVoting');--> statement-breakpoint
CREATE TABLE "ai_spend" (
	"day" date PRIMARY KEY NOT NULL,
	"usd" numeric(10, 4) NOT NULL,
	"requests" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ask_cache" (
	"key" text PRIMARY KEY NOT NULL,
	"data_version" text NOT NULL,
	"response" jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "candidacies" (
	"id" text PRIMARY KEY NOT NULL,
	"person_id" text NOT NULL,
	"race_id" text NOT NULL,
	"party" text NOT NULL,
	"status" text NOT NULL,
	"incumbent" boolean NOT NULL,
	"fec_candidate_id" text,
	"source_ids" text[] NOT NULL
);
--> statement-breakpoint
CREATE TABLE "corrections" (
	"id" text PRIMARY KEY NOT NULL,
	"target_kind" text NOT NULL,
	"target_id" text NOT NULL,
	"target_field" text,
	"report" text NOT NULL,
	"status" text NOT NULL,
	"resolution" text,
	"submitted_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "districts" (
	"id" text PRIMARY KEY NOT NULL,
	"state" text NOT NULL,
	"number" smallint NOT NULL,
	"map_version" text NOT NULL,
	"geometry_ref" text,
	"source_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "elections" (
	"id" text PRIMARY KEY NOT NULL,
	"date" date NOT NULL,
	"type" text NOT NULL,
	"state" text,
	"name" text NOT NULL,
	"source_ids" text[] NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event_log" (
	"id" text PRIMARY KEY NOT NULL,
	"action" text NOT NULL,
	"actor_kind" text NOT NULL,
	"actor_id" text NOT NULL,
	"target_kind" text NOT NULL,
	"target_id" text NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"reason" text NOT NULL,
	"source_ids" text[] NOT NULL,
	"summary" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "finance_committees" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"designation" text,
	"candidate_id" text,
	"source_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "finance_summaries" (
	"person_id" text NOT NULL,
	"cycle" smallint NOT NULL,
	"finance_committee_id" text NOT NULL,
	"receipts" numeric(14, 2) NOT NULL,
	"individual" numeric(14, 2) NOT NULL,
	"small_dollar_share" numeric(6, 5),
	"pacs" numeric(14, 2) NOT NULL,
	"party" numeric(14, 2) NOT NULL,
	"self_funding" numeric(14, 2) NOT NULL,
	"cash_on_hand" numeric(14, 2) NOT NULL,
	"debts" numeric(14, 2) NOT NULL,
	"in_state_share" numeric(6, 5),
	"as_of" date NOT NULL,
	"source_id" text NOT NULL,
	CONSTRAINT "finance_summaries_person_id_cycle_finance_committee_id_pk" PRIMARY KEY("person_id","cycle","finance_committee_id")
);
--> statement-breakpoint
CREATE TABLE "ingestion_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"job" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"finished_at" timestamp with time zone,
	"status" text NOT NULL,
	"stats" jsonb NOT NULL,
	"notes" jsonb NOT NULL,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "issue_areas" (
	"id" text PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"description" text NOT NULL,
	"icon" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "key_votes" (
	"id" text PRIMARY KEY NOT NULL,
	"sort_order" smallint NOT NULL,
	"issue_area" text NOT NULL,
	"card" jsonb NOT NULL,
	"measures" text[] NOT NULL,
	"roll_call_refs" jsonb NOT NULL,
	"yea_lean" text NOT NULL,
	"status" text NOT NULL,
	"selection_reason" text NOT NULL,
	"reviewers" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "measures" (
	"id" text PRIMARY KEY NOT NULL,
	"congress" smallint NOT NULL,
	"type" text NOT NULL,
	"number" integer NOT NULL,
	"title_display" text NOT NULL,
	"title_official" text NOT NULL,
	"title_short" text,
	"title_popular" text,
	"sponsor_id" text,
	"introduced_date" date,
	"latest_action" text NOT NULL,
	"latest_action_date" date NOT NULL,
	"became_law" boolean NOT NULL,
	"crs_summary" jsonb,
	"plain_summary" jsonb,
	"source_ids" text[] NOT NULL
);
--> statement-breakpoint
CREATE TABLE "member_stats" (
	"person_id" text PRIMARY KEY NOT NULL,
	"chamber" "chamber" NOT NULL,
	"congress" smallint NOT NULL,
	"eligible_votes" integer NOT NULL,
	"missed_votes" integer NOT NULL,
	"party_unity_eligible" integer NOT NULL,
	"party_unity_votes" integer NOT NULL,
	"first_vote_date" date,
	"last_vote_date" date,
	"computed_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "offices" (
	"id" text PRIMARY KEY NOT NULL,
	"level" text NOT NULL,
	"chamber" "chamber" NOT NULL,
	"title" text NOT NULL,
	"state" text NOT NULL,
	"seat_class" smallint
);
--> statement-breakpoint
CREATE TABLE "people" (
	"id" text PRIMARY KEY NOT NULL,
	"full_name" text NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"nickname" text,
	"suffix" text,
	"bioguide" text,
	"fec_ids" text[] NOT NULL,
	"wikidata" text,
	"ballotpedia" text,
	"govtrack" integer,
	"lis" text,
	"portrait" jsonb,
	"links" jsonb NOT NULL,
	"source_ids" text[] NOT NULL,
	CONSTRAINT "people_bioguide_unique" UNIQUE("bioguide")
);
--> statement-breakpoint
CREATE TABLE "races" (
	"id" text PRIMARY KEY NOT NULL,
	"election_id" text NOT NULL,
	"office_id" text NOT NULL,
	"chamber" "chamber" NOT NULL,
	"state" text NOT NULL,
	"district_id" text,
	"source_ids" text[] NOT NULL
);
--> statement-breakpoint
CREATE TABLE "rate_limits" (
	"key" text NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer NOT NULL,
	CONSTRAINT "rate_limits_key_window_start_pk" PRIMARY KEY("key","window_start")
);
--> statement-breakpoint
CREATE TABLE "roll_calls" (
	"id" text PRIMARY KEY NOT NULL,
	"chamber" "chamber" NOT NULL,
	"congress" smallint NOT NULL,
	"session" smallint NOT NULL,
	"number" integer NOT NULL,
	"date" date NOT NULL,
	"question" text NOT NULL,
	"result" text NOT NULL,
	"requires" text,
	"title" text,
	"yea" smallint NOT NULL,
	"nay" smallint NOT NULL,
	"present" smallint NOT NULL,
	"not_voting" smallint NOT NULL,
	"tie_breaker" jsonb,
	"measure_id" text,
	"official_url" text NOT NULL,
	"source_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sources" (
	"id" text PRIMARY KEY NOT NULL,
	"publisher" text NOT NULL,
	"url" text NOT NULL,
	"retrieved_at" timestamp with time zone NOT NULL,
	"content_hash" text NOT NULL,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "terms" (
	"id" text PRIMARY KEY NOT NULL,
	"person_id" text NOT NULL,
	"office_id" text NOT NULL,
	"chamber" "chamber" NOT NULL,
	"state" text NOT NULL,
	"district_id" text,
	"party" text NOT NULL,
	"caucus" text,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"source_ids" text[] NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vote_positions" (
	"roll_call_id" text NOT NULL,
	"person_id" text NOT NULL,
	"position" "position" NOT NULL,
	"party" text NOT NULL,
	"state" text NOT NULL,
	CONSTRAINT "vote_positions_roll_call_id_person_id_pk" PRIMARY KEY("roll_call_id","person_id")
);
--> statement-breakpoint
ALTER TABLE "candidacies" ADD CONSTRAINT "candidacies_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidacies" ADD CONSTRAINT "candidacies_race_id_races_id_fk" FOREIGN KEY ("race_id") REFERENCES "public"."races"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "districts" ADD CONSTRAINT "districts_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_committees" ADD CONSTRAINT "finance_committees_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_summaries" ADD CONSTRAINT "finance_summaries_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_summaries" ADD CONSTRAINT "finance_summaries_finance_committee_id_finance_committees_id_fk" FOREIGN KEY ("finance_committee_id") REFERENCES "public"."finance_committees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "finance_summaries" ADD CONSTRAINT "finance_summaries_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "key_votes" ADD CONSTRAINT "key_votes_issue_area_issue_areas_id_fk" FOREIGN KEY ("issue_area") REFERENCES "public"."issue_areas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "measures" ADD CONSTRAINT "measures_sponsor_id_people_id_fk" FOREIGN KEY ("sponsor_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_stats" ADD CONSTRAINT "member_stats_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "races" ADD CONSTRAINT "races_election_id_elections_id_fk" FOREIGN KEY ("election_id") REFERENCES "public"."elections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "races" ADD CONSTRAINT "races_office_id_offices_id_fk" FOREIGN KEY ("office_id") REFERENCES "public"."offices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "races" ADD CONSTRAINT "races_district_id_districts_id_fk" FOREIGN KEY ("district_id") REFERENCES "public"."districts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roll_calls" ADD CONSTRAINT "roll_calls_measure_id_measures_id_fk" FOREIGN KEY ("measure_id") REFERENCES "public"."measures"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roll_calls" ADD CONSTRAINT "roll_calls_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "terms" ADD CONSTRAINT "terms_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "terms" ADD CONSTRAINT "terms_office_id_offices_id_fk" FOREIGN KEY ("office_id") REFERENCES "public"."offices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "terms" ADD CONSTRAINT "terms_district_id_districts_id_fk" FOREIGN KEY ("district_id") REFERENCES "public"."districts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vote_positions" ADD CONSTRAINT "vote_positions_roll_call_id_roll_calls_id_fk" FOREIGN KEY ("roll_call_id") REFERENCES "public"."roll_calls"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vote_positions" ADD CONSTRAINT "vote_positions_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "candidacies_race_idx" ON "candidacies" USING btree ("race_id");--> statement-breakpoint
CREATE INDEX "candidacies_person_idx" ON "candidacies" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "districts_state_idx" ON "districts" USING btree ("state","map_version");--> statement-breakpoint
CREATE INDEX "event_log_target_idx" ON "event_log" USING btree ("target_kind","target_id");--> statement-breakpoint
CREATE INDEX "event_log_at_idx" ON "event_log" USING btree ("at");--> statement-breakpoint
CREATE INDEX "measures_sponsor_idx" ON "measures" USING btree ("sponsor_id");--> statement-breakpoint
CREATE INDEX "people_last_name_idx" ON "people" USING btree ("last_name");--> statement-breakpoint
CREATE INDEX "people_lis_idx" ON "people" USING btree ("lis");--> statement-breakpoint
CREATE INDEX "races_state_idx" ON "races" USING btree ("state");--> statement-breakpoint
CREATE INDEX "races_district_idx" ON "races" USING btree ("district_id");--> statement-breakpoint
CREATE INDEX "roll_calls_measure_idx" ON "roll_calls" USING btree ("measure_id");--> statement-breakpoint
CREATE INDEX "roll_calls_date_idx" ON "roll_calls" USING btree ("chamber","date");--> statement-breakpoint
CREATE INDEX "terms_person_idx" ON "terms" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "terms_district_idx" ON "terms" USING btree ("district_id");--> statement-breakpoint
CREATE INDEX "terms_state_idx" ON "terms" USING btree ("state","chamber");--> statement-breakpoint
CREATE INDEX "vote_positions_person_idx" ON "vote_positions" USING btree ("person_id");