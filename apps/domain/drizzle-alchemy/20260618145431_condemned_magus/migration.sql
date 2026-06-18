ALTER TABLE "labels" ADD COLUMN "color" text;--> statement-breakpoint
ALTER TABLE "labels" ADD COLUMN "description" text;--> statement-breakpoint
UPDATE "labels" SET "color" = 'oklch(64% 0.19 28)' WHERE "color" IS NULL;--> statement-breakpoint
ALTER TABLE "labels" ALTER COLUMN "color" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "labels" ADD CONSTRAINT "labels_color_oklch_chk" CHECK ("color" ~ '^oklch\([0-9]+(\.[0-9]+)?% [0-9]+(\.[0-9]+)? [0-9]+(\.[0-9]+)?\)$');--> statement-breakpoint
ALTER TABLE "labels" ADD CONSTRAINT "labels_description_max_length_chk" CHECK ("description" is null OR length(trim("description")) <= 280);--> statement-breakpoint
ALTER TABLE "activity_events" DROP CONSTRAINT "activity_events_event_type_chk", ADD CONSTRAINT "activity_events_event_type_chk" CHECK ("event_type" in ('agent.product_effect', 'comment.created', 'job.assignee_changed', 'job.blocked_reason_changed', 'job.contact_changed', 'job.coordinator_changed', 'job.created', 'job.label_added', 'job.label_removed', 'job.priority_changed', 'job.reopened', 'job.site_changed', 'job.status_changed', 'job.visit_logged', 'label.archived', 'label.created', 'label.restored', 'label.updated', 'site.comment_created', 'site.created', 'site.label_added', 'site.label_removed', 'site.updated'));
