import {
  IsoDateString,
  JobActivityEventTypeSchema,
  UserId,
} from "@ceird/jobs-core";
import type {
  IsoDateStringType,
  JobActivityEventType,
  OrganizationActivityQuery,
  UserIdType,
} from "@ceird/jobs-core";
import { ParseResult } from "effect";

export interface ActivitySearch {
  readonly actorUserId?: UserIdType | undefined;
  readonly eventType?: JobActivityEventType | undefined;
  readonly fromDate?: IsoDateStringType | undefined;
  readonly jobTitle?: string | undefined;
  readonly toDate?: IsoDateStringType | undefined;
}

export function decodeActivitySearch(input: Record<string, unknown>) {
  return {
    actorUserId: decodeActivityActorUserId(input.actorUserId),
    eventType: decodeActivityEventType(input.eventType),
    fromDate: decodeActivityIsoDate(input.fromDate),
    jobTitle: decodeJobTitle(input.jobTitle),
    toDate: decodeActivityIsoDate(input.toDate),
  } satisfies ActivitySearch;
}

export function toOrganizationActivityQuery(
  search: ActivitySearch
): OrganizationActivityQuery {
  return {
    actorUserId: search.actorUserId,
    eventType: search.eventType,
    fromDate: search.fromDate,
    jobTitle: search.jobTitle,
    toDate: search.toDate,
  };
}

const decodeUserId = ParseResult.decodeUnknownSync(UserId);
const decodeEventType = ParseResult.decodeUnknownSync(
  JobActivityEventTypeSchema
);
const decodeIsoDate = ParseResult.decodeUnknownSync(IsoDateString);

export function decodeActivityActorUserId(value: unknown) {
  return decodeOptionalString(value, decodeUserId);
}

export function decodeActivityEventType(value: unknown) {
  return decodeOptionalString(value, decodeEventType);
}

export function decodeActivityIsoDate(value: unknown) {
  return decodeOptionalString(value, decodeIsoDate);
}

function decodeJobTitle(value: unknown) {
  if (typeof value !== "string") {
    return;
  }

  const trimmed = value.trim();

  return trimmed.length > 0 ? trimmed : undefined;
}

function decodeOptionalString<Value>(
  value: unknown,
  decode: (value: string) => Value
): Value | undefined {
  if (typeof value !== "string" || value.length === 0) {
    return;
  }

  try {
    return decode(value);
  } catch {
    return undefined;
  }
}
