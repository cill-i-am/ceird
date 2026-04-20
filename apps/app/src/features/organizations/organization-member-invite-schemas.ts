import { ParseResult, Schema } from "effect";

const Email = Schema.Trim.pipe(
  Schema.nonEmptyString(),
  Schema.pattern(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)
);

const InviteRole = Schema.Literal("admin", "member");

const OrganizationMemberInviteInput = Schema.Struct({
  email: Email,
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
