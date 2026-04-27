ALTER TABLE "sites" ADD COLUMN "country" text DEFAULT 'IE' NOT NULL;--> statement-breakpoint
ALTER TABLE "sites" ADD COLUMN "geocoding_provider" text;--> statement-breakpoint
ALTER TABLE "sites" ADD COLUMN "geocoded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "sites" ADD CONSTRAINT "sites_country_chk" CHECK ("sites"."country" in ('IE', 'GB'));--> statement-breakpoint
ALTER TABLE "sites" ADD CONSTRAINT "sites_geocoding_provider_chk" CHECK ("sites"."geocoding_provider" is null or "sites"."geocoding_provider" in ('google', 'stub'));--> statement-breakpoint
ALTER TABLE "sites" ADD CONSTRAINT "sites_geocoding_metadata_check" CHECK (("sites"."latitude" is null and "sites"."longitude" is null and "sites"."geocoding_provider" is null and "sites"."geocoded_at" is null) or ("sites"."latitude" is not null and "sites"."longitude" is not null and "sites"."geocoding_provider" is not null and "sites"."geocoded_at" is not null));