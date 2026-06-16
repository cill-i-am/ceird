CREATE TABLE "product_member_actor_summaries" (
	"actor_id" uuid PRIMARY KEY,
	"organization_id" text NOT NULL,
	"user_id" text NOT NULL,
	"display_name" text NOT NULL,
	"display_detail" text,
	"route_href" text,
	"route_label" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_member_actor_summaries_display_name_not_empty_chk" CHECK (length(trim("display_name")) > 0),
	CONSTRAINT "product_member_actor_summaries_route_consistent_chk" CHECK (("route_href" is null and "route_label" is null) or ("route_href" is not null and "route_label" is not null))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "product_member_actor_summaries_org_user_idx" ON "product_member_actor_summaries" ("organization_id","user_id");--> statement-breakpoint
CREATE INDEX "product_member_actor_summaries_org_updated_idx" ON "product_member_actor_summaries" ("organization_id","updated_at" DESC NULLS LAST,"actor_id" DESC NULLS LAST);--> statement-breakpoint
ALTER TABLE "product_member_actor_summaries" ADD CONSTRAINT "product_member_actor_summaries_IRzmRwC8UbSH_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "product_member_actor_summaries" ADD CONSTRAINT "product_member_actor_summaries_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "product_member_actor_summaries" ADD CONSTRAINT "product_member_actor_summaries_actor_org_fk" FOREIGN KEY ("actor_id","organization_id") REFERENCES "product_activity_actors"("id","organization_id") ON DELETE CASCADE;--> statement-breakpoint
INSERT INTO "product_member_actor_summaries" (
	"actor_id",
	"organization_id",
	"user_id",
	"display_name",
	"display_detail",
	"route_href",
	"route_label",
	"created_at",
	"updated_at"
)
SELECT
	actors."id",
	sources."organization_id",
	sources."user_id",
	actors."display_name",
	actors."display_detail",
	actors."route_href",
	actors."route_label",
	least(actors."created_at", sources."created_at"),
	greatest(actors."updated_at", sources."updated_at")
FROM "product_activity_actor_sources" sources
INNER JOIN "product_activity_actors" actors
	ON actors."id" = sources."actor_id"
	AND actors."organization_id" = sources."organization_id"
WHERE sources."kind" = 'member'
	AND actors."kind" = 'member'
	AND sources."user_id" IS NOT NULL
ON CONFLICT ("actor_id") DO UPDATE
SET
	"organization_id" = excluded."organization_id",
	"user_id" = excluded."user_id",
	"display_name" = excluded."display_name",
	"display_detail" = excluded."display_detail",
	"route_href" = excluded."route_href",
	"route_label" = excluded."route_label",
	"updated_at" = excluded."updated_at";
