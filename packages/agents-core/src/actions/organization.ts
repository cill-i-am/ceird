import { InvitableOrganizationRole } from "@ceird/identity-core";
import { Schema } from "effect";

import { defineAgentAction } from "../action-registry.js";

const OrganizationMemberInviteInputSchema = Schema.Struct({
  email: Schema.Trim.pipe(Schema.pattern(/^[^\s@]+@[^\s@]+\.[^\s@]+$/u)),
  role: InvitableOrganizationRole,
}).annotations({
  parseOptions: { onExcessProperty: "error" },
});

export type OrganizationMemberInviteInput = Schema.Schema.Type<
  typeof OrganizationMemberInviteInputSchema
>;

export const organizationAgentActions = [
  defineAgentAction({
    confirmationPolicy: "confirm",
    display: {
      label: "Invite member",
      summary: "Invite a teammate or external collaborator.",
      target: "organization",
    },
    inputSchema: OrganizationMemberInviteInputSchema,
    kind: "write",
    modelDescription:
      "Invite a person to the active Ceird organization with an invitable role.",
    modelName: "inviteOrganizationMember",
    name: "ceird.organization.members.invite",
  }),
] as const;
