ALTER TABLE "invitation" DROP CONSTRAINT "invitation_role_chk";--> statement-breakpoint
ALTER TABLE "member" DROP CONSTRAINT "member_role_chk";--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_role_chk" CHECK ("invitation"."role" in ('owner', 'admin', 'member', 'external'));--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_role_chk" CHECK ("member"."role" in ('owner', 'admin', 'member', 'external'));
