CREATE TABLE "employee_sessions" (
	"employee_id" uuid PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"session_started_at" timestamp with time zone NOT NULL,
	"message_count" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "employee_sessions" ADD CONSTRAINT "employee_sessions_employee_id_users_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
INSERT INTO employee_sessions (employee_id, session_id, session_started_at, message_count)
SELECT employee_id, session_id, coalesce(session_started_at, now()), session_message_count
FROM conversations WHERE session_id IS NOT NULL ON CONFLICT DO NOTHING;
--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "closed_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "closed_reason" text;
--> statement-breakpoint
UPDATE conversations
SET closed_reason = CASE
      WHEN EXISTS (
        SELECT 1 FROM messages m
        WHERE m.conversation_id = conversations.id AND m.metadata->>'event' = 'claim'
      ) THEN 'analyst'
      ELSE 'resolved'
    END,
    closed_at = status_changed_at
WHERE status = 'closed';
--> statement-breakpoint
DROP INDEX "conversations_employee_unique";
--> statement-breakpoint
CREATE UNIQUE INDEX "conversations_one_with_agent" ON "conversations" USING btree ("employee_id") WHERE "conversations"."status" = 'ai_handling';
--> statement-breakpoint
CREATE INDEX "conversations_employee_idx" ON "conversations" USING btree ("employee_id","last_message_at");
--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_closed_reason_check" CHECK ("conversations"."closed_reason" is null or "conversations"."closed_reason" in ('analyst','resolved','merged'));
--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_closed_requires_reason" CHECK ("conversations"."status" <> 'closed' or "conversations"."closed_reason" is not null);
--> statement-breakpoint
ALTER TABLE "conversations" DROP COLUMN "session_id";
--> statement-breakpoint
ALTER TABLE "conversations" DROP COLUMN "session_message_count";
--> statement-breakpoint
ALTER TABLE "conversations" DROP COLUMN "session_started_at";
