ALTER TABLE "invitation" DROP CONSTRAINT IF EXISTS "invitation_role_chk";
DELETE FROM "invitation" WHERE "role" = 'owner';
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_role_chk" CHECK ("role" in ('admin', 'member', 'external'));
ALTER TABLE "invitation" DROP CONSTRAINT IF EXISTS "invitation_status_chk";
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_status_chk" CHECK ("status" in ('pending', 'accepted', 'canceled', 'rejected'));
