CREATE TABLE "job_labels" (
  "id" uuid PRIMARY KEY NOT NULL,
  "organization_id" text NOT NULL,
  "name" text NOT NULL,
  "normalized_name" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "archived_at" timestamp with time zone,
  CONSTRAINT "job_labels_name_not_empty_chk" CHECK (length(trim("job_labels"."name")) > 0),
  CONSTRAINT "job_labels_normalized_name_not_empty_chk" CHECK (length(trim("job_labels"."normalized_name")) > 0)
);
--> statement-breakpoint
CREATE TABLE "work_item_labels" (
  "work_item_id" uuid NOT NULL,
  "label_id" uuid NOT NULL,
  "organization_id" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "work_item_labels_work_item_id_label_id_pk" PRIMARY KEY("work_item_id","label_id")
);
--> statement-breakpoint
ALTER TABLE "job_labels" ADD CONSTRAINT "job_labels_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "work_item_labels" ADD CONSTRAINT "work_item_labels_work_item_id_work_items_id_fk" FOREIGN KEY ("work_item_id") REFERENCES "public"."work_items"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "work_item_labels" ADD CONSTRAINT "work_item_labels_label_id_job_labels_id_fk" FOREIGN KEY ("label_id") REFERENCES "public"."job_labels"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "work_item_labels" ADD CONSTRAINT "work_item_labels_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "job_labels_organization_normalized_active_idx" ON "job_labels" USING btree ("organization_id","normalized_name") WHERE "job_labels"."archived_at" is null;
--> statement-breakpoint
CREATE INDEX "job_labels_organization_name_idx" ON "job_labels" USING btree ("organization_id","name","id");
--> statement-breakpoint
CREATE INDEX "work_item_labels_label_work_item_idx" ON "work_item_labels" USING btree ("organization_id","label_id","work_item_id");
--> statement-breakpoint
CREATE INDEX "work_item_labels_work_item_idx" ON "work_item_labels" USING btree ("work_item_id");
--> statement-breakpoint
ALTER TABLE "work_item_activity" DROP CONSTRAINT "work_item_activity_event_type_chk";
--> statement-breakpoint
ALTER TABLE "work_item_activity" ADD CONSTRAINT "work_item_activity_event_type_chk" CHECK ("work_item_activity"."event_type" in ('job_created', 'status_changed', 'blocked_reason_changed', 'priority_changed', 'assignee_changed', 'coordinator_changed', 'site_changed', 'contact_changed', 'job_reopened', 'visit_logged', 'label_added', 'label_removed'));
