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

export type CreateOrganizationInput = Schema.Schema.Type<
  typeof CreateOrganizationInputSchema
>;

export function decodeCreateOrganizationInput(
  input: unknown
): CreateOrganizationInput {
  return ParseResult.decodeUnknownSync(CreateOrganizationInputSchema)(input);
}
