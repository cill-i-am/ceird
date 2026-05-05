ALTER TABLE "site_contacts" DROP CONSTRAINT "site_contacts_site_id_sites_id_fk";
--> statement-breakpoint
ALTER TABLE "site_contacts" DROP CONSTRAINT "site_contacts_contact_id_contacts_id_fk";
--> statement-breakpoint
ALTER TABLE "work_items" DROP CONSTRAINT "work_items_site_id_sites_id_fk";
--> statement-breakpoint
ALTER TABLE "work_items" DROP CONSTRAINT "work_items_contact_id_contacts_id_fk";
--> statement-breakpoint
ALTER TABLE "work_item_activity" DROP CONSTRAINT "work_item_activity_work_item_id_work_items_id_fk";
--> statement-breakpoint
ALTER TABLE "work_item_visits" DROP CONSTRAINT "work_item_visits_work_item_id_work_items_id_fk";
--> statement-breakpoint
ALTER TABLE "site_contacts" ADD COLUMN "organization_id" text;--> statement-breakpoint
UPDATE "site_contacts"
SET "organization_id" = "sites"."organization_id"
FROM "sites"
WHERE "site_contacts"."site_id" = "sites"."id";--> statement-breakpoint
ALTER TABLE "site_contacts" ALTER COLUMN "organization_id" SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "contacts_id_organization_idx" ON "contacts" USING btree ("id","organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sites_id_organization_idx" ON "sites" USING btree ("id","organization_id");--> statement-breakpoint
ALTER TABLE "site_contacts" ADD CONSTRAINT "site_contacts_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_contacts" ADD CONSTRAINT "site_contacts_site_org_fk" FOREIGN KEY ("site_id","organization_id") REFERENCES "public"."sites"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_contacts" ADD CONSTRAINT "site_contacts_contact_org_fk" FOREIGN KEY ("contact_id","organization_id") REFERENCES "public"."contacts"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_items" ADD CONSTRAINT "work_items_site_org_fk" FOREIGN KEY ("site_id","organization_id") REFERENCES "public"."sites"("id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_items" ADD CONSTRAINT "work_items_contact_org_fk" FOREIGN KEY ("contact_id","organization_id") REFERENCES "public"."contacts"("id","organization_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_item_activity" ADD CONSTRAINT "work_item_activity_work_item_organization_fk" FOREIGN KEY ("work_item_id","organization_id") REFERENCES "public"."work_items"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_item_visits" ADD CONSTRAINT "work_item_visits_work_item_organization_fk" FOREIGN KEY ("work_item_id","organization_id") REFERENCES "public"."work_items"("id","organization_id") ON DELETE cascade ON UPDATE no action;
