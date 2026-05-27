WITH "organization_slug_backfill" AS (
		SELECT
			"id",
			NULLIF(
				TRIM(BOTH '-' FROM LEFT(
					REGEXP_REPLACE(LOWER(COALESCE(NULLIF(TRIM("slug"), ''), NULLIF(TRIM("name"), ''), "id")), '[^a-z0-9]+', '-', 'g'),
					27
				)),
				''
			) AS "slug_base"
		FROM "organization"
		WHERE "slug" !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' OR char_length("slug") > 40
	)
UPDATE "organization"
SET "slug" = COALESCE("organization_slug_backfill"."slug_base", 'org') || '-' || substr(md5("organization"."id"), 1, 12)
FROM "organization_slug_backfill"
WHERE "organization"."id" = "organization_slug_backfill"."id";--> statement-breakpoint
ALTER TABLE "organization" DROP CONSTRAINT "organization_slug_format_chk";--> statement-breakpoint
ALTER TABLE "organization" ADD CONSTRAINT "organization_slug_format_chk" CHECK ("organization"."slug" ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' and char_length("organization"."slug") <= 40);
