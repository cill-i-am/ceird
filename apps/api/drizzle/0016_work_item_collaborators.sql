CREATE TABLE "work_item_collaborators" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"work_item_id" uuid NOT NULL,
	"subject_type" text DEFAULT 'user' NOT NULL,
	"user_id" text,
	"role_label" text NOT NULL,
	"access_level" text DEFAULT 'comment' NOT NULL,
	"created_by_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "work_item_collaborators_subject_type_chk" CHECK ("work_item_collaborators"."subject_type" in ('user')),
	CONSTRAINT "work_item_collaborators_user_subject_chk" CHECK ("work_item_collaborators"."subject_type" <> 'user' or "work_item_collaborators"."user_id" is not null),
	CONSTRAINT "work_item_collaborators_access_level_chk" CHECK ("work_item_collaborators"."access_level" in ('read', 'comment')),
	CONSTRAINT "work_item_collaborators_role_label_not_empty_chk" CHECK (length(trim("work_item_collaborators"."role_label")) > 0)
);
--> statement-breakpoint
ALTER TABLE "work_item_collaborators" ADD CONSTRAINT "work_item_collaborators_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_item_collaborators" ADD CONSTRAINT "work_item_collaborators_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_item_collaborators" ADD CONSTRAINT "work_item_collaborators_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_item_collaborators" ADD CONSTRAINT "work_item_collaborators_work_item_org_fk" FOREIGN KEY ("work_item_id","organization_id") REFERENCES "public"."work_items"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_item_collaborators" ADD CONSTRAINT "work_item_collaborators_member_fk" FOREIGN KEY ("organization_id","user_id") REFERENCES "public"."member"("organization_id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "work_item_collaborators_user_unique_idx" ON "work_item_collaborators" USING btree ("organization_id","work_item_id","user_id") WHERE "work_item_collaborators"."subject_type" = 'user';--> statement-breakpoint
CREATE INDEX "work_item_collaborators_user_lookup_idx" ON "work_item_collaborators" USING btree ("organization_id","user_id","work_item_id");
