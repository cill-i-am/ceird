import { InviteOrganizationMemberInputSchema } from "@ceird/identity-core";
import type {
  InviteOrganizationMemberInput,
  InvitableOrganizationRole,
} from "@ceird/identity-core";
import { Schema } from "effect";

export interface OrganizationMemberInviteDraft {
  readonly email: string;
  readonly role: InvitableOrganizationRole;
}

export type OrganizationMemberInviteInput = InviteOrganizationMemberInput;

export const organizationMemberInviteSchema =
  InviteOrganizationMemberInputSchema;

export function decodeOrganizationMemberInviteInput(
  input: unknown
): OrganizationMemberInviteInput {
  return Schema.decodeUnknownSync(InviteOrganizationMemberInputSchema)(input);
}
