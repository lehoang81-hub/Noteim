ALTER TABLE "noteim"."sessions" ADD COLUMN "asr_stage" text;--> statement-breakpoint
ALTER TABLE "noteim"."sessions" ADD COLUMN "asr_transcription_id" text;--> statement-breakpoint
ALTER TABLE "noteim"."sessions" ADD COLUMN "asr_error" text;--> statement-breakpoint
ALTER TABLE "noteim"."sessions" ADD COLUMN "asr_attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "noteim"."sessions" ADD COLUMN "asr_updated_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "sessions_asr_stage_idx" ON "noteim"."sessions" USING btree ("asr_stage","asr_updated_at");