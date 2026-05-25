ALTER TABLE "rate_card_lines" DROP CONSTRAINT "rate_card_lines_rate_card_id_rate_cards_id_fk";--> statement-breakpoint
ALTER TABLE "sites" DROP CONSTRAINT "sites_service_area_id_service_areas_id_fk";--> statement-breakpoint
DROP TABLE "rate_cards";--> statement-breakpoint
DROP TABLE "rate_card_lines";--> statement-breakpoint
DROP TABLE "service_areas";--> statement-breakpoint
DROP TABLE "work_item_cost_lines";--> statement-breakpoint
DROP INDEX "sites_organization_service_area_idx";--> statement-breakpoint
DROP INDEX "sites_service_area_id_idx";--> statement-breakpoint
DROP INDEX "sites_organization_service_area_active_name_idx";--> statement-breakpoint
ALTER TABLE "sites" DROP COLUMN "service_area_id";--> statement-breakpoint
ALTER TABLE "work_items" DROP COLUMN "external_reference";--> statement-breakpoint
DELETE FROM "work_item_activity" WHERE "event_type" = 'cost_line_added';--> statement-breakpoint
ALTER TABLE "work_item_activity" DROP CONSTRAINT "work_item_activity_event_type_chk", ADD CONSTRAINT "work_item_activity_event_type_chk" CHECK ("event_type" in ('job_created', 'status_changed', 'blocked_reason_changed', 'priority_changed', 'assignee_changed', 'coordinator_changed', 'site_changed', 'contact_changed', 'job_reopened', 'visit_logged', 'label_added', 'label_removed'));
