CREATE TABLE "site_comment_bodies" (
	"id" uuid PRIMARY KEY,
	"organization_id" text NOT NULL,
	"actor_id" uuid NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
INSERT INTO "site_comment_bodies" (
	"id",
	"organization_id",
	"actor_id",
	"body",
	"created_at",
	"updated_at"
)
SELECT
	"comments"."id",
	"comments"."organization_id",
	"comments"."actor_id",
	"comments"."body",
	"comments"."created_at",
	"comments"."updated_at"
FROM "site_comments"
INNER JOIN "comments"
	ON "comments"."id" = "site_comments"."comment_id"
	AND "comments"."organization_id" = "site_comments"."organization_id"
WHERE "comments"."actor_id" IS NOT NULL
ON CONFLICT ("id") DO NOTHING;
--> statement-breakpoint
CREATE INDEX "site_comment_bodies_organization_created_at_idx" ON "site_comment_bodies" ("organization_id","created_at","id");--> statement-breakpoint
CREATE INDEX "site_comment_bodies_actor_id_idx" ON "site_comment_bodies" ("organization_id","actor_id");--> statement-breakpoint
ALTER TABLE "site_comment_bodies" ADD CONSTRAINT "site_comment_bodies_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "site_comment_bodies" ADD CONSTRAINT "site_comment_bodies_comment_org_fk" FOREIGN KEY ("id","organization_id") REFERENCES "comments"("id","organization_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "site_comment_bodies" ADD CONSTRAINT "site_comment_bodies_actor_org_fk" FOREIGN KEY ("actor_id","organization_id") REFERENCES "product_activity_actors"("id","organization_id");
