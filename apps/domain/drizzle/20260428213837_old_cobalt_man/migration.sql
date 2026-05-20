CREATE TABLE "rate_cards" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "rate_card_lines" (
	"id" uuid PRIMARY KEY NOT NULL,
	"rate_card_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"position" integer NOT NULL,
	"unit" text NOT NULL,
	"value" numeric(12, 2) NOT NULL,
	CONSTRAINT "rate_card_lines_value_non_negative_chk" CHECK ("rate_card_lines"."value" >= 0),
	CONSTRAINT "rate_card_lines_position_positive_chk" CHECK ("rate_card_lines"."position" > 0),
	CONSTRAINT "rate_card_lines_kind_chk" CHECK ("rate_card_lines"."kind" in ('labour', 'callout', 'material_markup', 'custom'))
);
--> statement-breakpoint
ALTER TABLE "service_regions" RENAME TO "service_areas";--> statement-breakpoint
ALTER TABLE "sites" RENAME COLUMN "region_id" TO "service_area_id";--> statement-breakpoint
ALTER TABLE "service_areas" DROP CONSTRAINT "service_regions_organization_id_organization_id_fk";
--> statement-breakpoint
ALTER TABLE "sites" DROP CONSTRAINT "sites_region_id_service_regions_id_fk";
--> statement-breakpoint
DROP INDEX "service_regions_organization_slug_idx";--> statement-breakpoint
DROP INDEX "service_regions_organization_name_idx";--> statement-breakpoint
DROP INDEX "sites_organization_region_idx";--> statement-breakpoint
ALTER TABLE "service_areas" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "rate_cards" ADD CONSTRAINT "rate_cards_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rate_card_lines" ADD CONSTRAINT "rate_card_lines_rate_card_id_rate_cards_id_fk" FOREIGN KEY ("rate_card_id") REFERENCES "public"."rate_cards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "rate_cards_organization_updated_at_idx" ON "rate_cards" USING btree ("organization_id","updated_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "rate_cards_organization_name_idx" ON "rate_cards" USING btree ("organization_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "rate_card_lines_rate_card_position_unique_idx" ON "rate_card_lines" USING btree ("rate_card_id","position");--> statement-breakpoint
ALTER TABLE "service_areas" ADD CONSTRAINT "service_areas_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sites" ADD CONSTRAINT "sites_service_area_id_service_areas_id_fk" FOREIGN KEY ("service_area_id") REFERENCES "public"."service_areas"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "service_areas_organization_slug_idx" ON "service_areas" USING btree ("organization_id","slug");--> statement-breakpoint
CREATE INDEX "service_areas_organization_name_idx" ON "service_areas" USING btree ("organization_id","name");--> statement-breakpoint
CREATE INDEX "sites_organization_service_area_idx" ON "sites" USING btree ("organization_id","service_area_id");