import { InviteOrganizationMemberInputSchema } from "@ceird/identity-core";
import type { InviteOrganizationMemberInput } from "@ceird/identity-core";
import { Schema } from "effect";

export type OrganizationMemberInviteInput = InviteOrganizationMemberInput;

export const organizationMemberInviteSchema =
  InviteOrganizationMemberInputSchema;

export function decodeOrganizationMemberInviteInput(
  input: unknown
): OrganizationMemberInviteInput {
  return Schema.decodeUnknownSync(InviteOrganizationMemberInputSchema)(input);
}
