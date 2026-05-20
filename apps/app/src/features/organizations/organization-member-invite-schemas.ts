import { InvitableOrganizationRole } from "@ceird/identity-core";
import { Schema } from "effect";

import { accountEmailSchema } from "#/features/auth/auth-schemas";

const OrganizationMemberInviteInputSchema = Schema.Struct({
  email: accountEmailSchema,
  role: InvitableOrganizationRole,
}).annotate({
  parseOptions: { onExcessProperty: "error" },
});

export type OrganizationMemberInviteInput =
  typeof OrganizationMemberInviteInputSchema.Type;

export const organizationMemberInviteSchema =
  OrganizationMemberInviteInputSchema;

export function decodeOrganizationMemberInviteInput(
  input: unknown
): OrganizationMemberInviteInput {
  return Schema.decodeUnknownSync(OrganizationMemberInviteInputSchema)(input);
}
