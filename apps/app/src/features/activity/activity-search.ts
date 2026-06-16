import type {
  ActivityEventStatus,
  ActivityEventTargetType,
  ActivityEventType,
} from "@ceird/activity-core";
import {
  ACTIVITY_EVENT_STATUSES,
  ACTIVITY_EVENT_TARGET_TYPES,
  ACTIVITY_EVENT_TYPES,
} from "@ceird/activity-core";

export interface ActivitySearch {
  readonly eventType?: ActivityEventType | undefined;
  readonly status?: ActivityEventStatus | undefined;
  readonly targetType?: ActivityEventTargetType | undefined;
}

const ACTIVITY_EVENT_TYPE_LOOKUP = new Set<string>(ACTIVITY_EVENT_TYPES);
const ACTIVITY_TARGET_TYPE_LOOKUP = new Set<string>(
  ACTIVITY_EVENT_TARGET_TYPES
);
const ACTIVITY_STATUS_LOOKUP = new Set<string>(ACTIVITY_EVENT_STATUSES);

export function decodeActivitySearch(input: Record<string, unknown>) {
  return {
    eventType: decodeActivityEventType(input.eventType),
    status: decodeActivityStatus(input.status),
    targetType: decodeActivityTargetType(input.targetType),
  } satisfies ActivitySearch;
}

export function decodeActivityEventType(value: unknown) {
  if (typeof value !== "string" || !isActivityEventType(value)) {
    return;
  }

  return value;
}

export function decodeActivityTargetType(value: unknown) {
  if (typeof value !== "string" || !isActivityTargetType(value)) {
    return;
  }

  return value;
}

export function decodeActivityStatus(value: unknown) {
  if (typeof value !== "string" || !isActivityStatus(value)) {
    return;
  }

  return value;
}

function isActivityEventType(value: string): value is ActivityEventType {
  return ACTIVITY_EVENT_TYPE_LOOKUP.has(value);
}

function isActivityTargetType(value: string): value is ActivityEventTargetType {
  return ACTIVITY_TARGET_TYPE_LOOKUP.has(value);
}

function isActivityStatus(value: string): value is ActivityEventStatus {
  return ACTIVITY_STATUS_LOOKUP.has(value);
}
