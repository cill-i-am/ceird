import { InvitableOrganizationRole } from "@ceird/identity-core";
import { ParseResult, Schema } from "effect";

import { accountEmailSchema } from "#/features/auth/auth-schemas";

const OrganizationMemberInviteInput = Schema.Struct({
  email: accountEmailSchema,
  role: InvitableOrganizationRole,
});

export type OrganizationMemberInviteInput =
  typeof OrganizationMemberInviteInput.Type;

export const organizationMemberInviteSchema = OrganizationMemberInviteInput;

export function decodeOrganizationMemberInviteInput(
  input: unknown
): OrganizationMemberInviteInput {
  return ParseResult.decodeUnknownSync(OrganizationMemberInviteInput)(input);
}
