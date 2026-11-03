CREATE SCHEMA "tickets";
--> statement-breakpoint
CREATE SEQUENCE "public"."draft_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 381 CACHE 1;--> statement-breakpoint
CREATE SEQUENCE "tickets"."inc_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 20500 CACHE 1;--> statement-breakpoint
CREATE SEQUENCE "tickets"."req_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 10500 CACHE 1;--> statement-breakpoint
CREATE TABLE "ai_agent_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"inbound_message_id" uuid,
	"outbound_message_id" uuid,
	"status" text DEFAULT 'running' NOT NULL,
	"error_code" text,
	"error_message" text,
	"model" text,
	"tokens_in" integer DEFAULT 0 NOT NULL,
	"tokens_out" integer DEFAULT 0 NOT NULL,
	"cost_cents" numeric(12, 4),
	"latency_ms" integer,
	"steps_count" integer DEFAULT 0 NOT NULL,
	"tool_calls" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"decision" jsonb,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "ai_agent_runs_status_check" CHECK ("ai_agent_runs"."status" in ('running','completed','failed','aborted','handoff'))
);
--> statement-breakpoint
CREATE TABLE "api_audit_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"request_id" text,
	"user_id" uuid,
	"action" text NOT NULL,
	"method" text,
	"path" text,
	"status" integer,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employee_id" uuid NOT NULL,
	"status" text DEFAULT 'ai_handling' NOT NULL,
	"status_changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"assigned_to_user_id" uuid,
	"assigned_at" timestamp with time zone,
	"focus_ticket_code" text,
	"last_message_at" timestamp with time zone,
	"last_message_preview" text,
	"unread_count_for_assignee" integer DEFAULT 0 NOT NULL,
	"session_id" text,
	"session_message_count" integer DEFAULT 0 NOT NULL,
	"session_started_at" timestamp with time zone,
	"summary" text,
	"last_handoff_at" timestamp with time zone,
	"last_handoff_reason" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "conversations_status_check" CHECK ("conversations"."status" in ('ai_handling','pending','claimed','closed')),
	CONSTRAINT "conversations_claimed_has_assignee" CHECK ("conversations"."status" <> 'claimed' or "conversations"."assigned_to_user_id" is not null)
);
--> statement-breakpoint
CREATE TABLE "event_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"event_type" text NOT NULL,
	"conversation_id" uuid,
	"actor_user_id" uuid,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "event_log_type_check" CHECK ("event_log"."event_type" ~ '^[a-z_]+\.[a-z_]+$')
);
--> statement-breakpoint
CREATE TABLE "handoffs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"ticket_code" text,
	"origin" text NOT NULL,
	"reason_code" text NOT NULL,
	"support_level" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"employee_words" text DEFAULT '' NOT NULL,
	"agent_reading" text DEFAULT '' NOT NULL,
	"attempts" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"confidence" numeric(4, 3),
	"due_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"acknowledged_by" uuid,
	"acknowledged_at" timestamp with time zone,
	CONSTRAINT "handoffs_origin_check" CHECK ("handoffs"."origin" in ('explicit_request','trigger','model_tool','session_limit','guardrail','budget')),
	CONSTRAINT "handoffs_reason_check" CHECK ("handoffs"."reason_code" in ('requested_human','critical_priority','overdue_ticket','low_confidence','session_limit')),
	CONSTRAINT "handoffs_level_check" CHECK ("handoffs"."support_level" in ('N1','N2')),
	CONSTRAINT "handoffs_ack_coherence" CHECK (("handoffs"."acknowledged_by" is null) = ("handoffs"."acknowledged_at" is null))
);
--> statement-breakpoint
CREATE TABLE "idempotency_keys" (
	"key" text PRIMARY KEY NOT NULL,
	"scope" text NOT NULL,
	"request_hash" text NOT NULL,
	"response_status" integer,
	"response_body" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone DEFAULT now() + interval '24 hours' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "knowledge_articles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"applies_to" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "knowledge_articles_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "llm_calls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"agent_run_id" uuid,
	"purpose" text NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"cache_read_tokens" integer DEFAULT 0 NOT NULL,
	"cost_cents" numeric(12, 4),
	"latency_ms" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "llm_calls_purpose_check" CHECK ("llm_calls"."purpose" in ('agent_turn','decision','summary'))
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"direction" text NOT NULL,
	"type" text DEFAULT 'text' NOT NULL,
	"sent_via" text NOT NULL,
	"sent_by_user_id" uuid,
	"body" text NOT NULL,
	"parts" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"agent_run_id" uuid,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "messages_direction_check" CHECK ("messages"."direction" in ('inbound','outbound')),
	CONSTRAINT "messages_type_check" CHECK ("messages"."type" in ('text','system')),
	CONSTRAINT "messages_sent_via_check" CHECK ("messages"."sent_via" in ('user','ai','system'))
);
--> statement-breakpoint
CREATE TABLE "ticket_drafts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"conversation_id" uuid NOT NULL,
	"agent_run_id" uuid,
	"kind" text NOT NULL,
	"target_ticket_code" text,
	"payload" jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"idempotency_key" uuid DEFAULT gen_random_uuid() NOT NULL,
	"result_ticket_code" text,
	"error_code" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone,
	CONSTRAINT "ticket_drafts_code_unique" UNIQUE("code"),
	CONSTRAINT "ticket_drafts_kind_check" CHECK ("ticket_drafts"."kind" in ('create','update','reopen')),
	CONSTRAINT "ticket_drafts_status_check" CHECK ("ticket_drafts"."status" in ('pending','confirmed','cancelled','failed'))
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"role" text NOT NULL,
	"department" text NOT NULL,
	"support_level" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_role_check" CHECK ("users"."role" in ('employee','analyst')),
	CONSTRAINT "users_support_level_check" CHECK ("users"."support_level" is null or "users"."support_level" in ('N1','N2'))
);
--> statement-breakpoint
CREATE TABLE "tickets"."ticket_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ticket_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"actor" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ticket_events_kind_check" CHECK ("tickets"."ticket_events"."kind" in ('created','comment','status_changed','transferred','reopened'))
);
--> statement-breakpoint
CREATE TABLE "tickets"."tickets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"category" text NOT NULL,
	"subcategory" text,
	"priority" text NOT NULL,
	"affected" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"requester_id" uuid NOT NULL,
	"assignee_name" text,
	"due_at" timestamp with time zone NOT NULL,
	"last_update_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tickets_code_unique" UNIQUE("code"),
	CONSTRAINT "tickets_type_check" CHECK ("tickets"."tickets"."type" in ('incident','request')),
	CONSTRAINT "tickets_category_check" CHECK ("tickets"."tickets"."category" in ('access','network_vpn','hardware','software','email','other')),
	CONSTRAINT "tickets_priority_check" CHECK ("tickets"."tickets"."priority" in ('critical','high','medium','low')),
	CONSTRAINT "tickets_affected_check" CHECK ("tickets"."tickets"."affected" in ('me','team','company')),
	CONSTRAINT "tickets_status_check" CHECK ("tickets"."tickets"."status" in ('open','in_progress','awaiting_analyst','approved','resolved','closed'))
);
--> statement-breakpoint
CREATE TABLE "tickets"."idempotency_keys" (
	"key" text PRIMARY KEY NOT NULL,
	"scope" text NOT NULL,
	"request_hash" text NOT NULL,
	"response_status" integer,
	"response_body" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai_agent_runs" ADD CONSTRAINT "ai_agent_runs_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_employee_id_users_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_assigned_to_user_id_users_id_fk" FOREIGN KEY ("assigned_to_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "handoffs" ADD CONSTRAINT "handoffs_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "handoffs" ADD CONSTRAINT "handoffs_acknowledged_by_users_id_fk" FOREIGN KEY ("acknowledged_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_sent_by_user_id_users_id_fk" FOREIGN KEY ("sent_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_drafts" ADD CONSTRAINT "ticket_drafts_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets"."ticket_events" ADD CONSTRAINT "ticket_events_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "tickets"."tickets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ai_agent_runs_conversation_idx" ON "ai_agent_runs" USING btree ("conversation_id","started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "conversations_employee_unique" ON "conversations" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "conversations_status_idx" ON "conversations" USING btree ("status","last_message_at");--> statement-breakpoint
CREATE INDEX "event_log_conversation_idx" ON "event_log" USING btree ("conversation_id","id");--> statement-breakpoint
CREATE INDEX "handoffs_conversation_idx" ON "handoffs" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE INDEX "llm_calls_created_idx" ON "llm_calls" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "messages_conversation_idx" ON "messages" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE INDEX "tickets_requester_idx" ON "tickets"."tickets" USING btree ("requester_id","last_update_at");