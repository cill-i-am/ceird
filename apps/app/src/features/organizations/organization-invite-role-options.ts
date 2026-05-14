import {
  INVITABLE_ORGANIZATION_ROLES,
  InvitableOrganizationRole,
} from "@ceird/identity-core";
import { Schema } from "effect";

import type { CommandSelectGroup } from "#/components/ui/command-select";

import type { OrganizationMemberInviteInput } from "./organization-member-invite-schemas";

export const INVITE_ROLE_LABELS = {
  admin: "Admin",
  external: "External collaborator",
  member: "Member",
} satisfies Record<OrganizationMemberInviteInput["role"], string>;

const INVITE_ROLE_DESCRIPTIONS = {
  admin: "Can manage members, settings, jobs, and sites.",
  external: "For subcontractors or partners with scoped access.",
  member: "For teammates working day to day in the workspace.",
} satisfies Record<OrganizationMemberInviteInput["role"], string>;

export const INVITE_ROLE_SELECTION_GROUPS = [
  {
    label: "Role",
    options: INVITABLE_ORGANIZATION_ROLES.map((role) => ({
      description: INVITE_ROLE_DESCRIPTIONS[role],
      label: INVITE_ROLE_LABELS[role],
      value: role,
    })),
  },
] satisfies readonly CommandSelectGroup[];

export const isInviteRole = Schema.is(InvitableOrganizationRole);
