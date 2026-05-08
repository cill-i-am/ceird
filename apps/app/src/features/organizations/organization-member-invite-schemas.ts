import { InvitableOrganizationRole } from "@ceird/identity-core";
import { ParseResult, Schema } from "effect";

import { accountEmailSchema } from "#/features/auth/auth-schemas";

const OrganizationMemberInviteInputSchema = Schema.Struct({
  email: accountEmailSchema,
  role: InvitableOrganizationRole,
});

export type OrganizationMemberInviteInput =
  typeof OrganizationMemberInviteInputSchema.Type;

export const organizationMemberInviteSchema =
  OrganizationMemberInviteInputSchema;

export function decodeOrganizationMemberInviteInput(
  input: unknown
): OrganizationMemberInviteInput {
  return ParseResult.decodeUnknownSync(OrganizationMemberInviteInputSchema)(
    input
  );
}
