UPDATE "organization"
SET "slug" = "slug" || '-' || substr(md5("id"), 1, 12)
WHERE "slug" = 'sync';--> statement-breakpoint
ALTER TABLE "organization" DROP CONSTRAINT "organization_slug_format_chk", ADD CONSTRAINT "organization_slug_format_chk" CHECK ("slug" ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' and char_length("slug") <= 40 and "slug" not in ('app', 'api', 'agent', 'mcp', 'sync'));--> statement-breakpoint
CREATE INDEX "labels_organization_id_idx" ON "labels" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "work_item_comments_organization_created_at_idx" ON "work_item_comments" USING btree ("organization_id","created_at","comment_id");--> statement-breakpoint
CREATE INDEX "site_comments_organization_created_at_idx" ON "site_comments" USING btree ("organization_id","created_at","comment_id");--> statement-breakpoint
CREATE INDEX "site_contacts_organization_created_at_idx" ON "site_contacts" USING btree ("organization_id","created_at","site_id","contact_id");
