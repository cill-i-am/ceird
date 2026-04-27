ALTER TABLE "member" ADD CONSTRAINT "member_role_chk" CHECK ("member"."role" in ('owner', 'admin', 'member'));--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_role_chk" CHECK ("invitation"."role" in ('owner', 'admin', 'member'));
