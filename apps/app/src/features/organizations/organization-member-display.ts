import { OrganizationRole } from "@ceird/identity-core";
import type {
  InvitableOrganizationRole as InvitableOrganizationRoleType,
  IsoDateTimeString as IsoDateTimeStringType,
  OrganizationRole as OrganizationRoleType,
  UserId,
} from "@ceird/identity-core";
import { Schema } from "effect";

export interface InvitationSummary {
  readonly email: string;
  readonly expiresAt: IsoDateTimeStringType;
  readonly id: string;
  readonly role: InvitableOrganizationRoleType;
  readonly status: string;
}

export interface OrganizationMemberSummary {
  readonly email: string;
  readonly id: string;
  readonly name: string;
  readonly role: OrganizationRoleType;
  readonly userId: UserId;
}

export type InvitationAction = "cancel" | "resend";
export type MemberAction =
  | { readonly memberId: string; readonly type: "remove" }
  | {
      readonly memberId: string;
      readonly role: OrganizationRoleType;
      readonly type: "role";
    };

const MEMBER_ROLE_LABELS = {
  admin: "Admin",
  external: "External",
  member: "Member",
  owner: "Owner",
} satisfies Record<OrganizationRoleType, string>;

const isOrganizationRole = Schema.is(OrganizationRole);

export function formatRoleLabel(role: OrganizationRoleType | string) {
  if (isOrganizationRole(role)) {
    return MEMBER_ROLE_LABELS[role];
  }

  return role.charAt(0).toUpperCase() + role.slice(1);
}

export function getMemberDisplayName(member: OrganizationMemberSummary) {
  return member.name || member.email;
}
