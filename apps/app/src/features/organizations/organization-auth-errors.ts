import { Schema } from "effect";

const EMAIL_NOT_VERIFIED_CODE = "EMAIL_NOT_VERIFIED";
const EMAIL_NOT_VERIFIED_NEEDLES = [
  EMAIL_NOT_VERIFIED_CODE.toLowerCase(),
  "email not verified",
  "verify your email before creating",
  "verify your email before inviting",
] as const;
const CREATE_ORGANIZATION_LIMIT_NEEDLES = [
  "YOU_HAVE_REACHED_THE_MAXIMUM_NUMBER_OF_ORGANIZATIONS".toLowerCase(),
  "maximum number of organizations",
  "team limit",
] as const;
const INVITE_MEMBER_PENDING_LIMIT_NEEDLES = [
  "INVITATION_LIMIT_REACHED".toLowerCase(),
  "invitation limit reached",
  "pending invitation limit",
] as const;
const INVITE_MEMBER_MEMBERSHIP_LIMIT_NEEDLES = [
  "ORGANIZATION_MEMBERSHIP_LIMIT_REACHED".toLowerCase(),
  "TEAM_MEMBER_LIMIT_REACHED".toLowerCase(),
  "organization membership limit reached",
  "team member limit reached",
] as const;
const RATE_LIMIT_NEEDLES = [
  "too many requests",
  "too many invitations",
  "rate limit",
] as const;
const OrganizationAuthErrorPayload = Schema.Struct({
  code: Schema.optional(Schema.String),
  message: Schema.optional(Schema.String),
  status: Schema.optional(Schema.Number),
  statusText: Schema.optional(Schema.String),
});
const isOrganizationAuthErrorPayload = Schema.is(OrganizationAuthErrorPayload);

export const CREATE_ORGANIZATION_EMAIL_NOT_VERIFIED_MESSAGE =
  "Verify your email before creating a team. Check your inbox, then try again.";
export const INVITE_MEMBER_EMAIL_NOT_VERIFIED_MESSAGE =
  "Verify your email before inviting teammates. Check your inbox, then try again.";
export const CREATE_ORGANIZATION_LIMIT_REACHED_MESSAGE =
  "You've reached the 10-team limit for this account.";
export const INVITE_MEMBER_PENDING_LIMIT_REACHED_MESSAGE =
  "This team has reached the 100 pending-invitation limit. Cancel an unused invitation before sending another.";
export const INVITE_MEMBER_MEMBERSHIP_LIMIT_REACHED_MESSAGE =
  "This team has reached the 200-member limit. Remove a member before adding someone new.";
export const INVITE_MEMBER_RATE_LIMIT_REACHED_MESSAGE =
  "Too many invitations have been sent recently. Please wait a bit and try again.";

export function getCreateOrganizationFailureMessage(
  error: unknown,
  fallbackMessage: string
): string {
  return (
    getCreateOrganizationEmailVerificationFailureMessage(error) ??
    getCreateOrganizationLimitFailureMessage(error) ??
    fallbackMessage
  );
}

export function getAcceptInvitationFailureMessage(
  error: unknown,
  fallbackMessage: string
): string {
  return (
    getCreateOrganizationLimitFailureMessage(error) ??
    (isInviteMemberMembershipLimitReached(error)
      ? INVITE_MEMBER_MEMBERSHIP_LIMIT_REACHED_MESSAGE
      : null) ??
    fallbackMessage
  );
}

export function getInviteMemberFailureMessage(
  error: unknown,
  fallbackMessage: string
): string {
  if (isEmailNotVerifiedOrganizationAuthError(error)) {
    return INVITE_MEMBER_EMAIL_NOT_VERIFIED_MESSAGE;
  }

  if (isInviteMemberPendingLimitReached(error)) {
    return INVITE_MEMBER_PENDING_LIMIT_REACHED_MESSAGE;
  }

  if (isInviteMemberMembershipLimitReached(error)) {
    return INVITE_MEMBER_MEMBERSHIP_LIMIT_REACHED_MESSAGE;
  }

  if (isOrganizationAuthRateLimitReached(error)) {
    return INVITE_MEMBER_RATE_LIMIT_REACHED_MESSAGE;
  }

  return fallbackMessage;
}

export function getCreateOrganizationEmailVerificationFailureMessage(
  error: unknown
): string | null {
  return isEmailNotVerifiedOrganizationAuthError(error)
    ? CREATE_ORGANIZATION_EMAIL_NOT_VERIFIED_MESSAGE
    : null;
}

function getCreateOrganizationLimitFailureMessage(error: unknown) {
  return readOrganizationAuthErrorFields(error).some((field) =>
    fieldMatchesNeedle(field, CREATE_ORGANIZATION_LIMIT_NEEDLES)
  )
    ? CREATE_ORGANIZATION_LIMIT_REACHED_MESSAGE
    : null;
}

function isEmailNotVerifiedOrganizationAuthError(error: unknown): boolean {
  return readOrganizationAuthErrorFields(error).some((field) =>
    fieldMatchesNeedle(field, EMAIL_NOT_VERIFIED_NEEDLES)
  );
}

function isInviteMemberPendingLimitReached(error: unknown) {
  return readOrganizationAuthErrorFields(error).some((field) =>
    fieldMatchesNeedle(field, INVITE_MEMBER_PENDING_LIMIT_NEEDLES)
  );
}

function isInviteMemberMembershipLimitReached(error: unknown) {
  return readOrganizationAuthErrorFields(error).some((field) =>
    fieldMatchesNeedle(field, INVITE_MEMBER_MEMBERSHIP_LIMIT_NEEDLES)
  );
}

function isOrganizationAuthRateLimitReached(error: unknown) {
  const payload = readOrganizationAuthErrorPayload(error);

  if (payload?.status === 429) {
    return true;
  }

  return readOrganizationAuthErrorFields(error).some((field) =>
    fieldMatchesNeedle(field, RATE_LIMIT_NEEDLES)
  );
}

function fieldMatchesNeedle(
  field: string,
  needles: readonly string[]
): boolean {
  const normalized = field.toLowerCase();
  return needles.some((needle) => normalized.includes(needle));
}

function readOrganizationAuthErrorPayload(error: unknown) {
  return isOrganizationAuthErrorPayload(error) ? error : null;
}

function readOrganizationAuthErrorFields(error: unknown): string[] {
  if (typeof error === "string") {
    return [error];
  }

  if (error instanceof Error) {
    return [error.message];
  }

  const payload = readOrganizationAuthErrorPayload(error);

  if (payload === null) {
    return [];
  }

  return [payload.code, payload.message, payload.statusText].filter(
    (value): value is string => typeof value === "string" && value.length > 0
  );
}
