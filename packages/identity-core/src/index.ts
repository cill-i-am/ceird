import { ParseResult, Schema } from "effect";

export const ORGANIZATION_NAME_MIN_LENGTH = 2;
export const ORGANIZATION_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const DEFAULT_ORGANIZATION_SLUG_PREFIX = "team";
const ISO_DATE_TIME_UTC_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/;

function isIsoDateTimeString(value: string): boolean {
  return (
    ISO_DATE_TIME_UTC_PATTERN.test(value) && !Number.isNaN(Date.parse(value))
  );
}

export const OrganizationId = Schema.NonEmptyString.pipe(
  Schema.brand("@ceird/identity-core/OrganizationId")
);
export type OrganizationId = Schema.Schema.Type<typeof OrganizationId>;

export const UserId = Schema.NonEmptyString.pipe(
  Schema.brand("@ceird/identity-core/UserId")
);
export type UserId = Schema.Schema.Type<typeof UserId>;

export const SessionId = Schema.NonEmptyString.pipe(
  Schema.brand("@ceird/identity-core/SessionId")
);
export type SessionId = Schema.Schema.Type<typeof SessionId>;

export const InvitationId = Schema.NonEmptyString.pipe(
  Schema.brand("@ceird/identity-core/InvitationId")
);
export type InvitationId = Schema.Schema.Type<typeof InvitationId>;

export const IsoDateTimeString = Schema.String.pipe(
  Schema.filter((value) => isIsoDateTimeString(value)),
  Schema.annotations({
    description: "ISO-8601 UTC datetime string",
    message: () => "Expected an ISO-8601 UTC datetime string",
  })
);
export type IsoDateTimeString = Schema.Schema.Type<typeof IsoDateTimeString>;

export const ORGANIZATION_ROLES = [
  "owner",
  "admin",
  "member",
  "external",
] as const;
export const INTERNAL_ORGANIZATION_ROLES = [
  "owner",
  "admin",
  "member",
] as const;
export const ADMINISTRATIVE_ORGANIZATION_ROLES = ["owner", "admin"] as const;
export const INVITABLE_ORGANIZATION_ROLES = [
  "admin",
  "member",
  "external",
] as const;

export const OrganizationRole = Schema.Literal(...ORGANIZATION_ROLES);
export type OrganizationRole = Schema.Schema.Type<typeof OrganizationRole>;

export const AdministrativeOrganizationRole = Schema.Literal(
  ...ADMINISTRATIVE_ORGANIZATION_ROLES
);
export type AdministrativeOrganizationRole = Schema.Schema.Type<
  typeof AdministrativeOrganizationRole
>;

export const InternalOrganizationRole = Schema.Literal(
  ...INTERNAL_ORGANIZATION_ROLES
);
export type InternalOrganizationRole = Schema.Schema.Type<
  typeof InternalOrganizationRole
>;

export const InvitableOrganizationRole = Schema.Literal(
  ...INVITABLE_ORGANIZATION_ROLES
);
export type InvitableOrganizationRole = Schema.Schema.Type<
  typeof InvitableOrganizationRole
>;

export const OrganizationMemberRoleResponseSchema = Schema.Struct({
  role: OrganizationRole,
});
export type OrganizationMemberRoleResponse = Schema.Schema.Type<
  typeof OrganizationMemberRoleResponseSchema
>;

export const OrganizationSummarySchema = Schema.Struct({
  id: OrganizationId,
  name: Schema.String,
  slug: Schema.String,
});
export type OrganizationSummary = Schema.Schema.Type<
  typeof OrganizationSummarySchema
>;

export const OrganizationSummaryListSchema = Schema.Array(
  OrganizationSummarySchema
);
export type OrganizationSummaryList = Schema.Schema.Type<
  typeof OrganizationSummaryListSchema
>;

export const OrganizationNameSchema = Schema.Trim.pipe(
  Schema.minLength(ORGANIZATION_NAME_MIN_LENGTH)
);

export const OrganizationSlugSchema = Schema.Trim.pipe(
  Schema.minLength(2),
  Schema.pattern(ORGANIZATION_SLUG_PATTERN)
);

export function createOrganizationSlugFromName(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replaceAll(/['’]/g, "")
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/^-+|-+$/g, "")
    .slice(0, 64)
    .replaceAll(/^-+|-+$/g, "");

  return slug || DEFAULT_ORGANIZATION_SLUG_PREFIX;
}

export const CreateOrganizationInputSchema = Schema.Struct({
  name: OrganizationNameSchema,
  slug: OrganizationSlugSchema,
}).annotations({
  parseOptions: { onExcessProperty: "error" },
});

export const CreateOrganizationNameInputSchema = Schema.Struct({
  name: OrganizationNameSchema,
}).annotations({
  parseOptions: { onExcessProperty: "error" },
});

export const UpdateOrganizationInputSchema = Schema.Struct({
  name: OrganizationNameSchema,
}).annotations({
  parseOptions: { onExcessProperty: "error" },
});

export type CreateOrganizationInput = Schema.Schema.Type<
  typeof CreateOrganizationInputSchema
>;

export type CreateOrganizationNameInput = Schema.Schema.Type<
  typeof CreateOrganizationNameInputSchema
>;

export type UpdateOrganizationInput = Schema.Schema.Type<
  typeof UpdateOrganizationInputSchema
>;

export const PublicInvitationPreviewSchema = Schema.Struct({
  email: Schema.String,
  organizationName: Schema.String,
  role: OrganizationRole,
});

export type PublicInvitationPreview = Schema.Schema.Type<
  typeof PublicInvitationPreviewSchema
>;

export function decodeCreateOrganizationInput(
  input: unknown
): CreateOrganizationInput {
  return ParseResult.decodeUnknownSync(CreateOrganizationInputSchema)(input);
}

export function decodeCreateOrganizationNameInput(
  input: unknown
): CreateOrganizationNameInput {
  return ParseResult.decodeUnknownSync(CreateOrganizationNameInputSchema)(
    input
  );
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

export function decodeOrganizationId(input: unknown): OrganizationId {
  return ParseResult.decodeUnknownSync(OrganizationId)(input);
}

export function decodeUserId(input: unknown): UserId {
  return ParseResult.decodeUnknownSync(UserId)(input);
}

export function decodeSessionId(input: unknown): SessionId {
  return ParseResult.decodeUnknownSync(SessionId)(input);
}

export function decodeInvitationId(input: unknown): InvitationId {
  return ParseResult.decodeUnknownSync(InvitationId)(input);
}

export function decodeOrganizationRole(input: unknown): OrganizationRole {
  return ParseResult.decodeUnknownSync(OrganizationRole)(input);
}

const administrativeOrganizationRoleSet = new Set<OrganizationRole>(
  ADMINISTRATIVE_ORGANIZATION_ROLES
);
const internalOrganizationRoleSet = new Set<OrganizationRole>(
  INTERNAL_ORGANIZATION_ROLES
);

export function isAdministrativeOrganizationRole(
  role: OrganizationRole
): boolean {
  return administrativeOrganizationRoleSet.has(role);
}

export function isInternalOrganizationRole(
  role: OrganizationRole
): role is InternalOrganizationRole {
  return internalOrganizationRoleSet.has(role);
}

export function isExternalOrganizationRole(
  role: OrganizationRole
): role is "external" {
  return role === "external";
}

export function decodeOrganizationMemberRoleResponse(
  input: unknown
): OrganizationMemberRoleResponse {
  return ParseResult.decodeUnknownSync(OrganizationMemberRoleResponseSchema)(
    input
  );
}

export function decodeOrganizationSummary(input: unknown): OrganizationSummary {
  return ParseResult.decodeUnknownSync(OrganizationSummarySchema)(input);
}

export function decodeOrganizationSummaryList(
  input: unknown
): OrganizationSummaryList {
  return ParseResult.decodeUnknownSync(OrganizationSummaryListSchema)(input);
}
