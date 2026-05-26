ALTER TABLE "organization" DROP CONSTRAINT "organization_slug_format_chk";--> statement-breakpoint
ALTER TABLE "organization" ADD CONSTRAINT "organization_slug_format_chk" CHECK ("organization"."slug" ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' and char_length("organization"."slug") <= 40);
