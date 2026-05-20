DROP INDEX "sites_organization_active_name_idx";--> statement-breakpoint
CREATE INDEX "sites_service_area_id_idx" ON "sites" USING btree ("service_area_id");--> statement-breakpoint
CREATE INDEX "sites_organization_service_area_active_name_idx" ON "sites" USING btree ("organization_id","service_area_id","name","id") WHERE "sites"."archived_at" is null;--> statement-breakpoint
CREATE INDEX "sites_organization_active_name_idx" ON "sites" USING btree ("organization_id","name","id") WHERE "sites"."archived_at" is null;
