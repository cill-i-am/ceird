CREATE TABLE "auth_security_audit_event" (
	"id" text PRIMARY KEY NOT NULL,
	"event_type" text NOT NULL,
	"actor_user_id" text,
	"organization_id" text,
	"session_id" text,
	"oauth_client_id" text,
	"scopes" text[],
	"source_ip" text,
	"user_agent" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "auth_security_audit_event_type_chk" CHECK ("event_type" in ('oauth_client_registration_succeeded', 'oauth_client_registration_rejected', 'oauth_consent_granted', 'oauth_consent_denied', 'oauth_token_refreshed', 'oauth_token_revoked'))
);
--> statement-breakpoint
CREATE INDEX "auth_security_audit_event_created_at_idx" ON "auth_security_audit_event" USING btree ("created_at" DESC NULLS LAST, "id" DESC NULLS LAST);
--> statement-breakpoint
CREATE INDEX "auth_security_audit_event_type_created_at_idx" ON "auth_security_audit_event" USING btree ("event_type", "created_at" DESC NULLS LAST, "id" DESC NULLS LAST);
--> statement-breakpoint
CREATE INDEX "auth_security_audit_event_actor_created_at_idx" ON "auth_security_audit_event" USING btree ("actor_user_id", "created_at" DESC NULLS LAST, "id" DESC NULLS LAST);
--> statement-breakpoint
CREATE INDEX "auth_security_audit_event_organization_created_at_idx" ON "auth_security_audit_event" USING btree ("organization_id", "created_at" DESC NULLS LAST, "id" DESC NULLS LAST);
--> statement-breakpoint
CREATE INDEX "auth_security_audit_event_session_created_at_idx" ON "auth_security_audit_event" USING btree ("session_id", "created_at" DESC NULLS LAST, "id" DESC NULLS LAST);
--> statement-breakpoint
CREATE INDEX "auth_security_audit_event_oauth_client_created_at_idx" ON "auth_security_audit_event" USING btree ("oauth_client_id", "created_at" DESC NULLS LAST, "id" DESC NULLS LAST);
