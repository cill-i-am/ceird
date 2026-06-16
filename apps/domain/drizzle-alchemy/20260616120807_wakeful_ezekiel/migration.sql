CREATE TABLE IF NOT EXISTS "site_comment_bodies" (
	"id" uuid PRIMARY KEY,
	"organization_id" text NOT NULL,
	"actor_id" uuid NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "site_comment_bodies_organization_created_at_idx" ON "site_comment_bodies" ("organization_id","created_at","id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "site_comment_bodies_actor_id_idx" ON "site_comment_bodies" ("organization_id","actor_id");--> statement-breakpoint
DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint
		WHERE conname = 'site_comment_bodies_organization_id_organization_id_fkey'
	) THEN
		ALTER TABLE "site_comment_bodies" ADD CONSTRAINT "site_comment_bodies_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;
	END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint
		WHERE conname = 'site_comment_bodies_comment_org_fk'
	) THEN
		ALTER TABLE "site_comment_bodies" ADD CONSTRAINT "site_comment_bodies_comment_org_fk" FOREIGN KEY ("id","organization_id") REFERENCES "comments"("id","organization_id") ON DELETE CASCADE;
	END IF;
END $$;
--> statement-breakpoint
DO $$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM pg_constraint
		WHERE conname = 'site_comment_bodies_actor_org_fk'
	) THEN
		ALTER TABLE "site_comment_bodies" ADD CONSTRAINT "site_comment_bodies_actor_org_fk" FOREIGN KEY ("actor_id","organization_id") REFERENCES "product_activity_actors"("id","organization_id");
	END IF;
END $$;
--> statement-breakpoint
CREATE TABLE "work_item_comment_bodies" (
	"id" uuid PRIMARY KEY,
	"organization_id" text NOT NULL,
	"actor_id" uuid NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
WITH comment_member_users AS (
	SELECT DISTINCT
		"comments"."organization_id",
		"comments"."author_user_id" AS "user_id"
	FROM "comments"
	WHERE "comments"."actor_id" IS NULL
),
source_users AS (
	SELECT
		gen_random_uuid() AS "actor_id",
		comment_member_users."organization_id",
		comment_member_users."user_id",
		coalesce(nullif(trim("user"."name"), ''), 'Team member') AS "display_name"
	FROM comment_member_users
	INNER JOIN "member"
		ON "member"."organization_id" = comment_member_users."organization_id"
		AND "member"."user_id" = comment_member_users."user_id"
	INNER JOIN "user"
		ON "user"."id" = comment_member_users."user_id"
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
--> statement-breakpoint
UPDATE "comments"
SET "actor_id" = product_activity_actor_sources."actor_id"
FROM product_activity_actor_sources
WHERE "comments"."actor_id" IS NULL
	AND product_activity_actor_sources."organization_id" = "comments"."organization_id"
	AND product_activity_actor_sources."kind" = 'member'
	AND product_activity_actor_sources."user_id" = "comments"."author_user_id";
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
ON CONFLICT ("id") DO UPDATE
SET
	"organization_id" = excluded."organization_id",
	"actor_id" = excluded."actor_id",
	"body" = excluded."body",
	"created_at" = excluded."created_at",
	"updated_at" = excluded."updated_at";
--> statement-breakpoint
INSERT INTO "work_item_comment_bodies" (
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
FROM "work_item_comments"
INNER JOIN "comments"
	ON "comments"."id" = "work_item_comments"."comment_id"
	AND "comments"."organization_id" = "work_item_comments"."organization_id"
WHERE "comments"."actor_id" IS NOT NULL
ON CONFLICT ("id") DO UPDATE
SET
	"organization_id" = excluded."organization_id",
	"actor_id" = excluded."actor_id",
	"body" = excluded."body",
	"created_at" = excluded."created_at",
	"updated_at" = excluded."updated_at";
--> statement-breakpoint
CREATE INDEX "work_item_comment_bodies_organization_created_at_idx" ON "work_item_comment_bodies" ("organization_id","created_at","id");--> statement-breakpoint
CREATE INDEX "work_item_comment_bodies_actor_id_idx" ON "work_item_comment_bodies" ("organization_id","actor_id");--> statement-breakpoint
ALTER TABLE "work_item_comment_bodies" ADD CONSTRAINT "work_item_comment_bodies_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "work_item_comment_bodies" ADD CONSTRAINT "work_item_comment_bodies_comment_org_fk" FOREIGN KEY ("id","organization_id") REFERENCES "comments"("id","organization_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "work_item_comment_bodies" ADD CONSTRAINT "work_item_comment_bodies_actor_org_fk" FOREIGN KEY ("actor_id","organization_id") REFERENCES "product_activity_actors"("id","organization_id");
