CREATE TABLE "activity_events" (
	"id" uuid PRIMARY KEY,
	"organization_id" text NOT NULL,
	"event_type" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text NOT NULL,
	"actor_id" uuid NOT NULL,
	"source_type" text NOT NULL,
	"source_id" text NOT NULL,
	"display" jsonb NOT NULL,
	"status" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"retained_until" timestamp with time zone NOT NULL,
	CONSTRAINT "activity_events_event_type_chk" CHECK ("event_type" in ('agent.product_effect', 'comment.created', 'job.assignee_changed', 'job.blocked_reason_changed', 'job.contact_changed', 'job.coordinator_changed', 'job.created', 'job.label_added', 'job.label_removed', 'job.priority_changed', 'job.reopened', 'job.site_changed', 'job.status_changed', 'job.visit_logged', 'label.archived', 'label.created', 'label.updated', 'site.comment_created', 'site.created', 'site.label_added', 'site.label_removed', 'site.updated')),
	CONSTRAINT "activity_events_target_type_chk" CHECK ("target_type" in ('agent_action_run', 'comment', 'job', 'label', 'site')),
	CONSTRAINT "activity_events_source_type_chk" CHECK ("source_type" in ('agent_action_run', 'comment', 'job_activity', 'label', 'site')),
	CONSTRAINT "activity_events_status_chk" CHECK ("status" in ('failed', 'pending', 'synced')),
	CONSTRAINT "activity_events_retained_until_after_created_chk" CHECK ("retained_until" > "created_at")
);
--> statement-breakpoint
CREATE UNIQUE INDEX "activity_events_id_org_idx" ON "activity_events" ("id","organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "activity_events_org_source_idx" ON "activity_events" ("organization_id","source_type","source_id");--> statement-breakpoint
CREATE INDEX "activity_events_org_created_idx" ON "activity_events" ("organization_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "activity_events_org_retained_until_idx" ON "activity_events" ("organization_id","retained_until");--> statement-breakpoint
CREATE INDEX "activity_events_org_target_created_idx" ON "activity_events" ("organization_id","target_type","target_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "activity_events_org_event_created_idx" ON "activity_events" ("organization_id","event_type","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
ALTER TABLE "activity_events" ADD CONSTRAINT "activity_events_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "activity_events" ADD CONSTRAINT "activity_events_actor_org_fk" FOREIGN KEY ("actor_id","organization_id") REFERENCES "product_activity_actors"("id","organization_id");