import type {
  IsoDateStringType,
  JobActivityEventType,
  OrganizationActivityQuery,
  UserIdType,
} from "@ceird/jobs-core";

export interface ActivitySearch {
  readonly actorUserId?: UserIdType | undefined;
  readonly eventType?: JobActivityEventType | undefined;
  readonly fromDate?: IsoDateStringType | undefined;
  readonly jobTitle?: string | undefined;
  readonly toDate?: IsoDateStringType | undefined;
}

const ACTIVITY_EVENT_TYPE_LOOKUP = {
  assignee_changed: true,
  blocked_reason_changed: true,
  contact_changed: true,
  coordinator_changed: true,
  cost_line_added: true,
  job_created: true,
  job_reopened: true,
  label_added: true,
  label_removed: true,
  priority_changed: true,
  site_changed: true,
  status_changed: true,
  visit_logged: true,
} as const satisfies Record<JobActivityEventType, true>;

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;

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

function decodeActivityActorUserId(value: unknown) {
  if (typeof value !== "string" || value.length === 0) {
    return;
  }

  return value as UserIdType;
}

export function decodeActivityEventType(value: unknown) {
  if (typeof value !== "string" || !isActivityEventType(value)) {
    return;
  }

  return value;
}

export function decodeActivityIsoDate(value: unknown) {
  if (typeof value !== "string" || !isIsoDateString(value)) {
    return;
  }

  return value as IsoDateStringType;
}

function decodeJobTitle(value: unknown) {
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

  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    !Number.isNaN(date.getTime()) &&
    date.getUTCFullYear() === year &&
    date.getUTCMonth() + 1 === month &&
    date.getUTCDate() === day
  );
}

function isActivityEventType(value: string): value is JobActivityEventType {
  return value in ACTIVITY_EVENT_TYPE_LOOKUP;
}
