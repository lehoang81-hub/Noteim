CREATE SCHEMA "noteim";
--> statement-breakpoint
CREATE TABLE "noteim"."accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"type" text,
	"provider" text NOT NULL,
	"provider_account_id" text NOT NULL,
	"refresh_token" text,
	"access_token" text,
	"expires_at" integer,
	"token_type" text,
	"scope" text,
	"id_token" text,
	"session_state" text
);
--> statement-breakpoint
CREATE TABLE "noteim"."action_items" (
	"id" text NOT NULL,
	"session_id" text NOT NULL,
	"task" text NOT NULL,
	"assignee_contact_id" text,
	"assignee_user_id" uuid,
	"due_date" text,
	"priority" text DEFAULT 'medium' NOT NULL,
	"done" boolean DEFAULT false NOT NULL,
	"done_at" timestamp with time zone,
	"source_quote" text,
	"timestamp_sec" double precision,
	CONSTRAINT "action_items_session_id_id_pk" PRIMARY KEY("session_id","id")
);
--> statement-breakpoint
CREATE TABLE "noteim"."audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" text,
	"actor_user_id" uuid,
	"action" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text NOT NULL,
	"target_label" text DEFAULT '' NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "noteim"."auth_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_token" text NOT NULL,
	"user_id" uuid,
	"expires" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "noteim"."chat_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" text NOT NULL,
	"role" text NOT NULL,
	"text" text NOT NULL,
	"citations" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "noteim"."consent_receipts" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"who" text[] DEFAULT '{}'::text[] NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"method" text DEFAULT 'button' NOT NULL,
	"announcement_text" text
);
--> statement-breakpoint
CREATE TABLE "noteim"."contacts" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"role" text,
	"email" text,
	"preferred_language" text
);
--> statement-breakpoint
CREATE TABLE "noteim"."folder_sessions" (
	"folder_id" text NOT NULL,
	"session_id" text NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "folder_sessions_folder_id_session_id_pk" PRIMARY KEY("folder_id","session_id")
);
--> statement-breakpoint
CREATE TABLE "noteim"."folders" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text,
	"owner_user_id" uuid,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"ref" text,
	"note" text,
	"template_id" text,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "noteim"."glossary_terms" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"term" text NOT NULL,
	"note" text,
	"variants" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "noteim"."invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token" text NOT NULL,
	"workspace_id" text NOT NULL,
	"email" text NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"invited_by" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "noteim"."promo_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"plan" text NOT NULL,
	"months" integer DEFAULT 1 NOT NULL,
	"max_redemptions" integer DEFAULT 1 NOT NULL,
	"redeemed_count" integer DEFAULT 0 NOT NULL,
	"redeemed_by_user_id" uuid,
	"redeemed_at" timestamp with time zone,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "noteim"."session_details" (
	"session_id" text PRIMARY KEY NOT NULL,
	"executive_summary" text DEFAULT '' NOT NULL,
	"speakers" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"topics" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"notes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"bookmarks" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"photos" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"peaks" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"speaker_spans" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"send_history" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"listening_map" jsonb,
	"flow_mermaid" text,
	"gap_check" jsonb,
	"gap_check_done" text[] DEFAULT '{}'::text[] NOT NULL,
	"pending_ai_questions" text[] DEFAULT '{}'::text[] NOT NULL
);
--> statement-breakpoint
CREATE TABLE "noteim"."session_gap_checks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" text NOT NULL,
	"template_id" text NOT NULL,
	"checked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"transcript_until_ms" integer DEFAULT 0 NOT NULL,
	"result_json" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "noteim"."sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"workspace_id" text,
	"visibility" text DEFAULT 'private' NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"title" text NOT NULL,
	"template_id" text NOT NULL,
	"intake_template_id" text,
	"primary_language" text DEFAULT 'vi' NOT NULL,
	"detected_languages" text[] DEFAULT '{}'::text[] NOT NULL,
	"report_languages" text[] DEFAULT '{}'::text[] NOT NULL,
	"original_report_language" text DEFAULT 'vi' NOT NULL,
	"status" text DEFAULT 'processing' NOT NULL,
	"processing_step" integer,
	"failure_reason" text,
	"storage_status" text DEFAULT 'full' NOT NULL,
	"duration_sec" integer DEFAULT 0 NOT NULL,
	"size_bytes" integer DEFAULT 0 NOT NULL,
	"audio_path" text,
	"audio_expires_at" timestamp with time zone,
	"consent" jsonb DEFAULT '{"confirmed":false,"announced":false}'::jsonb NOT NULL,
	"participant_contact_ids" text[] DEFAULT '{}'::text[] NOT NULL,
	"peaks_thumb" jsonb,
	"speaker_colors_thumb" jsonb,
	"headline_tag" jsonb,
	"open_task_count" integer DEFAULT 0 NOT NULL,
	"is_sample" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "noteim"."share_links" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"scope" text DEFAULT 'summary' NOT NULL,
	"has_password" boolean DEFAULT false NOT NULL,
	"password_hash" text,
	"expires_at" timestamp with time zone,
	"revoked" boolean DEFAULT false NOT NULL,
	"view_count" integer DEFAULT 0 NOT NULL,
	"languages" text[] DEFAULT '{}'::text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "noteim"."summary_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" text NOT NULL,
	"lang" text NOT NULL,
	"source" text DEFAULT 'original' NOT NULL,
	"translated_from" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"stale" boolean DEFAULT false NOT NULL,
	"executive_summary" text NOT NULL,
	"topics" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"task_texts" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"sample" boolean
);
--> statement-breakpoint
CREATE TABLE "noteim"."transcript_segments" (
	"session_id" text NOT NULL,
	"id" text NOT NULL,
	"speaker_id" text NOT NULL,
	"start_sec" double precision NOT NULL,
	"end_sec" double precision NOT NULL,
	"text" text NOT NULL,
	"text_clean" text DEFAULT '' NOT NULL,
	"edited" boolean DEFAULT false NOT NULL,
	"lang" text DEFAULT 'vi' NOT NULL,
	"translations" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"words" jsonb,
	CONSTRAINT "transcript_segments_session_id_id_pk" PRIMARY KEY("session_id","id")
);
--> statement-breakpoint
CREATE TABLE "noteim"."usage_counters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"subject_user_id" text DEFAULT '' NOT NULL,
	"client_id" text DEFAULT '' NOT NULL,
	"day" date NOT NULL,
	"kind" text NOT NULL,
	"used" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "noteim"."users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"display_name" text,
	"honorific" text,
	"profession" text,
	"default_template_id" text,
	"plan" text DEFAULT 'free' NOT NULL,
	"ui_language" text DEFAULT 'vi' NOT NULL,
	"theme" text DEFAULT 'system' NOT NULL,
	"consent_reminder" boolean DEFAULT true NOT NULL,
	"consent_announcement" text,
	"auto_filter_silence" boolean DEFAULT false NOT NULL,
	"default_speech_language" text DEFAULT 'vi' NOT NULL,
	"auto_detect_languages" boolean DEFAULT true NOT NULL,
	"default_report_language" text DEFAULT 'vi' NOT NULL,
	"auto_translate_on_send" boolean DEFAULT true NOT NULL,
	"current_workspace_id" text DEFAULT '' NOT NULL,
	"listening_prefs" jsonb,
	"onboarded_at" timestamp with time zone,
	"anonymous_used_sessions" integer DEFAULT 0 NOT NULL,
	"anonymous_used_seconds" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "noteim"."verification_tokens" (
	"identifier" text NOT NULL,
	"token" text NOT NULL,
	"expires" timestamp with time zone NOT NULL,
	CONSTRAINT "verification_tokens_identifier_token_pk" PRIMARY KEY("identifier","token")
);
--> statement-breakpoint
CREATE TABLE "noteim"."workspace_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" text NOT NULL,
	"user_id" uuid,
	"email" text NOT NULL,
	"display_name" text DEFAULT '' NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"status" text DEFAULT 'invited' NOT NULL,
	"invited_at" timestamp with time zone DEFAULT now() NOT NULL,
	"invite_expires_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "noteim"."workspaces" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text DEFAULT 'personal' NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"profession" text,
	"default_report_language" text DEFAULT 'vi' NOT NULL,
	"plan" text DEFAULT 'free' NOT NULL,
	"seat_limit" integer,
	"owner_user_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "noteim"."accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "noteim"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "noteim"."action_items" ADD CONSTRAINT "action_items_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "noteim"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "noteim"."action_items" ADD CONSTRAINT "action_items_assignee_user_id_users_id_fk" FOREIGN KEY ("assignee_user_id") REFERENCES "noteim"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "noteim"."audit_log" ADD CONSTRAINT "audit_log_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "noteim"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "noteim"."auth_sessions" ADD CONSTRAINT "auth_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "noteim"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "noteim"."chat_messages" ADD CONSTRAINT "chat_messages_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "noteim"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "noteim"."consent_receipts" ADD CONSTRAINT "consent_receipts_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "noteim"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "noteim"."contacts" ADD CONSTRAINT "contacts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "noteim"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "noteim"."folder_sessions" ADD CONSTRAINT "folder_sessions_folder_id_folders_id_fk" FOREIGN KEY ("folder_id") REFERENCES "noteim"."folders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "noteim"."folder_sessions" ADD CONSTRAINT "folder_sessions_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "noteim"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "noteim"."folders" ADD CONSTRAINT "folders_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "noteim"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "noteim"."folders" ADD CONSTRAINT "folders_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "noteim"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "noteim"."glossary_terms" ADD CONSTRAINT "glossary_terms_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "noteim"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "noteim"."invites" ADD CONSTRAINT "invites_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "noteim"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "noteim"."invites" ADD CONSTRAINT "invites_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "noteim"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "noteim"."promo_codes" ADD CONSTRAINT "promo_codes_redeemed_by_user_id_users_id_fk" FOREIGN KEY ("redeemed_by_user_id") REFERENCES "noteim"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "noteim"."session_details" ADD CONSTRAINT "session_details_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "noteim"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "noteim"."session_gap_checks" ADD CONSTRAINT "session_gap_checks_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "noteim"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "noteim"."sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "noteim"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "noteim"."sessions" ADD CONSTRAINT "sessions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "noteim"."workspaces"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "noteim"."sessions" ADD CONSTRAINT "sessions_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "noteim"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "noteim"."share_links" ADD CONSTRAINT "share_links_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "noteim"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "noteim"."summary_versions" ADD CONSTRAINT "summary_versions_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "noteim"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "noteim"."transcript_segments" ADD CONSTRAINT "transcript_segments_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "noteim"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "noteim"."workspace_members" ADD CONSTRAINT "workspace_members_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "noteim"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "noteim"."workspace_members" ADD CONSTRAINT "workspace_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "noteim"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "noteim"."workspaces" ADD CONSTRAINT "workspaces_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "noteim"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "accounts_provider_account_key" ON "noteim"."accounts" USING btree ("provider","provider_account_id");--> statement-breakpoint
CREATE INDEX "accounts_user_id_idx" ON "noteim"."accounts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "action_items_session_idx" ON "noteim"."action_items" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "action_items_assignee_idx" ON "noteim"."action_items" USING btree ("assignee_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "audit_log_dedup_key" ON "noteim"."audit_log" USING btree ("workspace_id","actor_user_id","action","target_type","target_id","at");--> statement-breakpoint
CREATE INDEX "audit_log_workspace_at_idx" ON "noteim"."audit_log" USING btree ("workspace_id","at");--> statement-breakpoint
CREATE INDEX "audit_log_target_idx" ON "noteim"."audit_log" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE INDEX "audit_log_actor_idx" ON "noteim"."audit_log" USING btree ("actor_user_id","at");--> statement-breakpoint
CREATE UNIQUE INDEX "auth_sessions_token_key" ON "noteim"."auth_sessions" USING btree ("session_token");--> statement-breakpoint
CREATE UNIQUE INDEX "chat_messages_session_role_created_key" ON "noteim"."chat_messages" USING btree ("session_id","role","created_at",md5("text"));--> statement-breakpoint
CREATE INDEX "chat_messages_session_idx" ON "noteim"."chat_messages" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "consent_receipts_session_idx" ON "noteim"."consent_receipts" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "contacts_user_idx" ON "noteim"."contacts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "folder_sessions_session_idx" ON "noteim"."folder_sessions" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "folders_workspace_idx" ON "noteim"."folders" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "folders_owner_idx" ON "noteim"."folders" USING btree ("owner_user_id");--> statement-breakpoint
CREATE INDEX "glossary_terms_user_idx" ON "noteim"."glossary_terms" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "invites_token_key" ON "noteim"."invites" USING btree ("token");--> statement-breakpoint
CREATE INDEX "invites_workspace_idx" ON "noteim"."invites" USING btree ("workspace_id");--> statement-breakpoint
CREATE UNIQUE INDEX "promo_codes_code_key" ON "noteim"."promo_codes" USING btree ("code");--> statement-breakpoint
CREATE INDEX "session_gap_checks_session_checked_idx" ON "noteim"."session_gap_checks" USING btree ("session_id","checked_at");--> statement-breakpoint
CREATE INDEX "sessions_user_created_idx" ON "noteim"."sessions" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "sessions_workspace_idx" ON "noteim"."sessions" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "share_links_session_idx" ON "noteim"."share_links" USING btree ("session_id");--> statement-breakpoint
CREATE UNIQUE INDEX "summary_versions_session_lang_key" ON "noteim"."summary_versions" USING btree ("session_id","lang");--> statement-breakpoint
CREATE INDEX "transcript_segments_session_start_idx" ON "noteim"."transcript_segments" USING btree ("session_id","start_sec");--> statement-breakpoint
CREATE UNIQUE INDEX "usage_counters_subject_day_key" ON "noteim"."usage_counters" USING btree ("subject_user_id","client_id","day","kind");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_key" ON "noteim"."users" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_members_workspace_email_key" ON "noteim"."workspace_members" USING btree ("workspace_id",lower("email"));--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_members_workspace_user_key" ON "noteim"."workspace_members" USING btree ("workspace_id","user_id");--> statement-breakpoint
CREATE INDEX "workspace_members_workspace_idx" ON "noteim"."workspace_members" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "workspaces_owner_idx" ON "noteim"."workspaces" USING btree ("owner_user_id");--> statement-breakpoint
-- >> Bổ sung tay (PR 02, §1.4): ràng buộc tối đa 10 dòng gap-check mỗi buổi.
-- >> drizzle-kit không sinh trigger — khối này thêm sau lệnh CREATE TABLE.
-- >> AFTER INSERT: mỗi lần ghi thêm, xóa bớt dòng cũ nhất khi vượt 10 dòng.
CREATE OR REPLACE FUNCTION "noteim"."noteim_gap_check_trim10"() RETURNS trigger AS $$
BEGIN
  DELETE FROM "noteim"."session_gap_checks"
  WHERE "session_id" = NEW."session_id"
    AND "id" NOT IN (
      SELECT "id" FROM "noteim"."session_gap_checks"
      WHERE "session_id" = NEW."session_id"
      ORDER BY "checked_at" DESC, "id" DESC
      LIMIT 10
    );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER "noteim_gap_check_max10"
AFTER INSERT ON "noteim"."session_gap_checks"
FOR EACH ROW EXECUTE FUNCTION "noteim"."noteim_gap_check_trim10"();
