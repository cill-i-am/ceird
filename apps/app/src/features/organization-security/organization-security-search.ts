import {
  decodeOptionalIsoDateString,
  decodeOptionalOrganizationSecurityActivityCursor,
  decodeOptionalOrganizationSecurityActivityEventType,
  decodeOptionalOrganizationSecurityActivityTargetType,
  decodeOptionalUserId,
} from "@ceird/identity-core";
import type {
  IsoDateString,
  OrganizationSecurityActivityCursor,
  OrganizationSecurityActivityEventType,
  OrganizationSecurityActivityQueryInput,
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
): OrganizationSecurityActivityQueryInput {
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
  return decodeOptionalOrganizationSecurityActivityCursor(value);
}

function decodeActorUserId(value: unknown) {
  return decodeOptionalUserId(value);
}

export function decodeOrganizationSecurityActivityEventType(value: unknown) {
  return decodeOptionalOrganizationSecurityActivityEventType(value);
}

export function decodeOrganizationSecurityActivityTargetType(value: unknown) {
  return decodeOptionalOrganizationSecurityActivityTargetType(value);
}

export function decodeIsoDate(value: unknown) {
  return decodeOptionalIsoDateString(value);
}

function decodeTargetSearch(value: unknown) {
  if (typeof value !== "string") {
    return;
  }

  const trimmed = value.trim();

  return trimmed.length > 0 ? trimmed : undefined;
}
