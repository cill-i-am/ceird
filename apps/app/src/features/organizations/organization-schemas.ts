import { ParseResult, Schema } from "effect";

const OrganizationName = Schema.Trim.pipe(Schema.minLength(2));

const OrganizationSlug = Schema.Trim.pipe(
  Schema.minLength(2),
  Schema.pattern(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
);

const CreateOrganizationInput = Schema.Struct({
  name: OrganizationName,
  slug: OrganizationSlug,
});

export type CreateOrganizationInput = typeof CreateOrganizationInput.Type;

export const organizationOnboardingSchema = CreateOrganizationInput;

export function decodeCreateOrganizationInput(
  input: unknown
): CreateOrganizationInput {
  return ParseResult.decodeUnknownSync(CreateOrganizationInput)(input);
}
