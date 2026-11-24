CREATE TABLE "noteim"."folder_chat_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"folder_id" text NOT NULL,
	"role" text NOT NULL,
	"text" text NOT NULL,
	"citations" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "noteim"."session_details" ADD COLUMN "draft" jsonb;--> statement-breakpoint
ALTER TABLE "noteim"."sessions" ADD COLUMN "trial_recording" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "noteim"."folder_chat_messages" ADD CONSTRAINT "folder_chat_messages_folder_id_folders_id_fk" FOREIGN KEY ("folder_id") REFERENCES "noteim"."folders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "folder_chat_messages_folder_role_created_key" ON "noteim"."folder_chat_messages" USING btree ("folder_id","role","created_at",md5("text"));--> statement-breakpoint
CREATE INDEX "folder_chat_messages_folder_idx" ON "noteim"."folder_chat_messages" USING btree ("folder_id");