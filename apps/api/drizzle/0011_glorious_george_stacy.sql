CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
CREATE INDEX "work_items_title_trgm_idx" ON "work_items" USING gin ("title" gin_trgm_ops);
