CREATE TABLE "product_activity_actors" (
	"id" uuid PRIMARY KEY,
	"organization_id" text NOT NULL,
	"kind" text NOT NULL,
	"display_name" text NOT NULL,
	"display_detail" text,
	"route_href" text,
	"route_label" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_activity_actors_kind_chk" CHECK ("kind" in ('member', 'agent', 'system')),
	CONSTRAINT "product_activity_actors_display_name_not_empty_chk" CHECK (length(trim("display_name")) > 0),
	CONSTRAINT "product_activity_actors_route_consistent_chk" CHECK (("route_href" is null and "route_label" is null) or ("route_href" is not null and "route_label" is not null))
);
--> statement-breakpoint
CREATE TABLE "product_activity_actor_sources" (
	"actor_id" uuid PRIMARY KEY,
	"organization_id" text NOT NULL,
	"kind" text NOT NULL,
	"user_id" text,
	"agent_thread_id" uuid,
	"system_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_activity_actor_sources_kind_chk" CHECK ("kind" in ('member', 'agent', 'system')),
	CONSTRAINT "product_activity_actor_sources_one_source_chk" CHECK ((
        "kind" = 'member'
        and "user_id" is not null
        and "agent_thread_id" is null
        and "system_key" is null
      ) or (
        "kind" = 'agent'
        and "user_id" is not null
        and "agent_thread_id" is not null
        and "system_key" is null
      ) or (
        "kind" = 'system'
        and "user_id" is null
        and "agent_thread_id" is null
        and "system_key" is not null
      ))
);
--> statement-breakpoint
ALTER TABLE "comments" ADD COLUMN "actor_id" uuid;--> statement-breakpoint
ALTER TABLE "work_item_activity" ADD COLUMN "actor_id" uuid;--> statement-breakpoint
CREATE INDEX "comments_actor_id_idx" ON "comments" ("organization_id","actor_id");--> statement-breakpoint
CREATE UNIQUE INDEX "product_activity_actors_id_org_idx" ON "product_activity_actors" ("id","organization_id");--> statement-breakpoint
CREATE INDEX "product_activity_actors_org_kind_updated_idx" ON "product_activity_actors" ("organization_id","kind","updated_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "product_activity_actor_sources_member_idx" ON "product_activity_actor_sources" ("organization_id","user_id") WHERE "kind" = 'member';--> statement-breakpoint
CREATE UNIQUE INDEX "product_activity_actor_sources_agent_thread_idx" ON "product_activity_actor_sources" ("organization_id","agent_thread_id") WHERE "kind" = 'agent';--> statement-breakpoint
CREATE UNIQUE INDEX "product_activity_actor_sources_system_idx" ON "product_activity_actor_sources" ("organization_id","system_key") WHERE "kind" = 'system';--> statement-breakpoint
CREATE INDEX "work_item_activity_organization_actor_id_created_at_idx" ON "work_item_activity" ("organization_id","actor_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_actor_org_fk" FOREIGN KEY ("actor_id","organization_id") REFERENCES "product_activity_actors"("id","organization_id");--> statement-breakpoint
ALTER TABLE "product_activity_actors" ADD CONSTRAINT "product_activity_actors_organization_id_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "product_activity_actor_sources" ADD CONSTRAINT "product_activity_actor_sources_maep6qoXJmr4_fkey" FOREIGN KEY ("organization_id") REFERENCES "organization"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "product_activity_actor_sources" ADD CONSTRAINT "product_activity_actor_sources_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "product_activity_actor_sources" ADD CONSTRAINT "product_activity_actor_sources_actor_org_fk" FOREIGN KEY ("actor_id","organization_id") REFERENCES "product_activity_actors"("id","organization_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "product_activity_actor_sources" ADD CONSTRAINT "product_activity_actor_sources_agent_thread_fk" FOREIGN KEY ("agent_thread_id","organization_id","user_id") REFERENCES "agent_threads"("id","organization_id","user_id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "work_item_activity" ADD CONSTRAINT "work_item_activity_actor_org_fk" FOREIGN KEY ("actor_id","organization_id") REFERENCES "product_activity_actors"("id","organization_id");