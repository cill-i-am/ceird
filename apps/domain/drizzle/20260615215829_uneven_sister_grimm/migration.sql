CREATE TABLE "site_active_job_summaries" (
	"site_id" uuid,
	"organization_id" text,
	"active_job_count" integer DEFAULT 0 NOT NULL,
	"highest_active_job_priority" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "site_active_job_summaries_pkey" PRIMARY KEY("site_id","organization_id"),
	CONSTRAINT "site_active_job_summaries_count_non_negative_chk" CHECK ("active_job_count" >= 0),
	CONSTRAINT "site_active_job_summaries_priority_chk" CHECK ("highest_active_job_priority" is null or "highest_active_job_priority" in ('none', 'low', 'medium', 'high', 'urgent')),
	CONSTRAINT "site_active_job_summaries_priority_count_consistency_chk" CHECK (("active_job_count" = 0 and "highest_active_job_priority" is null) or ("active_job_count" > 0 and "highest_active_job_priority" is not null))
);
--> statement-breakpoint
CREATE INDEX "site_active_job_summaries_organization_updated_at_idx" ON "site_active_job_summaries" ("organization_id","updated_at" DESC NULLS LAST,"site_id");--> statement-breakpoint
ALTER TABLE "site_active_job_summaries" ADD CONSTRAINT "site_active_job_summaries_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "site_active_job_summaries" ADD CONSTRAINT "site_active_job_summaries_site_org_fk" FOREIGN KEY ("site_id","organization_id") REFERENCES "sites"("id","organization_id") ON DELETE CASCADE;--> statement-breakpoint
INSERT INTO "site_active_job_summaries" (
	"site_id",
	"organization_id",
	"active_job_count",
	"highest_active_job_priority",
	"updated_at"
)
SELECT
	"work_items"."site_id",
	"work_items"."organization_id",
	count(*)::integer AS "active_job_count",
	CASE max(
		CASE "work_items"."priority"
			WHEN 'urgent' THEN 4
			WHEN 'high' THEN 3
			WHEN 'medium' THEN 2
			WHEN 'low' THEN 1
			ELSE 0
		END
	)
		WHEN 4 THEN 'urgent'
		WHEN 3 THEN 'high'
		WHEN 2 THEN 'medium'
		WHEN 1 THEN 'low'
		WHEN 0 THEN CASE WHEN count(*) > 0 THEN 'none' ELSE NULL END
		ELSE NULL
	END AS "highest_active_job_priority",
	now()
FROM "work_items"
JOIN "sites"
	ON "sites"."id" = "work_items"."site_id"
	AND "sites"."organization_id" = "work_items"."organization_id"
	AND "sites"."archived_at" IS NULL
WHERE "work_items"."site_id" IS NOT NULL
	AND "work_items"."status" NOT IN ('completed', 'canceled')
GROUP BY "work_items"."site_id", "work_items"."organization_id";
