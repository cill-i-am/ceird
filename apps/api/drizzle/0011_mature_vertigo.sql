CREATE TABLE "work_item_cost_lines" (
	"id" uuid PRIMARY KEY NOT NULL,
	"work_item_id" uuid NOT NULL,
	"organization_id" text NOT NULL,
	"author_user_id" text NOT NULL,
	"type" text NOT NULL,
	"description" text NOT NULL,
	"quantity" numeric(12, 2) NOT NULL,
	"unit_price_minor" integer NOT NULL,
	"tax_rate_basis_points" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "work_item_cost_lines_type_chk" CHECK ("work_item_cost_lines"."type" in ('labour', 'material')),
	CONSTRAINT "work_item_cost_lines_quantity_positive_chk" CHECK ("work_item_cost_lines"."quantity" > 0),
	CONSTRAINT "work_item_cost_lines_unit_price_non_negative_chk" CHECK ("work_item_cost_lines"."unit_price_minor" >= 0),
	CONSTRAINT "work_item_cost_lines_tax_rate_range_chk" CHECK ("work_item_cost_lines"."tax_rate_basis_points" is null or ("work_item_cost_lines"."tax_rate_basis_points" >= 0 and "work_item_cost_lines"."tax_rate_basis_points" <= 10000))
);
--> statement-breakpoint
ALTER TABLE "work_item_activity" DROP CONSTRAINT "work_item_activity_event_type_chk";--> statement-breakpoint
ALTER TABLE "work_item_cost_lines" ADD CONSTRAINT "work_item_cost_lines_work_item_id_work_items_id_fk" FOREIGN KEY ("work_item_id") REFERENCES "public"."work_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_item_cost_lines" ADD CONSTRAINT "work_item_cost_lines_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_item_cost_lines" ADD CONSTRAINT "work_item_cost_lines_author_user_id_user_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "work_items_id_organization_id_idx" ON "work_items" USING btree ("id","organization_id");--> statement-breakpoint
ALTER TABLE "work_item_cost_lines" ADD CONSTRAINT "work_item_cost_lines_work_item_organization_fk" FOREIGN KEY ("work_item_id","organization_id") REFERENCES "public"."work_items"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "work_item_cost_lines_work_item_created_at_idx" ON "work_item_cost_lines" USING btree ("work_item_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "work_item_cost_lines_organization_created_at_idx" ON "work_item_cost_lines" USING btree ("organization_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
ALTER TABLE "work_item_activity" ADD CONSTRAINT "work_item_activity_event_type_chk" CHECK ("work_item_activity"."event_type" in ('job_created', 'status_changed', 'blocked_reason_changed', 'priority_changed', 'assignee_changed', 'coordinator_changed', 'site_changed', 'contact_changed', 'job_reopened', 'visit_logged', 'cost_line_added'));
