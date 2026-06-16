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
--> statement-breakpoint
WITH job_member_users AS (
	SELECT DISTINCT
		work_items."organization_id",
		work_items."assignee_id" AS "user_id"
	FROM "work_items"
	WHERE work_items."assignee_id" IS NOT NULL
	UNION
	SELECT DISTINCT
		work_items."organization_id",
		work_items."coordinator_id" AS "user_id"
	FROM "work_items"
	WHERE work_items."coordinator_id" IS NOT NULL
),
source_users AS (
	SELECT
		gen_random_uuid() AS "actor_id",
		job_member_users."organization_id",
		job_member_users."user_id",
		coalesce(nullif(trim("user"."name"), ''), 'Team member') AS "display_name"
	FROM job_member_users
	INNER JOIN "member"
		ON "member"."organization_id" = job_member_users."organization_id"
		AND "member"."user_id" = job_member_users."user_id"
	INNER JOIN "user"
		ON "user"."id" = job_member_users."user_id"
),
existing_sources AS (
	SELECT
		source_users."organization_id",
		source_users."user_id",
		source_users."display_name",
		product_activity_actor_sources."actor_id"
	FROM source_users
	INNER JOIN product_activity_actor_sources
		ON product_activity_actor_sources."organization_id" = source_users."organization_id"
		AND product_activity_actor_sources."kind" = 'member'
		AND product_activity_actor_sources."user_id" = source_users."user_id"
),
inserted_actors AS (
	INSERT INTO "product_activity_actors" (
		"id",
		"organization_id",
		"kind",
		"display_name",
		"display_detail",
		"created_at",
		"updated_at"
	)
	SELECT
		source_users."actor_id",
		source_users."organization_id",
		'member',
		source_users."display_name",
		'Team member',
		now(),
		now()
	FROM source_users
	WHERE NOT EXISTS (
		SELECT 1
		FROM existing_sources
		WHERE existing_sources."organization_id" = source_users."organization_id"
			AND existing_sources."user_id" = source_users."user_id"
	)
	RETURNING
		"id",
		"organization_id",
		"display_name"
),
inserted_sources AS (
	INSERT INTO "product_activity_actor_sources" (
		"actor_id",
		"organization_id",
		"kind",
		"user_id",
		"created_at",
		"updated_at"
	)
	SELECT
		inserted_actors."id",
		source_users."organization_id",
		'member',
		source_users."user_id",
		now(),
		now()
	FROM inserted_actors
	INNER JOIN source_users
		ON source_users."organization_id" = inserted_actors."organization_id"
		AND source_users."actor_id" = inserted_actors."id"
	WHERE NOT EXISTS (
		SELECT 1
		FROM existing_sources
		WHERE existing_sources."organization_id" = source_users."organization_id"
			AND existing_sources."user_id" = source_users."user_id"
	)
	RETURNING
		"actor_id",
		"organization_id",
		"user_id"
),
member_actors AS (
	SELECT
		existing_sources."actor_id",
		existing_sources."organization_id",
		existing_sources."user_id",
		existing_sources."display_name"
	FROM existing_sources
	UNION ALL
	SELECT
		inserted_sources."actor_id",
		inserted_sources."organization_id",
		inserted_sources."user_id",
		source_users."display_name"
	FROM inserted_sources
	INNER JOIN source_users
		ON source_users."organization_id" = inserted_sources."organization_id"
		AND source_users."user_id" = inserted_sources."user_id"
)
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
	member_actors."actor_id",
	member_actors."organization_id",
	member_actors."user_id",
	member_actors."display_name",
	'Team member',
	NULL,
	NULL,
	now(),
	now()
FROM member_actors
ON CONFLICT ("actor_id") DO UPDATE
SET
	"organization_id" = excluded."organization_id",
	"user_id" = excluded."user_id",
	"display_name" = excluded."display_name",
	"display_detail" = excluded."display_detail",
	"route_href" = excluded."route_href",
	"route_label" = excluded."route_label",
	"updated_at" = excluded."updated_at";
