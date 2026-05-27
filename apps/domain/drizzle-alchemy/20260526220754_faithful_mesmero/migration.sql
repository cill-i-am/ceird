ALTER TABLE "sites" DROP CONSTRAINT "sites_ie_eircode_required_chk";--> statement-breakpoint
ALTER TABLE "sites" DROP CONSTRAINT "sites_geocoding_provider_chk";--> statement-breakpoint
ALTER TABLE "sites" DROP CONSTRAINT "sites_geocoding_metadata_check";--> statement-breakpoint
ALTER TABLE "sites" ADD COLUMN "raw_location_input" text;--> statement-breakpoint
ALTER TABLE "sites" ADD COLUMN "display_location" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "sites" ADD COLUMN "formatted_address" text;--> statement-breakpoint
ALTER TABLE "sites" ADD COLUMN "google_place_id" text;--> statement-breakpoint
ALTER TABLE "sites" ADD COLUMN "address_components" jsonb;--> statement-breakpoint
ALTER TABLE "sites" ADD COLUMN "location_provider" text;--> statement-breakpoint
ALTER TABLE "sites" ADD COLUMN "location_resolved_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "sites" ADD COLUMN "location_status" text DEFAULT 'unverified' NOT NULL;--> statement-breakpoint
ALTER TABLE "sites" DROP COLUMN "geocoding_provider";--> statement-breakpoint
ALTER TABLE "sites" DROP COLUMN "geocoded_at";--> statement-breakpoint
ALTER TABLE "sites" ALTER COLUMN "address_line_1" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "sites" ALTER COLUMN "county" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "sites" ALTER COLUMN "country" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "sites" ALTER COLUMN "country" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "sites" ALTER COLUMN "latitude" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "sites" ALTER COLUMN "longitude" DROP NOT NULL;--> statement-breakpoint
UPDATE "sites" SET "latitude" = null, "longitude" = null;--> statement-breakpoint
ALTER TABLE "sites" ADD CONSTRAINT "sites_location_status_chk" CHECK ("location_status" in ('unverified', 'google_resolved', 'manually_adjusted', 'validated', 'needs_review'));--> statement-breakpoint
ALTER TABLE "sites" ADD CONSTRAINT "sites_location_provider_chk" CHECK ("location_provider" is null or "location_provider" in ('google_places', 'stub'));--> statement-breakpoint
ALTER TABLE "sites" ADD CONSTRAINT "sites_google_resolved_metadata_check" CHECK ("location_status" <> 'google_resolved' or ("latitude" is not null and "longitude" is not null and "location_provider" is not null and "location_resolved_at" is not null and "google_place_id" is not null));--> statement-breakpoint
ALTER TABLE "sites" ADD CONSTRAINT "sites_google_place_id_format_chk" CHECK ("google_place_id" is null or (length("google_place_id") >= 1 and length("google_place_id") <= 256 and "google_place_id" ~ '^[A-Za-z0-9_-]+$'));--> statement-breakpoint
ALTER TABLE "sites" ADD CONSTRAINT "sites_unverified_location_metadata_check" CHECK ("location_status" <> 'unverified' or ("latitude" is null and "longitude" is null and "location_provider" is null and "location_resolved_at" is null and "google_place_id" is null));--> statement-breakpoint
ALTER TABLE "sites" DROP CONSTRAINT "sites_country_chk", ADD CONSTRAINT "sites_country_chk" CHECK ("country" is null or "country" in ('IE', 'GB'));
