import { ParseResult, Schema } from "effect";

import { accountEmailSchema } from "#/features/auth/auth-schemas";

const InviteRole = Schema.Literal("admin", "member");

const OrganizationMemberInviteInput = Schema.Struct({
  email: accountEmailSchema,
  role: InviteRole,
});

export type OrganizationMemberInviteInput =
  typeof OrganizationMemberInviteInput.Type;

export const organizationMemberInviteSchema = OrganizationMemberInviteInput;

export function decodeOrganizationMemberInviteInput(
  input: unknown
): OrganizationMemberInviteInput {
  return ParseResult.decodeUnknownSync(OrganizationMemberInviteInput)(input);
}
