CREATE TABLE "agent_threads" (
	"id" uuid PRIMARY KEY,
	"organization_id" text NOT NULL,
	"user_id" text NOT NULL,
	"agent_instance_name" text NOT NULL,
	"title" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"last_message_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_threads_status_chk" CHECK ("status" in ('active', 'archived')),
	CONSTRAINT "agent_threads_title_not_empty_chk" CHECK (length(trim("title")) > 0),
	CONSTRAINT "agent_threads_title_max_length_chk" CHECK (length(trim("title")) <= 120)
);
--> statement-breakpoint
CREATE TABLE "agent_action_runs" (
	"id" uuid PRIMARY KEY,
	"thread_id" uuid NOT NULL,
	"organization_id" text NOT NULL,
	"user_id" text NOT NULL,
	"operation_id" text NOT NULL,
	"action_name" text NOT NULL,
	"action_kind" text NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"input" jsonb NOT NULL,
	"result" jsonb,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "agent_action_runs_status_chk" CHECK ("status" in ('running', 'succeeded', 'failed')),
	CONSTRAINT "agent_action_runs_kind_chk" CHECK ("action_kind" in ('read', 'write', 'destructive')),
	CONSTRAINT "agent_action_runs_operation_id_not_empty_chk" CHECK (length(trim("operation_id")) > 0),
	CONSTRAINT "agent_action_runs_action_name_not_empty_chk" CHECK (length(trim("action_name")) > 0),
	CONSTRAINT "agent_action_runs_completed_status_chk" CHECK (("status" = 'running' and "completed_at" is null) or ("status" <> 'running' and "completed_at" is not null))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "agent_threads_agent_instance_name_idx" ON "agent_threads" ("agent_instance_name");
--> statement-breakpoint
CREATE UNIQUE INDEX "agent_threads_id_org_user_idx" ON "agent_threads" ("id","organization_id","user_id");
--> statement-breakpoint
CREATE INDEX "agent_threads_org_user_status_updated_idx" ON "agent_threads" ("organization_id","user_id","status","updated_at" DESC NULLS LAST,"id" DESC NULLS LAST);
--> statement-breakpoint
CREATE UNIQUE INDEX "agent_action_runs_thread_operation_idx" ON "agent_action_runs" ("thread_id","operation_id");
--> statement-breakpoint
CREATE INDEX "agent_action_runs_org_user_thread_created_idx" ON "agent_action_runs" ("organization_id","user_id","thread_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);
--> statement-breakpoint
ALTER TABLE "agent_threads" ADD CONSTRAINT "agent_threads_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "agent_threads" ADD CONSTRAINT "agent_threads_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;
--> statement-breakpoint
ALTER TABLE "agent_action_runs" ADD CONSTRAINT "agent_action_runs_thread_actor_fk" FOREIGN KEY ("thread_id","organization_id","user_id") REFERENCES "agent_threads"("id","organization_id","user_id") ON DELETE CASCADE;
