ALTER TABLE "noteim"."sessions" ADD COLUMN "resummarize_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "noteim"."sessions" ADD COLUMN "resummarize_pending" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "noteim"."sessions" ADD COLUMN "transcript_stale" boolean DEFAULT false NOT NULL;