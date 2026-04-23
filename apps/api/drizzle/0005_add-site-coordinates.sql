ALTER TABLE "sites" ADD COLUMN "latitude" double precision;--> statement-breakpoint
ALTER TABLE "sites" ADD COLUMN "longitude" double precision;--> statement-breakpoint
ALTER TABLE "sites" ADD CONSTRAINT "sites_coordinates_pair_check" CHECK (("latitude" is null and "longitude" is null) or ("latitude" is not null and "longitude" is not null));--> statement-breakpoint
ALTER TABLE "sites" ADD CONSTRAINT "sites_latitude_range_check" CHECK ("latitude" is null or ("latitude" >= -90 and "latitude" <= 90));--> statement-breakpoint
ALTER TABLE "sites" ADD CONSTRAINT "sites_longitude_range_check" CHECK ("longitude" is null or ("longitude" >= -180 and "longitude" <= 180));
