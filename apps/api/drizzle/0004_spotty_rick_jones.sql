CREATE TABLE "contacts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"phone" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "service_regions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "sites" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"region_id" uuid,
	"name" text,
	"address_line_1" text,
	"address_line_2" text,
	"town" text,
	"county" text,
	"eircode" text,
	"access_notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "site_contacts" (
	"site_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "site_contacts_site_id_contact_id_pk" PRIMARY KEY("site_id","contact_id")
);
--> statement-breakpoint
CREATE TABLE "work_items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"status" text NOT NULL,
	"priority" text DEFAULT 'none' NOT NULL,
	"site_id" uuid,
	"contact_id" uuid,
	"assignee_id" text,
	"coordinator_id" text,
	"blocked_reason" text,
	"completed_at" timestamp with time zone,
	"completed_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_user_id" text NOT NULL,
	CONSTRAINT "work_items_kind_chk" CHECK ("work_items"."kind" in ('job', 'issue', 'inspection', 'maintenance_request')),
	CONSTRAINT "work_items_status_chk" CHECK ("work_items"."status" in ('new', 'triaged', 'in_progress', 'blocked', 'completed', 'canceled')),
	CONSTRAINT "work_items_priority_chk" CHECK ("work_items"."priority" in ('none', 'low', 'medium', 'high', 'urgent')),
	CONSTRAINT "work_items_blocked_reason_matches_status_chk" CHECK (("work_items"."status" = 'blocked' and "work_items"."blocked_reason" is not null) or ("work_items"."status" <> 'blocked' and "work_items"."blocked_reason" is null)),
	CONSTRAINT "work_items_coordinator_not_assignee_chk" CHECK ("work_items"."coordinator_id" is null or "work_items"."coordinator_id" <> "work_items"."assignee_id"),
	CONSTRAINT "work_items_completed_at_matches_status_chk" CHECK (("work_items"."status" = 'completed' and "work_items"."completed_at" is not null) or ("work_items"."status" <> 'completed'))
);
--> statement-breakpoint
CREATE TABLE "work_item_activity" (
	"id" uuid PRIMARY KEY NOT NULL,
	"work_item_id" uuid NOT NULL,
	"organization_id" text NOT NULL,
	"event_type" text NOT NULL,
	"actor_user_id" text,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "work_item_activity_event_type_chk" CHECK ("work_item_activity"."event_type" in ('job_created', 'status_changed', 'blocked_reason_changed', 'priority_changed', 'assignee_changed', 'coordinator_changed', 'site_changed', 'contact_changed', 'job_reopened', 'visit_logged'))
);
--> statement-breakpoint
CREATE TABLE "work_item_comments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"work_item_id" uuid NOT NULL,
	"author_user_id" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "work_item_visits" (
	"id" uuid PRIMARY KEY NOT NULL,
	"work_item_id" uuid NOT NULL,
	"organization_id" text NOT NULL,
	"author_user_id" text NOT NULL,
	"visit_date" timestamp with time zone NOT NULL,
	"duration_minutes" integer NOT NULL,
	"note" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "work_item_visits_duration_positive_chk" CHECK ("work_item_visits"."duration_minutes" > 0),
	CONSTRAINT "work_item_visits_duration_hour_increment_chk" CHECK ("work_item_visits"."duration_minutes" % 60 = 0)
);
--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_regions" ADD CONSTRAINT "service_regions_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sites" ADD CONSTRAINT "sites_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sites" ADD CONSTRAINT "sites_region_id_service_regions_id_fk" FOREIGN KEY ("region_id") REFERENCES "public"."service_regions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_contacts" ADD CONSTRAINT "site_contacts_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_contacts" ADD CONSTRAINT "site_contacts_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_items" ADD CONSTRAINT "work_items_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_items" ADD CONSTRAINT "work_items_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_items" ADD CONSTRAINT "work_items_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_items" ADD CONSTRAINT "work_items_assignee_id_user_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_items" ADD CONSTRAINT "work_items_coordinator_id_user_id_fk" FOREIGN KEY ("coordinator_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_items" ADD CONSTRAINT "work_items_completed_by_user_id_user_id_fk" FOREIGN KEY ("completed_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_items" ADD CONSTRAINT "work_items_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_item_activity" ADD CONSTRAINT "work_item_activity_work_item_id_work_items_id_fk" FOREIGN KEY ("work_item_id") REFERENCES "public"."work_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_item_activity" ADD CONSTRAINT "work_item_activity_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_item_activity" ADD CONSTRAINT "work_item_activity_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_item_comments" ADD CONSTRAINT "work_item_comments_work_item_id_work_items_id_fk" FOREIGN KEY ("work_item_id") REFERENCES "public"."work_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_item_comments" ADD CONSTRAINT "work_item_comments_author_user_id_user_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_item_visits" ADD CONSTRAINT "work_item_visits_work_item_id_work_items_id_fk" FOREIGN KEY ("work_item_id") REFERENCES "public"."work_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_item_visits" ADD CONSTRAINT "work_item_visits_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_item_visits" ADD CONSTRAINT "work_item_visits_author_user_id_user_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "contacts_organization_name_idx" ON "contacts" USING btree ("organization_id","name");--> statement-breakpoint
CREATE INDEX "contacts_organization_email_idx" ON "contacts" USING btree ("organization_id","email");--> statement-breakpoint
CREATE UNIQUE INDEX "service_regions_organization_slug_idx" ON "service_regions" USING btree ("organization_id","slug");--> statement-breakpoint
CREATE INDEX "service_regions_organization_name_idx" ON "service_regions" USING btree ("organization_id","name");--> statement-breakpoint
CREATE INDEX "sites_organization_updated_at_idx" ON "sites" USING btree ("organization_id","updated_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "sites_organization_region_idx" ON "sites" USING btree ("organization_id","region_id");--> statement-breakpoint
CREATE INDEX "site_contacts_contact_site_idx" ON "site_contacts" USING btree ("contact_id","site_id");--> statement-breakpoint
CREATE UNIQUE INDEX "site_contacts_primary_site_idx" ON "site_contacts" USING btree ("site_id") WHERE "site_contacts"."is_primary" = true;--> statement-breakpoint
CREATE INDEX "work_items_organization_updated_at_idx" ON "work_items" USING btree ("organization_id","updated_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "work_items_organization_status_updated_at_idx" ON "work_items" USING btree ("organization_id","status","updated_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "work_items_organization_assignee_updated_at_idx" ON "work_items" USING btree ("organization_id","assignee_id","updated_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "work_items_organization_coordinator_updated_at_idx" ON "work_items" USING btree ("organization_id","coordinator_id","updated_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "work_items_organization_site_updated_at_idx" ON "work_items" USING btree ("organization_id","site_id","updated_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "work_items_organization_active_updated_at_idx" ON "work_items" USING btree ("organization_id","updated_at" DESC NULLS LAST,"id" DESC NULLS LAST) WHERE "work_items"."status" not in ('completed', 'canceled');--> statement-breakpoint
CREATE INDEX "work_item_activity_work_item_created_at_idx" ON "work_item_activity" USING btree ("work_item_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "work_item_activity_organization_created_at_idx" ON "work_item_activity" USING btree ("organization_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "work_item_comments_work_item_created_at_idx" ON "work_item_comments" USING btree ("work_item_id","created_at","id");--> statement-breakpoint
CREATE INDEX "work_item_visits_work_item_visit_date_idx" ON "work_item_visits" USING btree ("work_item_id","visit_date" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "work_item_visits_organization_visit_date_idx" ON "work_item_visits" USING btree ("organization_id","visit_date" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
