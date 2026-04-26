import { ParseResult, Schema } from "effect";

export const ORGANIZATION_NAME_MIN_LENGTH = 2;
export const ORGANIZATION_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const OrganizationNameSchema = Schema.Trim.pipe(
  Schema.minLength(ORGANIZATION_NAME_MIN_LENGTH)
);

export const OrganizationSlugSchema = Schema.Trim.pipe(
  Schema.minLength(2),
  Schema.pattern(ORGANIZATION_SLUG_PATTERN)
);

export const CreateOrganizationInputSchema = Schema.Struct({
  name: OrganizationNameSchema,
  slug: OrganizationSlugSchema,
});

export const UpdateOrganizationInputSchema = Schema.Struct({
  name: OrganizationNameSchema,
});

export type CreateOrganizationInput = Schema.Schema.Type<
  typeof CreateOrganizationInputSchema
>;

export type UpdateOrganizationInput = Schema.Schema.Type<
  typeof UpdateOrganizationInputSchema
>;

export const PublicInvitationPreviewSchema = Schema.Struct({
  email: Schema.String,
  organizationName: Schema.String,
  role: Schema.String,
});

export type PublicInvitationPreview = Schema.Schema.Type<
  typeof PublicInvitationPreviewSchema
>;

export function decodeCreateOrganizationInput(
  input: unknown
): CreateOrganizationInput {
  return ParseResult.decodeUnknownSync(CreateOrganizationInputSchema)(input);
}

export function decodeUpdateOrganizationInput(
  input: unknown
): UpdateOrganizationInput {
  return ParseResult.decodeUnknownSync(UpdateOrganizationInputSchema)(input);
}

export function decodePublicInvitationPreview(
  input: unknown
): PublicInvitationPreview {
  return ParseResult.decodeUnknownSync(PublicInvitationPreviewSchema)(input);
}
