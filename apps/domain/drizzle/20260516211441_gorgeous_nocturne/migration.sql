CREATE TABLE "site_labels" (
	"site_id" uuid NOT NULL,
	"label_id" uuid NOT NULL,
	"organization_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "site_labels_site_id_label_id_pk" PRIMARY KEY("site_id","label_id")
);
--> statement-breakpoint
ALTER TABLE "site_labels" ADD CONSTRAINT "site_labels_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_labels" ADD CONSTRAINT "site_labels_site_org_fk" FOREIGN KEY ("site_id","organization_id") REFERENCES "public"."sites"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_labels" ADD CONSTRAINT "site_labels_label_org_fk" FOREIGN KEY ("label_id","organization_id") REFERENCES "public"."labels"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "site_labels_label_site_idx" ON "site_labels" USING btree ("organization_id","label_id","site_id");--> statement-breakpoint
CREATE INDEX "site_labels_site_label_idx" ON "site_labels" USING btree ("organization_id","site_id","label_id");