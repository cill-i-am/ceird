import type {
  OrganizationInvitationStatus,
  OrganizationMember,
  OrganizationMemberId,
  OrganizationRole,
} from "@ceird/identity-core";

export type InvitationAction = "cancel" | "resend";
export type MemberAction =
  | { readonly memberId: OrganizationMemberId; readonly type: "remove" }
  | {
      readonly memberId: OrganizationMemberId;
      readonly role: OrganizationRole;
      readonly type: "role";
    };

const MEMBER_ROLE_LABELS = {
  admin: "Admin",
  external: "External",
  member: "Member",
  owner: "Owner",
} satisfies Record<OrganizationRole, string>;

const INVITATION_STATUS_LABELS = {
  accepted: "Accepted",
  canceled: "Canceled",
  pending: "Pending",
  rejected: "Rejected",
} satisfies Record<OrganizationInvitationStatus, string>;

export function formatOrganizationRoleLabel(role: OrganizationRole) {
  return MEMBER_ROLE_LABELS[role];
}

export function formatInvitationStatusLabel(
  status: OrganizationInvitationStatus
) {
  return INVITATION_STATUS_LABELS[status];
}

export function getMemberDisplayName(member: OrganizationMember) {
  return member.name;
}
