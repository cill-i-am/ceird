ALTER TABLE "auth_security_audit_event" DROP CONSTRAINT "auth_security_audit_event_type_chk";--> statement-breakpoint
ALTER TABLE "auth_security_audit_event" ADD CONSTRAINT "auth_security_audit_event_type_chk" CHECK ("event_type" in ('oauth_client_registration_succeeded', 'oauth_client_registration_rejected', 'oauth_consent_granted', 'oauth_consent_denied', 'oauth_consent_revoked', 'oauth_token_refreshed', 'oauth_token_revoked', 'organization_created', 'organization_updated', 'organization_active_changed', 'organization_invitation_created', 'organization_invitation_resent', 'organization_invitation_canceled', 'organization_invitation_accepted', 'organization_member_role_updated', 'organization_member_removed'));--> statement-breakpoint
CREATE INDEX "oauth_refresh_token_user_client_reference_active_idx" ON "oauth_refresh_token" USING btree ("user_id","client_id","reference_id","expires_at") WHERE "oauth_refresh_token"."revoked" is null;--> statement-breakpoint
CREATE INDEX "oauth_access_token_user_client_reference_expires_idx" ON "oauth_access_token" USING btree ("user_id","client_id","reference_id","expires_at");--> statement-breakpoint
CREATE INDEX "oauth_consent_user_client_reference_idx" ON "oauth_consent" USING btree ("user_id","client_id","reference_id");--> statement-breakpoint
DELETE FROM "oauth_consent" WHERE "id" IN (
  SELECT "id"
  FROM (
    SELECT
      "id",
      row_number() OVER (
        PARTITION BY "user_id", "client_id", "reference_id"
        ORDER BY "updated_at" DESC, "created_at" DESC, "id" DESC
      ) AS "duplicate_rank"
    FROM "oauth_consent"
    WHERE "user_id" IS NOT NULL
  ) "ranked_oauth_consent"
  WHERE "duplicate_rank" > 1
);--> statement-breakpoint
CREATE UNIQUE INDEX "oauth_consent_user_client_account_unique_idx" ON "oauth_consent" USING btree ("user_id","client_id") WHERE "oauth_consent"."user_id" is not null and "oauth_consent"."reference_id" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "oauth_consent_user_client_reference_unique_idx" ON "oauth_consent" USING btree ("user_id","client_id","reference_id") WHERE "oauth_consent"."user_id" is not null and "oauth_consent"."reference_id" is not null;--> statement-breakpoint
UPDATE "oauth_refresh_token"
SET "revoked" = now()
WHERE "revoked" IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM "oauth_consent"
    WHERE "oauth_consent"."user_id" = "oauth_refresh_token"."user_id"
      AND "oauth_consent"."client_id" = "oauth_refresh_token"."client_id"
      AND "oauth_consent"."reference_id" IS NOT DISTINCT FROM "oauth_refresh_token"."reference_id"
      AND "oauth_refresh_token"."scopes" <@ "oauth_consent"."scopes"
  );--> statement-breakpoint
DELETE FROM "oauth_access_token"
WHERE "user_id" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM "oauth_consent"
    WHERE "oauth_consent"."user_id" = "oauth_access_token"."user_id"
      AND "oauth_consent"."client_id" = "oauth_access_token"."client_id"
      AND "oauth_consent"."reference_id" IS NOT DISTINCT FROM "oauth_access_token"."reference_id"
      AND "oauth_access_token"."scopes" <@ "oauth_consent"."scopes"
  );--> statement-breakpoint
CREATE FUNCTION enforce_oauth_refresh_token_active_consent()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."user_id" IS NULL OR NEW."revoked" IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM "oauth_consent"
    WHERE "oauth_consent"."user_id" = NEW."user_id"
      AND "oauth_consent"."client_id" = NEW."client_id"
      AND "oauth_consent"."reference_id" IS NOT DISTINCT FROM NEW."reference_id"
      AND NEW."scopes" <@ "oauth_consent"."scopes"
  ) THEN
    RAISE EXCEPTION 'active oauth refresh token requires matching consent'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "oauth_refresh_token_active_consent_chk"
BEFORE INSERT OR UPDATE OF "user_id", "client_id", "reference_id", "scopes", "revoked"
ON "oauth_refresh_token"
FOR EACH ROW
EXECUTE FUNCTION enforce_oauth_refresh_token_active_consent();--> statement-breakpoint
CREATE FUNCTION enforce_oauth_access_token_active_consent()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."user_id" IS NULL THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM "oauth_consent"
    WHERE "oauth_consent"."user_id" = NEW."user_id"
      AND "oauth_consent"."client_id" = NEW."client_id"
      AND "oauth_consent"."reference_id" IS NOT DISTINCT FROM NEW."reference_id"
      AND NEW."scopes" <@ "oauth_consent"."scopes"
  ) THEN
    RAISE EXCEPTION 'active oauth access token requires matching consent'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "oauth_access_token_active_consent_chk"
BEFORE INSERT OR UPDATE OF "user_id", "client_id", "reference_id", "scopes"
ON "oauth_access_token"
FOR EACH ROW
EXECUTE FUNCTION enforce_oauth_access_token_active_consent();
