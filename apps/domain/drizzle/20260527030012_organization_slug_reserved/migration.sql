UPDATE "organization"
SET "slug" = "slug" || '-' || substr(md5("id"), 1, 12)
WHERE "slug" in ('app', 'api', 'agent', 'mcp');--> statement-breakpoint
ALTER TABLE "organization" DROP CONSTRAINT "organization_slug_format_chk", ADD CONSTRAINT "organization_slug_format_chk" CHECK ("slug" ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' and char_length("slug") <= 40 and "slug" not in ('app', 'api', 'agent', 'mcp'));
