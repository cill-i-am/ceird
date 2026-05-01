CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
CREATE INDEX "work_items_title_trgm_idx" ON "work_items" USING gin ("title" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "work_item_activity_organization_actor_created_at_idx" ON "work_item_activity" USING btree ("organization_id","actor_user_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "work_item_activity_organization_event_created_at_idx" ON "work_item_activity" USING btree ("organization_id","event_type","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);
