CREATE UNIQUE INDEX "work_items_id_organization_id_idx" ON "work_items" USING btree ("id","organization_id");--> statement-breakpoint
ALTER TABLE "work_item_cost_lines" ADD CONSTRAINT "work_item_cost_lines_work_item_organization_fk" FOREIGN KEY ("work_item_id","organization_id") REFERENCES "public"."work_items"("id","organization_id") ON DELETE cascade ON UPDATE no action;
