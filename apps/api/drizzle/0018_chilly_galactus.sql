CREATE TABLE "comments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"author_user_id" text NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by_user_id" text
);
--> statement-breakpoint
CREATE TABLE "site_comments" (
	"comment_id" uuid PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"site_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "work_item_comments" RENAME COLUMN "id" TO "comment_id";--> statement-breakpoint
ALTER TABLE "work_item_comments" DROP CONSTRAINT "work_item_comments_work_item_id_work_items_id_fk";
--> statement-breakpoint
ALTER TABLE "work_item_comments" DROP CONSTRAINT "work_item_comments_author_user_id_user_id_fk";
--> statement-breakpoint
DROP INDEX "work_item_comments_work_item_created_at_idx";--> statement-breakpoint
ALTER TABLE "work_item_comments" ADD COLUMN "organization_id" text;--> statement-breakpoint
INSERT INTO "comments" (
	"id",
	"organization_id",
	"author_user_id",
	"body",
	"created_at",
	"updated_at"
)
SELECT
	"work_item_comments"."comment_id",
	"work_items"."organization_id",
	"work_item_comments"."author_user_id",
	"work_item_comments"."body",
	"work_item_comments"."created_at",
	"work_item_comments"."created_at"
FROM "work_item_comments"
INNER JOIN "work_items"
	ON "work_items"."id" = "work_item_comments"."work_item_id";--> statement-breakpoint
UPDATE "work_item_comments"
SET "organization_id" = "work_items"."organization_id"
FROM "work_items"
WHERE "work_items"."id" = "work_item_comments"."work_item_id";--> statement-breakpoint
ALTER TABLE "work_item_comments" ALTER COLUMN "organization_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_author_user_id_user_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_updated_by_user_id_user_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "comments_id_organization_idx" ON "comments" USING btree ("id","organization_id");--> statement-breakpoint
CREATE INDEX "comments_organization_id_idx" ON "comments" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "comments_author_user_id_idx" ON "comments" USING btree ("author_user_id");--> statement-breakpoint
CREATE INDEX "comments_updated_by_user_id_idx" ON "comments" USING btree ("updated_by_user_id");--> statement-breakpoint
CREATE FUNCTION validate_comment_member_users()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	IF TG_OP = 'INSERT'
		OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
		OR NEW.author_user_id IS DISTINCT FROM OLD.author_user_id THEN
		IF NOT EXISTS (
		SELECT 1
		FROM member
		WHERE organization_id = NEW.organization_id
			AND user_id = NEW.author_user_id
		FOR KEY SHARE
	) THEN
			RAISE foreign_key_violation
				USING CONSTRAINT = 'comments_author_member_chk';
		END IF;
	END IF;

	IF (TG_OP = 'INSERT'
		OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
		OR NEW.updated_by_user_id IS DISTINCT FROM OLD.updated_by_user_id)
		AND NEW.updated_by_user_id IS NOT NULL
		AND NOT EXISTS (
			SELECT 1
			FROM member
			WHERE organization_id = NEW.organization_id
				AND user_id = NEW.updated_by_user_id
			FOR KEY SHARE
		) THEN
		RAISE foreign_key_violation
			USING CONSTRAINT = 'comments_updated_by_member_chk';
	END IF;

	RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER validate_comment_member_users_before_insert_update
BEFORE INSERT OR UPDATE OF organization_id, author_user_id, updated_by_user_id ON comments
FOR EACH ROW
EXECUTE FUNCTION validate_comment_member_users();--> statement-breakpoint
ALTER TABLE "site_comments" ADD CONSTRAINT "site_comments_comment_org_fk" FOREIGN KEY ("comment_id","organization_id") REFERENCES "public"."comments"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_comments" ADD CONSTRAINT "site_comments_site_org_fk" FOREIGN KEY ("site_id","organization_id") REFERENCES "public"."sites"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "site_comments_site_created_at_idx" ON "site_comments" USING btree ("site_id","created_at","comment_id");--> statement-breakpoint
ALTER TABLE "work_item_comments" ADD CONSTRAINT "work_item_comments_comment_org_fk" FOREIGN KEY ("comment_id","organization_id") REFERENCES "public"."comments"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_item_comments" ADD CONSTRAINT "work_item_comments_work_item_org_fk" FOREIGN KEY ("work_item_id","organization_id") REFERENCES "public"."work_items"("id","organization_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "work_item_comments_work_item_created_at_idx" ON "work_item_comments" USING btree ("work_item_id","created_at","comment_id");--> statement-breakpoint
CREATE FUNCTION validate_comment_single_ownership()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	PERFORM 1
	FROM comments
	WHERE id = NEW.comment_id
		AND organization_id = NEW.organization_id
	FOR UPDATE;

	IF TG_TABLE_NAME = 'work_item_comments' THEN
		IF EXISTS (
			SELECT 1
			FROM site_comments
			WHERE comment_id = NEW.comment_id
				AND organization_id = NEW.organization_id
			FOR KEY SHARE
		) THEN
			RAISE foreign_key_violation
				USING CONSTRAINT = 'comments_single_ownership_chk';
		END IF;
	ELSIF TG_TABLE_NAME = 'site_comments' THEN
		IF EXISTS (
			SELECT 1
			FROM work_item_comments
			WHERE comment_id = NEW.comment_id
				AND organization_id = NEW.organization_id
			FOR KEY SHARE
		) THEN
			RAISE foreign_key_violation
				USING CONSTRAINT = 'comments_single_ownership_chk';
		END IF;
	END IF;

	RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER validate_work_item_comment_single_ownership_before_insert_update
BEFORE INSERT OR UPDATE OF comment_id, organization_id ON work_item_comments
FOR EACH ROW
EXECUTE FUNCTION validate_comment_single_ownership();--> statement-breakpoint
CREATE TRIGGER validate_site_comment_single_ownership_before_insert_update
BEFORE INSERT OR UPDATE OF comment_id, organization_id ON site_comments
FOR EACH ROW
EXECUTE FUNCTION validate_comment_single_ownership();--> statement-breakpoint
CREATE FUNCTION reject_comment_ownership_identity_update()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	IF NEW.comment_id IS DISTINCT FROM OLD.comment_id
		OR NEW.organization_id IS DISTINCT FROM OLD.organization_id THEN
		RAISE check_violation
			USING CONSTRAINT = 'comments_ownership_identity_immutable_chk';
	END IF;

	RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER reject_work_item_comment_identity_update_before_update
BEFORE UPDATE OF comment_id, organization_id ON work_item_comments
FOR EACH ROW
EXECUTE FUNCTION reject_comment_ownership_identity_update();--> statement-breakpoint
CREATE TRIGGER reject_site_comment_identity_update_before_update
BEFORE UPDATE OF comment_id, organization_id ON site_comments
FOR EACH ROW
EXECUTE FUNCTION reject_comment_ownership_identity_update();--> statement-breakpoint
CREATE FUNCTION validate_comment_has_ownership()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	IF NOT EXISTS (
		SELECT 1
		FROM work_item_comments
		WHERE comment_id = NEW.id
			AND organization_id = NEW.organization_id
	)
	AND NOT EXISTS (
		SELECT 1
		FROM site_comments
		WHERE comment_id = NEW.id
			AND organization_id = NEW.organization_id
	) THEN
		RAISE foreign_key_violation
			USING CONSTRAINT = 'comments_ownership_chk';
	END IF;

	RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE CONSTRAINT TRIGGER validate_comment_has_ownership_after_insert_update
AFTER INSERT OR UPDATE OF id, organization_id ON comments
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION validate_comment_has_ownership();--> statement-breakpoint
CREATE FUNCTION delete_comment_after_ownership_delete()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
	PERFORM 1
	FROM comments
	WHERE id = OLD.comment_id
		AND organization_id = OLD.organization_id
	FOR UPDATE;

	IF NOT FOUND THEN
		RETURN OLD;
	END IF;

	IF NOT EXISTS (
		SELECT 1
		FROM work_item_comments
		WHERE comment_id = OLD.comment_id
			AND organization_id = OLD.organization_id
	)
	AND NOT EXISTS (
		SELECT 1
		FROM site_comments
		WHERE comment_id = OLD.comment_id
			AND organization_id = OLD.organization_id
	) THEN
		DELETE FROM comments
		WHERE id = OLD.comment_id
			AND organization_id = OLD.organization_id;
	END IF;
	RETURN OLD;
END;
$$;--> statement-breakpoint
CREATE TRIGGER delete_comment_after_work_item_comment_delete
AFTER DELETE ON work_item_comments
FOR EACH ROW
EXECUTE FUNCTION delete_comment_after_ownership_delete();--> statement-breakpoint
CREATE TRIGGER delete_comment_after_site_comment_delete
AFTER DELETE ON site_comments
FOR EACH ROW
EXECUTE FUNCTION delete_comment_after_ownership_delete();--> statement-breakpoint
ALTER TABLE "work_item_comments" DROP COLUMN "author_user_id";--> statement-breakpoint
ALTER TABLE "work_item_comments" DROP COLUMN "body";
