import {
  ORGANIZATION_SECURITY_ACTIVITY_EVENT_TYPES,
  ORGANIZATION_SECURITY_ACTIVITY_TARGET_TYPES,
} from "@ceird/identity-core";
import type {
  IsoDateString,
  OrganizationSecurityActivityCursor,
  OrganizationSecurityActivityEventType,
  OrganizationSecurityActivityQuery,
  OrganizationSecurityActivityTargetType,
  UserId,
} from "@ceird/identity-core";

export interface OrganizationSecurityActivitySearch {
  readonly actorUserId?: UserId | undefined;
  readonly cursor?: OrganizationSecurityActivityCursor | undefined;
  readonly eventType?: OrganizationSecurityActivityEventType | undefined;
  readonly fromDate?: IsoDateString | undefined;
  readonly targetSearch?: string | undefined;
  readonly targetType?: OrganizationSecurityActivityTargetType | undefined;
  readonly toDate?: IsoDateString | undefined;
}

const ORGANIZATION_SECURITY_ACTIVITY_EVENT_TYPE_LOOKUP = new Set<string>(
  ORGANIZATION_SECURITY_ACTIVITY_EVENT_TYPES
);

const ORGANIZATION_SECURITY_ACTIVITY_TARGET_TYPE_LOOKUP = new Set<string>(
  ORGANIZATION_SECURITY_ACTIVITY_TARGET_TYPES
);

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;

export function decodeOrganizationSecurityActivitySearch(
  input: Record<string, unknown>
) {
  return {
    actorUserId: decodeActorUserId(input.actorUserId),
    cursor: decodeCursor(input.cursor),
    eventType: decodeOrganizationSecurityActivityEventType(input.eventType),
    fromDate: decodeIsoDate(input.fromDate),
    targetSearch: decodeTargetSearch(input.targetSearch),
    targetType: decodeOrganizationSecurityActivityTargetType(input.targetType),
    toDate: decodeIsoDate(input.toDate),
  } satisfies OrganizationSecurityActivitySearch;
}

export function toOrganizationSecurityActivityQuery(
  search: OrganizationSecurityActivitySearch
): OrganizationSecurityActivityQuery {
  return {
    actorUserId: search.actorUserId,
    cursor: search.cursor,
    eventType: search.eventType,
    fromDate: search.fromDate,
    targetSearch: search.targetSearch,
    targetType: search.targetType,
    toDate: search.toDate,
  };
}

function decodeCursor(value: unknown) {
  if (typeof value !== "string" || value.length === 0) {
    return;
  }

  return value as OrganizationSecurityActivityCursor;
}

function decodeActorUserId(value: unknown) {
  if (typeof value !== "string" || value.length === 0) {
    return;
  }

  return value as UserId;
}

export function decodeOrganizationSecurityActivityEventType(value: unknown) {
  if (
    typeof value !== "string" ||
    !ORGANIZATION_SECURITY_ACTIVITY_EVENT_TYPE_LOOKUP.has(value)
  ) {
    return;
  }

  return value as OrganizationSecurityActivityEventType;
}

export function decodeOrganizationSecurityActivityTargetType(value: unknown) {
  if (
    typeof value !== "string" ||
    !ORGANIZATION_SECURITY_ACTIVITY_TARGET_TYPE_LOOKUP.has(value)
  ) {
    return;
  }

  return value as OrganizationSecurityActivityTargetType;
}

export function decodeIsoDate(value: unknown) {
  if (typeof value !== "string" || !isIsoDateString(value)) {
    return;
  }

  return value as IsoDateString;
}

function decodeTargetSearch(value: unknown) {
  if (typeof value !== "string") {
    return;
  }

  const trimmed = value.trim();

  return trimmed.length > 0 ? trimmed : undefined;
}

function isIsoDateString(value: string): boolean {
  if (!ISO_DATE_PATTERN.test(value)) {
    return false;
  }

  const segments = value.split("-");
  const year = Number(segments[0]);
  const month = Number(segments[1]);
  const day = Number(segments[2]);
  if (
    segments.length !== 3 ||
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day)
  ) {
    return false;
  }

  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    !Number.isNaN(date.getTime()) &&
    date.getUTCFullYear() === year &&
    date.getUTCMonth() + 1 === month &&
    date.getUTCDate() === day
  );
}
