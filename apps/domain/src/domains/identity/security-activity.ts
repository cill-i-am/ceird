/* oxlint-disable eslint/max-classes-per-file */
import {
  ORGANIZATION_SECURITY_ACTIVITY_EVENT_TYPES,
  OrganizationRole,
  OrganizationSecurityActivityAccessDeniedError,
  OrganizationSecurityActivityCursor as OrganizationSecurityActivityCursorSchema,
  OrganizationSecurityActivityCursorInvalidError,
  OrganizationSecurityActivityEventType as OrganizationSecurityActivityEventTypeSchema,
  OrganizationSecurityActivityItemSchema,
  OrganizationSecurityActivityListResponseSchema,
  OrganizationSecurityActivityStorageError,
  UserId,
} from "@ceird/identity-core";
import type {
  OrganizationId as OrganizationIdType,
  OrganizationRole as OrganizationRoleType,
  OrganizationSecurityActivityCursor,
  OrganizationSecurityActivityEventId,
  OrganizationSecurityActivityEventType,
  OrganizationSecurityActivityItem,
  OrganizationSecurityActivityQuery,
  OrganizationSecurityActivityTargetType,
} from "@ceird/identity-core";
import {
  Array as Arr,
  Context,
  Effect,
  Layer,
  Match,
  Schema,
  pipe,
} from "effect";
import { SqlClient } from "effect/unstable/sql";
import type { SqlError } from "effect/unstable/sql";

import { decodeJsonCursor, encodeJsonCursor } from "../json-cursor.js";
import { OrganizationAuthorization } from "../organizations/authorization.js";
import { CurrentOrganizationActor } from "../organizations/current-actor.js";
import {
  ORGANIZATION_ACTIVE_ORGANIZATION_REQUIRED_ERROR_TAG,
  ORGANIZATION_ACTOR_MEMBERSHIP_NOT_FOUND_ERROR_TAG,
  ORGANIZATION_ACTOR_STORAGE_ERROR_TAG,
  ORGANIZATION_AUTHORIZATION_DENIED_ERROR_TAG,
  ORGANIZATION_ROLE_NOT_SUPPORTED_ERROR_TAG,
  ORGANIZATION_SESSION_IDENTITY_INVALID_ERROR_TAG,
  ORGANIZATION_SESSION_REQUIRED_ERROR_TAG,
} from "../organizations/errors.js";
import type {
  OrganizationActiveOrganizationRequiredError,
  OrganizationActorMembershipNotFoundError,
  OrganizationActorStorageError,
  OrganizationAuthorizationDeniedError,
  OrganizationRoleNotSupportedError,
  OrganizationSessionIdentityInvalidError,
  OrganizationSessionRequiredError,
} from "../organizations/errors.js";

const DEFAULT_SECURITY_ACTIVITY_LIMIT = 50;
const MAX_SECURITY_ACTIVITY_LIMIT = 100;
const ORGANIZATION_SECURITY_ACTIVITY_VISIBLE_EVENT_TYPES =
  ORGANIZATION_SECURITY_ACTIVITY_EVENT_TYPES;

const decodeSecurityActivityItem = Schema.decodeUnknownSync(
  OrganizationSecurityActivityItemSchema
);
const decodeSecurityActivityListResponse = Schema.decodeUnknownSync(
  OrganizationSecurityActivityListResponseSchema
);
const decodeSecurityActivityCursor = Schema.decodeUnknownSync(
  OrganizationSecurityActivityCursorSchema
);
const decodeSecurityActivityEventType = Schema.decodeUnknownSync(
  OrganizationSecurityActivityEventTypeSchema
);
const SecurityActivityCursorTimestamp = Schema.String.pipe(
  Schema.refine((value): value is string => isUtcMicrosecondTimestamp(value), {
    message: "Expected a UTC timestamp cursor",
  })
);
const decodeSecurityActivityCursorState = Schema.decodeUnknownSync(
  Schema.Struct({
    createdAt: SecurityActivityCursorTimestamp,
    id: Schema.NonEmptyString,
  })
);
const isOrganizationRole = Schema.is(OrganizationRole);
const isUserId = Schema.is(UserId);

interface OrganizationSecurityActivityRow {
  readonly actor_email: string | null;
  readonly actor_name: string | null;
  readonly actor_user_id: string | null;
  readonly created_at: Date;
  readonly created_at_cursor: string;
  readonly event_type: string;
  readonly id: string;
  readonly metadata: unknown;
  readonly organization_id: string;
  readonly organization_name: string | null;
  readonly target_email: string | null;
  readonly target_member_id: string | null;
  readonly target_name: string | null;
  readonly target_user_id: string | null;
}

interface OrganizationSecurityActivityCursorState {
  readonly createdAt: string;
  readonly id: string;
}

type ActorResolutionError =
  | OrganizationActiveOrganizationRequiredError
  | OrganizationActorMembershipNotFoundError
  | OrganizationActorStorageError
  | OrganizationRoleNotSupportedError
  | OrganizationSessionIdentityInvalidError
  | OrganizationSessionRequiredError;

export class OrganizationSecurityActivityRepository extends Context.Service<OrganizationSecurityActivityRepository>()(
  "@ceird/domains/identity/OrganizationSecurityActivityRepository",
  {
    make: Effect.gen(function* OrganizationSecurityActivityRepositoryLive() {
      const sql = yield* SqlClient.SqlClient;

      const list = Effect.fn("OrganizationSecurityActivityRepository.list")(
        function* (
          organizationId: OrganizationIdType,
          query: OrganizationSecurityActivityQuery
        ) {
          const limit = clampSecurityActivityLimit(
            query.limit ?? DEFAULT_SECURITY_ACTIVITY_LIMIT
          );
          const clauses = [
            sql`auth_security_audit_event.organization_id = ${organizationId}`,
            sql`auth_security_audit_event.event_type in ${sql.in(
              ORGANIZATION_SECURITY_ACTIVITY_VISIBLE_EVENT_TYPES
            )}`,
          ];

          if (query.actorUserId !== undefined) {
            clauses.push(
              sql`auth_security_audit_event.actor_user_id = ${query.actorUserId}`
            );
          }

          if (query.eventType !== undefined) {
            clauses.push(
              sql`auth_security_audit_event.event_type = ${query.eventType}`
            );
          }

          if (query.targetType !== undefined) {
            clauses.push(makeTargetTypeClause(sql, query.targetType));
          }

          if (query.fromDate !== undefined) {
            clauses.push(
              sql`auth_security_audit_event.created_at >= ${isoDateToUtcStartDate(
                query.fromDate
              )}`
            );
          }

          if (query.toDate !== undefined) {
            clauses.push(
              sql`auth_security_audit_event.created_at < ${getExclusiveDateUpperBound(
                query.toDate
              )}`
            );
          }

          if (query.targetSearch !== undefined) {
            const searchPattern = `%${query.targetSearch}%`;

            clauses.push(sql`(
            organization.name ilike ${searchPattern}
            or actor_user.name ilike ${searchPattern}
            or actor_user.email ilike ${searchPattern}
            or target_user.name ilike ${searchPattern}
            or target_user.email ilike ${searchPattern}
            or auth_security_audit_event.metadata ->> 'invitationEmailMasked' ilike ${searchPattern}
            or auth_security_audit_event.metadata ->> 'memberId' ilike ${searchPattern}
          )`);
          }

          if (query.cursor !== undefined) {
            const encodedCursor = query.cursor;
            const cursor = yield* Effect.try({
              catch: () =>
                new OrganizationSecurityActivityCursorInvalidError({
                  cursor: encodedCursor,
                  message: "Organization security activity cursor is invalid",
                }),
              try: () =>
                decodeOrganizationSecurityActivityCursor(encodedCursor),
            });

            clauses.push(sql`(
            auth_security_audit_event.created_at < ${cursor.createdAt}::timestamptz
            or (
              auth_security_audit_event.created_at = ${cursor.createdAt}::timestamptz
              and auth_security_audit_event.id < ${cursor.id}
            )
          )`);
          }

          const rows = yield* sql<OrganizationSecurityActivityRow>`
          select
            auth_security_audit_event.id,
            auth_security_audit_event.event_type,
            auth_security_audit_event.actor_user_id,
            auth_security_audit_event.organization_id,
            auth_security_audit_event.metadata,
            auth_security_audit_event.created_at,
            to_char(
              auth_security_audit_event.created_at at time zone 'UTC',
              'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
            ) as created_at_cursor,
            actor_user.name as actor_name,
            actor_user.email as actor_email,
            organization.name as organization_name,
            target_member.id as target_member_id,
            target_member.user_id as target_user_id,
            target_user.name as target_name,
            target_user.email as target_email
          from auth_security_audit_event
          left join "user" as actor_user
            on actor_user.id = auth_security_audit_event.actor_user_id
          left join organization
            on organization.id = auth_security_audit_event.organization_id
          left join member as target_member
            on target_member.id = (auth_security_audit_event.metadata ->> 'memberId')
            and target_member.organization_id = auth_security_audit_event.organization_id
          left join "user" as target_user
            on target_user.id = target_member.user_id
          where ${sql.and(clauses)}
          order by auth_security_audit_event.created_at desc,
            auth_security_audit_event.id desc
          limit ${limit + 1}
        `;

          const pageRows = Arr.take(rows, limit);
          const items = pipe(
            pageRows,
            Arr.map(mapOrganizationSecurityActivityRow)
          );
          const nextCursorRow =
            rows.length > limit ? rows[limit - 1] : undefined;

          return decodeSecurityActivityListResponse({
            items,
            nextCursor:
              nextCursorRow === undefined
                ? undefined
                : encodeOrganizationSecurityActivityCursor(nextCursorRow),
          });
        }
      );

      return { list };
    }),
  }
) {
  static readonly DefaultWithoutDependencies = Layer.effect(
    OrganizationSecurityActivityRepository,
    OrganizationSecurityActivityRepository.make
  );
  static readonly Default =
    OrganizationSecurityActivityRepository.DefaultWithoutDependencies;
}

export class OrganizationSecurityActivityService extends Context.Service<OrganizationSecurityActivityService>()(
  "@ceird/domains/identity/OrganizationSecurityActivityService",
  {
    make: Effect.gen(function* OrganizationSecurityActivityServiceLive() {
      const authorization = yield* OrganizationAuthorization;
      const currentOrganizationActor = yield* CurrentOrganizationActor;
      const repository = yield* OrganizationSecurityActivityRepository;

      const list = Effect.fn("OrganizationSecurityActivityService.list")(
        function* (query: OrganizationSecurityActivityQuery) {
          const actor = yield* currentOrganizationActor
            .get()
            .pipe(mapActorResolutionErrorsToSecurityActivityErrors);

          yield* authorization
            .ensureCanViewOrganizationSecurityActivity(actor)
            .pipe(mapAuthorizationErrorToSecurityActivityAccessDenied);

          return yield* repository
            .list(actor.organizationId, query)
            .pipe(
              Effect.catchTag(
                "SqlError",
                failOrganizationSecurityActivityStorageError
              )
            );
        }
      );

      return { list };
    }),
  }
) {
  static readonly DefaultWithoutDependencies = Layer.effect(
    OrganizationSecurityActivityService,
    OrganizationSecurityActivityService.make
  );
  static readonly Default =
    OrganizationSecurityActivityService.DefaultWithoutDependencies.pipe(
      Layer.provide(
        Layer.mergeAll(
          CurrentOrganizationActor.Default,
          OrganizationAuthorization.Default,
          OrganizationSecurityActivityRepository.Default
        )
      )
    );
}

export function mapOrganizationSecurityActivityRow(
  row: OrganizationSecurityActivityRow
): OrganizationSecurityActivityItem {
  const metadata = normalizeMetadata(row.metadata);
  const eventType = decodeSecurityActivityEventType(row.event_type);
  const actor = makeOrganizationSecurityActivityActor(row);
  const target = makeOrganizationSecurityActivityTarget(row, metadata);
  const roleChange = makeOrganizationSecurityActivityRoleChange(
    eventType,
    metadata
  );

  return decodeSecurityActivityItem({
    actor,
    createdAt: row.created_at.toISOString(),
    eventType,
    id: row.id as OrganizationSecurityActivityEventId,
    organizationId: row.organization_id,
    roleChange,
    summary: describeOrganizationSecurityActivity(
      eventType,
      target,
      roleChange
    ),
    target,
  });
}

function makeOrganizationSecurityActivityActor(
  row: OrganizationSecurityActivityRow
) {
  if (row.actor_user_id === null || !isUserId(row.actor_user_id)) {
    return;
  }

  return {
    email: row.actor_email ?? "",
    id: row.actor_user_id,
    name: row.actor_name ?? row.actor_email ?? "Unknown user",
  };
}

function makeOrganizationSecurityActivityTarget(
  row: OrganizationSecurityActivityRow,
  metadata: Readonly<Record<string, unknown>>
) {
  const eventType = row.event_type as OrganizationSecurityActivityEventType;
  const targetType = getTargetTypeForSecurityActivityEvent(eventType);
  const targetUserId = isUserId(row.target_user_id ?? "")
    ? row.target_user_id
    : undefined;
  const memberId =
    row.target_member_id ?? readStringMetadata(metadata, "memberId");
  const invitationEmailMasked = readStringMetadata(
    metadata,
    "invitationEmailMasked"
  );

  if (targetType === "organization") {
    return {
      label: row.organization_name ?? row.organization_id,
      type: targetType,
    } as const;
  }

  if (targetType === "invitation") {
    return {
      label: invitationEmailMasked ?? "Invitation",
      type: targetType,
    } as const;
  }

  return {
    label:
      (targetUserId === undefined ? null : row.target_name) ??
      (targetUserId === undefined ? null : row.target_email) ??
      memberId ??
      "Member",
    memberId,
    type: targetType,
    userId: targetUserId,
  } as const;
}

function makeOrganizationSecurityActivityRoleChange(
  eventType: OrganizationSecurityActivityEventType,
  metadata: Readonly<Record<string, unknown>>
) {
  if (eventType !== "organization_member_role_updated") {
    return;
  }

  const previousRole = readOrganizationRoleMetadata(metadata, "previousRole");
  const role = readOrganizationRoleMetadata(metadata, "role");

  if (previousRole === undefined && role === undefined) {
    return;
  }

  return {
    after: role,
    before: previousRole,
  };
}

function describeOrganizationSecurityActivity(
  eventType: OrganizationSecurityActivityEventType,
  target: ReturnType<typeof makeOrganizationSecurityActivityTarget>,
  roleChange: ReturnType<typeof makeOrganizationSecurityActivityRoleChange>
) {
  return Match.value(eventType).pipe(
    Match.when(
      "organization_created",
      () => `Created ${target.label ?? "the organization"}.`
    ),
    Match.when(
      "organization_updated",
      () => `Updated ${target.label ?? "the organization"}.`
    ),
    Match.when(
      "organization_invitation_created",
      () => `Invited ${target.label ?? "a teammate"}.`
    ),
    Match.when(
      "organization_invitation_resent",
      () => `Resent the invitation to ${target.label ?? "a teammate"}.`
    ),
    Match.when(
      "organization_invitation_canceled",
      () => `Canceled the invitation to ${target.label ?? "a teammate"}.`
    ),
    Match.when(
      "organization_invitation_accepted",
      () => `Accepted the invitation for ${target.label ?? "a teammate"}.`
    ),
    Match.when("organization_member_role_updated", () =>
      roleChange?.before !== undefined && roleChange.after !== undefined
        ? `Changed ${target.label ?? "a member"} from ${formatRoleLabel(
            roleChange.before
          )} to ${formatRoleLabel(roleChange.after)}.`
        : `Changed the role for ${target.label ?? "a member"}.`
    ),
    Match.when(
      "organization_member_removed",
      () => `Removed ${target.label ?? "a member"} from the organization.`
    ),
    Match.exhaustive
  );
}

function getTargetTypeForSecurityActivityEvent(
  eventType: OrganizationSecurityActivityEventType
): OrganizationSecurityActivityTargetType {
  switch (eventType) {
    case "organization_created":
    case "organization_updated": {
      return "organization";
    }
    case "organization_invitation_created":
    case "organization_invitation_resent":
    case "organization_invitation_canceled":
    case "organization_invitation_accepted": {
      return "invitation";
    }
    case "organization_member_role_updated":
    case "organization_member_removed": {
      return "member";
    }
    default: {
      return assertNever(eventType);
    }
  }
}

function makeTargetTypeClause(
  sql: SqlClient.SqlClient,
  targetType: OrganizationSecurityActivityTargetType
) {
  switch (targetType) {
    case "organization": {
      return sql`auth_security_audit_event.event_type in ${sql.in([
        "organization_created",
        "organization_updated",
      ])}`;
    }
    case "invitation": {
      return sql`auth_security_audit_event.event_type in ${sql.in([
        "organization_invitation_created",
        "organization_invitation_resent",
        "organization_invitation_canceled",
        "organization_invitation_accepted",
      ])}`;
    }
    case "member": {
      return sql`auth_security_audit_event.event_type in ${sql.in([
        "organization_member_role_updated",
        "organization_member_removed",
      ])}`;
    }
    default: {
      return assertNever(targetType);
    }
  }
}

function assertNever(value: never): never {
  throw new Error(`Unhandled organization security activity value: ${value}`);
}

export function encodeOrganizationSecurityActivityCursor(
  row: Pick<OrganizationSecurityActivityRow, "created_at_cursor" | "id">
): OrganizationSecurityActivityCursor {
  return encodeJsonCursor(
    {
      createdAt: row.created_at_cursor,
      id: row.id,
    } satisfies OrganizationSecurityActivityCursorState,
    decodeSecurityActivityCursor
  );
}

export function decodeOrganizationSecurityActivityCursor(
  cursor: OrganizationSecurityActivityCursor
) {
  return decodeJsonCursor(cursor, decodeSecurityActivityCursorState);
}

function clampSecurityActivityLimit(limit: number) {
  return Math.min(Math.max(Math.floor(limit), 1), MAX_SECURITY_ACTIVITY_LIMIT);
}

function isoDateToUtcStartDate(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

function getExclusiveDateUpperBound(value: string) {
  const date = isoDateToUtcStartDate(value);

  date.setUTCDate(date.getUTCDate() + 1);

  return date;
}

function isUtcMicrosecondTimestamp(value: string): boolean {
  const match =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?Z$/u.exec(
      value
    );

  if (match === null) {
    return false;
  }

  const [, yearText, monthText, dayText, hourText, minuteText, secondText] =
    match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);

  if (hour > 23 || minute > 59 || second > 59) {
    return false;
  }

  const date = new Date(Date.UTC(year, month - 1, day, hour, minute, second));

  return (
    !Number.isNaN(date.getTime()) &&
    date.getUTCFullYear() === year &&
    date.getUTCMonth() + 1 === month &&
    date.getUTCDate() === day &&
    date.getUTCHours() === hour &&
    date.getUTCMinutes() === minute &&
    date.getUTCSeconds() === second
  );
}

function normalizeMetadata(value: unknown): Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : {};
}

function readStringMetadata(
  metadata: Readonly<Record<string, unknown>>,
  key: string
) {
  const value = metadata[key];

  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function readOrganizationRoleMetadata(
  metadata: Readonly<Record<string, unknown>>,
  key: string
): OrganizationRoleType | undefined {
  const value = metadata[key];

  return typeof value === "string" && isOrganizationRole(value)
    ? value
    : undefined;
}

function formatRoleLabel(role: OrganizationRoleType) {
  return role.slice(0, 1).toUpperCase() + role.slice(1);
}

function mapActorResolutionErrorsToSecurityActivityErrors<Value, Requirements>(
  effect: Effect.Effect<Value, ActorResolutionError, Requirements>
) {
  return effect.pipe(
    Effect.catchTags({
      [ORGANIZATION_ACTOR_STORAGE_ERROR_TAG]: (error) =>
        Effect.fail(
          new OrganizationSecurityActivityStorageError({
            cause: error.cause,
            message: error.message,
          })
        ),
      [ORGANIZATION_ACTIVE_ORGANIZATION_REQUIRED_ERROR_TAG]: (error) =>
        failOrganizationSecurityActivityAccessDenied(error.message),
      [ORGANIZATION_ACTOR_MEMBERSHIP_NOT_FOUND_ERROR_TAG]: (error) =>
        failOrganizationSecurityActivityAccessDenied(error.message),
      [ORGANIZATION_ROLE_NOT_SUPPORTED_ERROR_TAG]: (error) =>
        failOrganizationSecurityActivityAccessDenied(error.message),
      [ORGANIZATION_SESSION_IDENTITY_INVALID_ERROR_TAG]: (error) =>
        failOrganizationSecurityActivityAccessDenied(error.message),
      [ORGANIZATION_SESSION_REQUIRED_ERROR_TAG]: (error) =>
        failOrganizationSecurityActivityAccessDenied(error.message),
    })
  );
}

function mapAuthorizationErrorToSecurityActivityAccessDenied<
  Value,
  Requirements,
>(
  effect: Effect.Effect<
    Value,
    OrganizationAuthorizationDeniedError,
    Requirements
  >
) {
  return effect.pipe(
    Effect.catchTag(ORGANIZATION_AUTHORIZATION_DENIED_ERROR_TAG, (error) =>
      failOrganizationSecurityActivityAccessDenied(error.message)
    )
  );
}

function failOrganizationSecurityActivityAccessDenied(message: string) {
  return Effect.fail(
    new OrganizationSecurityActivityAccessDeniedError({ message })
  );
}

function failOrganizationSecurityActivityStorageError(
  error: SqlError.SqlError
) {
  return Effect.fail(
    new OrganizationSecurityActivityStorageError({
      cause: error.message,
      message: "Organization security activity lookup failed",
    })
  );
}
