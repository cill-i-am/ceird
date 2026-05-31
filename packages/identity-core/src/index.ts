import { Schema } from "effect";

export const ORGANIZATION_NAME_MIN_LENGTH = 2;
export const ORGANIZATION_SLUG_MAX_LENGTH = 40;
export const ORGANIZATION_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const DEFAULT_ORGANIZATION_SLUG_PREFIX = "team";
export const RESERVED_ORGANIZATION_SLUGS = [
  "app",
  "api",
  "agent",
  "mcp",
  "sync",
] as const;
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
  Schema.refine((value): value is string => isIsoDateTimeString(value), {
    message: "Expected an ISO-8601 UTC datetime string",
  }),
  Schema.annotate({
    description: "ISO-8601 UTC datetime string",
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

export const OrganizationRole = Schema.Literals(ORGANIZATION_ROLES);
export type OrganizationRole = Schema.Schema.Type<typeof OrganizationRole>;

export const AdministrativeOrganizationRole = Schema.Literals(
  ADMINISTRATIVE_ORGANIZATION_ROLES
);
export type AdministrativeOrganizationRole = Schema.Schema.Type<
  typeof AdministrativeOrganizationRole
>;

export const InternalOrganizationRole = Schema.Literals(
  INTERNAL_ORGANIZATION_ROLES
);
export type InternalOrganizationRole = Schema.Schema.Type<
  typeof InternalOrganizationRole
>;

export const InvitableOrganizationRole = Schema.Literals(
  INVITABLE_ORGANIZATION_ROLES
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

export const OrganizationNameSchema = Schema.Trim.pipe(
  Schema.check(Schema.isMinLength(ORGANIZATION_NAME_MIN_LENGTH))
);

export const OrganizationSlugSchema = Schema.Trim.pipe(
  Schema.check(
    Schema.isMinLength(2),
    Schema.isMaxLength(ORGANIZATION_SLUG_MAX_LENGTH),
    Schema.isPattern(ORGANIZATION_SLUG_PATTERN)
  ),
  Schema.refine(
    (value): value is string => !isReservedOrganizationSlug(value),
    {
      message: "Organization slug is reserved for a system host",
    }
  )
);
export type OrganizationSlug = Schema.Schema.Type<
  typeof OrganizationSlugSchema
>;

const isOrganizationSlugValue = Schema.is(OrganizationSlugSchema);

export function isOrganizationSlug(value: unknown): value is OrganizationSlug {
  return isOrganizationSlugValue(value);
}

export function decodeOrganizationSlug(input: unknown): OrganizationSlug {
  return Schema.decodeUnknownSync(OrganizationSlugSchema)(input);
}

export function isReservedOrganizationSlug(value: string): boolean {
  return (RESERVED_ORGANIZATION_SLUGS as readonly string[]).includes(value);
}

function avoidReservedOrganizationSlug(slug: string): string {
  if (!isReservedOrganizationSlug(slug)) {
    return slug;
  }

  return `${slug}-org`;
}

function createRawOrganizationSlugFromName(name: string): string {
  return (
    name
      .trim()
      .toLowerCase()
      .replaceAll(/['’]/g, "")
      .replaceAll(/[^a-z0-9]+/g, "-")
      .replaceAll(/^-+|-+$/g, "")
      .slice(0, ORGANIZATION_SLUG_MAX_LENGTH)
      .replaceAll(/^-+|-+$/g, "") || DEFAULT_ORGANIZATION_SLUG_PREFIX
  );
}

export function createOrganizationSlugFromName(name: string): string {
  return avoidReservedOrganizationSlug(createRawOrganizationSlugFromName(name));
}

export function appendOrganizationSlugSuffix(
  baseSlug: string,
  suffix: string
): string {
  const suffixSlug = createRawOrganizationSlugFromName(suffix)
    .slice(0, ORGANIZATION_SLUG_MAX_LENGTH - 2)
    .replaceAll(/^-+|-+$/g, "");
  const baseMaxLength = ORGANIZATION_SLUG_MAX_LENGTH - suffixSlug.length - 1;
  const truncatedBaseSlug = createRawOrganizationSlugFromName(baseSlug)
    .slice(0, baseMaxLength)
    .replaceAll(/-+$/g, "");

  return avoidReservedOrganizationSlug(`${truncatedBaseSlug}-${suffixSlug}`);
}

export const OrganizationSummarySchema = Schema.Struct({
  id: OrganizationId,
  name: Schema.String,
  slug: OrganizationSlugSchema,
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

export const CreateOrganizationInputSchema = Schema.Struct({
  name: OrganizationNameSchema,
  slug: OrganizationSlugSchema,
}).annotate({
  parseOptions: { onExcessProperty: "error" },
});

export const CreateOrganizationNameInputSchema = Schema.Struct({
  name: OrganizationNameSchema,
}).annotate({
  parseOptions: { onExcessProperty: "error" },
});

export const UpdateOrganizationInputSchema = Schema.Struct({
  name: OrganizationNameSchema,
}).annotate({
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
  return Schema.decodeUnknownSync(CreateOrganizationInputSchema)(input);
}

export function decodeCreateOrganizationNameInput(
  input: unknown
): CreateOrganizationNameInput {
  return Schema.decodeUnknownSync(CreateOrganizationNameInputSchema)(input);
}

export function decodeUpdateOrganizationInput(
  input: unknown
): UpdateOrganizationInput {
  return Schema.decodeUnknownSync(UpdateOrganizationInputSchema)(input);
}

export function decodePublicInvitationPreview(
  input: unknown
): PublicInvitationPreview {
  return Schema.decodeUnknownSync(PublicInvitationPreviewSchema)(input);
}

export function decodeOrganizationId(input: unknown): OrganizationId {
  return Schema.decodeUnknownSync(OrganizationId)(input);
}

export function decodeUserId(input: unknown): UserId {
  return Schema.decodeUnknownSync(UserId)(input);
}

export function decodeSessionId(input: unknown): SessionId {
  return Schema.decodeUnknownSync(SessionId)(input);
}

export function decodeInvitationId(input: unknown): InvitationId {
  return Schema.decodeUnknownSync(InvitationId)(input);
}

export function decodeOrganizationRole(input: unknown): OrganizationRole {
  return Schema.decodeUnknownSync(OrganizationRole)(input);
}

const administrativeOrganizationRoleSet = new Set<OrganizationRole>(
  ADMINISTRATIVE_ORGANIZATION_ROLES
);
const internalOrganizationRoleSet = new Set<OrganizationRole>(
  INTERNAL_ORGANIZATION_ROLES
);

export function isAdministrativeOrganizationRole(
  role: OrganizationRole
): role is AdministrativeOrganizationRole {
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
  return Schema.decodeUnknownSync(OrganizationMemberRoleResponseSchema)(input);
}

export function decodeOrganizationSummary(input: unknown): OrganizationSummary {
  return Schema.decodeUnknownSync(OrganizationSummarySchema)(input);
}

export function decodeOrganizationSummaryList(
  input: unknown
): OrganizationSummaryList {
  return Schema.decodeUnknownSync(OrganizationSummaryListSchema)(input);
}
