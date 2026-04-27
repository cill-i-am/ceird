ALTER TABLE "sites" ALTER COLUMN "name" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "sites" ALTER COLUMN "address_line_1" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "sites" ALTER COLUMN "county" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "sites" ALTER COLUMN "latitude" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "sites" ALTER COLUMN "longitude" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "sites" ADD COLUMN "country" text DEFAULT 'IE' NOT NULL;--> statement-breakpoint
ALTER TABLE "sites" ADD COLUMN "geocoding_provider" text NOT NULL;--> statement-breakpoint
ALTER TABLE "sites" ADD COLUMN "geocoded_at" timestamp with time zone NOT NULL;--> statement-breakpoint
ALTER TABLE "sites" ADD CONSTRAINT "sites_country_chk" CHECK ("sites"."country" in ('IE', 'GB'));--> statement-breakpoint
ALTER TABLE "sites" ADD CONSTRAINT "sites_ie_eircode_required_chk" CHECK ("sites"."country" <> 'IE' or "sites"."eircode" is not null);--> statement-breakpoint
ALTER TABLE "sites" ADD CONSTRAINT "sites_geocoding_provider_chk" CHECK ("sites"."geocoding_provider" is null or "sites"."geocoding_provider" in ('google', 'stub'));--> statement-breakpoint
ALTER TABLE "sites" ADD CONSTRAINT "sites_geocoding_metadata_check" CHECK (("sites"."latitude" is null and "sites"."longitude" is null and "sites"."geocoding_provider" is null and "sites"."geocoded_at" is null) or ("sites"."latitude" is not null and "sites"."longitude" is not null and "sites"."geocoding_provider" is not null and "sites"."geocoded_at" is not null));