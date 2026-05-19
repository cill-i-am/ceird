CREATE INDEX "sites_organization_active_name_idx" ON "sites" USING btree ("organization_id","name","created_at","id") WHERE "sites"."archived_at" is null;
