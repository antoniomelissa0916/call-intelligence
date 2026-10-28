CREATE TABLE "analyses" (
	"id" text PRIMARY KEY NOT NULL,
	"call_id" text NOT NULL,
	"is_current" boolean DEFAULT true NOT NULL,
	"model" text NOT NULL,
	"prompt_version" text NOT NULL,
	"call_type" text NOT NULL,
	"scorecard_id" text,
	"score" integer,
	"max_score" integer,
	"grade" text,
	"outcome" text NOT NULL,
	"needs_review" boolean DEFAULT false NOT NULL,
	"data" jsonb NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"duration_ms" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "calls" (
	"id" text PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"source_filename" text NOT NULL,
	"audio_key" text NOT NULL,
	"audio_mime" text DEFAULT 'audio/mpeg' NOT NULL,
	"audio_bytes" integer DEFAULT 0 NOT NULL,
	"duration_sec" real,
	"status" text DEFAULT 'queued' NOT NULL,
	"error" text,
	"rep_id" text,
	"direction" text DEFAULT 'unknown' NOT NULL,
	"occurred_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"stage_started_at" timestamp with time zone,
	"processed_at" timestamp with time zone,
	"transcript_source" text
);
--> statement-breakpoint
CREATE TABLE "overrides" (
	"id" text PRIMARY KEY NOT NULL,
	"call_id" text NOT NULL,
	"field" text NOT NULL,
	"value" text NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reps" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"role" text DEFAULT 'office' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" text PRIMARY KEY NOT NULL,
	"call_id" text,
	"source_key" text NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"detail" text DEFAULT '' NOT NULL,
	"assignee" text NOT NULL,
	"priority" text DEFAULT 'medium' NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "tasks_source_key_unique" UNIQUE("source_key")
);
--> statement-breakpoint
CREATE TABLE "transcripts" (
	"call_id" text PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"data" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "analyses" ADD CONSTRAINT "analyses_call_id_calls_id_fk" FOREIGN KEY ("call_id") REFERENCES "public"."calls"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calls" ADD CONSTRAINT "calls_rep_id_reps_id_fk" FOREIGN KEY ("rep_id") REFERENCES "public"."reps"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "overrides" ADD CONSTRAINT "overrides_call_id_calls_id_fk" FOREIGN KEY ("call_id") REFERENCES "public"."calls"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_call_id_calls_id_fk" FOREIGN KEY ("call_id") REFERENCES "public"."calls"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transcripts" ADD CONSTRAINT "transcripts_call_id_calls_id_fk" FOREIGN KEY ("call_id") REFERENCES "public"."calls"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "analyses_call_idx" ON "analyses" USING btree ("call_id","is_current");--> statement-breakpoint
CREATE INDEX "calls_created_idx" ON "calls" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "calls_rep_idx" ON "calls" USING btree ("rep_id");--> statement-breakpoint
CREATE INDEX "overrides_call_idx" ON "overrides" USING btree ("call_id");--> statement-breakpoint
CREATE INDEX "tasks_status_idx" ON "tasks" USING btree ("status");