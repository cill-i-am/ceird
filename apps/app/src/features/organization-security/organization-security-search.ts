import {
  decodeIsoDateString,
  decodeOrganizationSecurityActivityEventType as decodeActivityEventType,
  decodeOrganizationSecurityActivityQuery,
  decodeOrganizationSecurityActivityTargetType as decodeActivityTargetType,
} from "@ceird/identity-core";
import type {
  IsoDateString,
  OrganizationSecurityActivityCursor,
  OrganizationSecurityActivityQuery,
  OrganizationSecurityActivityEventType,
  OrganizationSecurityActivityTargetType,
  UserId,
} from "@ceird/identity-core";

export interface OrganizationSecurityActivitySearch {
  readonly actorUserId?: UserId | undefined;
  readonly cursor?: OrganizationSecurityActivityCursor | undefined;
  readonly eventType?: OrganizationSecurityActivityEventType | undefined;
  readonly fromDate?: IsoDateString | undefined;
  readonly limit?: number | undefined;
  readonly targetSearch?: string | undefined;
  readonly targetType?: OrganizationSecurityActivityTargetType | undefined;
  readonly toDate?: IsoDateString | undefined;
}

export function decodeOrganizationSecurityActivitySearch(
  input: Record<string, unknown>
) {
  return decodeOrganizationSecurityActivityQuery(
    input
  ) satisfies OrganizationSecurityActivityQuery;
}

export function toOrganizationSecurityActivityQuery(
  search: OrganizationSecurityActivitySearch
): OrganizationSecurityActivityQuery {
  return decodeOrganizationSecurityActivityQuery(search);
}

export function decodeOrganizationSecurityActivityEventType(value: unknown) {
  return value === "" ? undefined : decodeActivityEventType(value);
}

export function decodeOrganizationSecurityActivityTargetType(value: unknown) {
  return value === "" ? undefined : decodeActivityTargetType(value);
}

export function decodeIsoDate(value: unknown) {
  return value === "" ? undefined : decodeIsoDateString(value);
}

export function decodeOrganizationSecurityActivityTargetSearch(value: unknown) {
  if (typeof value !== "string" || value.trim().length === 0) {
    return;
  }

  return decodeOrganizationSecurityActivityQuery({
    targetSearch: value,
  }).targetSearch;
}
