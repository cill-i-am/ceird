import type {
  IsoDateStringType,
  JobActivityEventType,
  OrganizationActivityQuery,
  UserIdType,
} from "@task-tracker/jobs-core";
import {
  IsoDateString,
  JOB_ACTIVITY_EVENT_TYPES,
  UserId,
} from "@task-tracker/jobs-core";
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
    actorUserId: decodeUserId(input.actorUserId),
    eventType: decodeEventType(input.eventType),
    fromDate: decodeIsoDate(input.fromDate),
    jobTitle: decodeJobTitle(input.jobTitle),
    toDate: decodeIsoDate(input.toDate),
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

function decodeUserId(value: unknown) {
  if (typeof value !== "string") {
    return;
  }

  try {
    return ParseResult.decodeUnknownSync(UserId)(value);
  } catch {
    return;
  }
}

function decodeEventType(value: unknown) {
  if (typeof value !== "string") {
    return;
  }

  return JOB_ACTIVITY_EVENT_TYPES.includes(value as JobActivityEventType)
    ? (value as JobActivityEventType)
    : undefined;
}

function decodeIsoDate(value: unknown) {
  if (typeof value !== "string") {
    return;
  }

  try {
    return ParseResult.decodeUnknownSync(IsoDateString)(value);
  } catch {
    return;
  }
}

function decodeJobTitle(value: unknown) {
  if (typeof value !== "string") {
    return;
  }

  const trimmed = value.trim();

  return trimmed.length > 0 ? trimmed : undefined;
}
