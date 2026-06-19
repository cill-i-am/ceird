/* oxlint-disable eslint/max-classes-per-file */
import {
  ORGANIZATION_SECURITY_ACTIVITY_EVENT_TYPES,
  OrganizationSecurityActivityAccessDeniedError,
  OrganizationSecurityActivityCursor as OrganizationSecurityActivityCursorSchema,
  OrganizationSecurityActivityCursorInvalidError,
  OrganizationSecurityActivityItemSchema,
  OrganizationSecurityActivityListResponseSchema,
  OrganizationSecurityActivityQuerySchema,
  OrganizationSecurityActivityStorageError,
} from "@ceird/identity-core";
import type {
  OrganizationId as OrganizationIdType,
  OrganizationRole as OrganizationRoleType,
  OrganizationSecurityActivityCursor,
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
  Option,
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
import {
  OrganizationSecurityActivityCursorStateSchema,
  OrganizationSecurityActivityRowsSchema,
} from "./persistence-schemas.js";
import type {
  OrganizationSecurityActivityCursorState,
  OrganizationSecurityActivityRow,
} from "./persistence-schemas.js";

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
const decodeSecurityActivityCursorState = Schema.decodeUnknownSync(
  OrganizationSecurityActivityCursorStateSchema
);
const decodeSecurityActivityQuery = Schema.decodeUnknownSync(
  OrganizationSecurityActivityQuerySchema
);
const decodeSecurityActivityRows = Schema.decodeUnknownSync(
  OrganizationSecurityActivityRowsSchema
);

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
          const { limit } = query;
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

          const rows = yield* sql<Record<string, unknown>>`
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
            and auth_security_audit_event.event_type in (
              'organization_invitation_accepted',
              'organization_member_role_updated',
              'organization_member_removed'
            )
          left join "user" as target_user
            on target_user.id = target_member.user_id
          where ${sql.and(clauses)}
          order by auth_security_audit_event.created_at desc,
            auth_security_audit_event.id desc
          limit ${limit + 1}
        `;

          const decodedRows =
            yield* decodeOrganizationSecurityActivityRows(rows);
          const pageRows = Arr.take(decodedRows, limit);
          const items = pipe(
            pageRows,
            Arr.map(mapOrganizationSecurityActivityRow)
          );
          const nextCursorRow =
            decodedRows.length > limit ? decodedRows[limit - 1] : undefined;

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

          const decodedQuery = decodeSecurityActivityQuery(query);

          return yield* repository
            .list(actor.organizationId, decodedQuery)
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
  const actor = makeOrganizationSecurityActivityActor(row);
  const target = makeOrganizationSecurityActivityTarget(row);
  const roleChange = makeOrganizationSecurityActivityRoleChange(row);

  return decodeSecurityActivityItem({
    actor,
    createdAt: row.created_at.toISOString(),
    eventType: row.event_type,
    id: row.id,
    organizationId: row.organization_id,
    roleChange,
    summary: describeOrganizationSecurityActivity(
      row.event_type,
      target,
      roleChange
    ),
    target,
  });
}

function makeOrganizationSecurityActivityActor(
  row: OrganizationSecurityActivityRow
) {
  if (
    row.actor_user_id === null ||
    row.actor_email === null ||
    row.actor_name === null
  ) {
    return;
  }

  return {
    email: row.actor_email,
    id: row.actor_user_id,
    name: row.actor_name,
  };
}

function makeOrganizationSecurityActivityTarget(
  row: OrganizationSecurityActivityRow
) {
  switch (row.event_type) {
    case "organization_created":
    case "organization_updated": {
      return {
        label: row.organization_name,
        type: "organization",
      } as const;
    }
    case "organization_invitation_created":
    case "organization_invitation_resent":
    case "organization_invitation_canceled":
    case "organization_invitation_accepted": {
      return {
        label: row.metadata.invitationEmailMasked,
        type: "invitation",
      } as const;
    }
    case "organization_member_role_updated":
    case "organization_member_removed": {
      const scopedTargetLabel =
        row.target_user_id === null
          ? undefined
          : (row.target_name ?? row.target_email ?? undefined);

      return {
        label: scopedTargetLabel ?? row.metadata.memberId,
        memberId: row.metadata.memberId,
        type: "member",
        userId: row.target_user_id ?? undefined,
      } as const;
    }
    default: {
      const exhaustive: never = row;
      return exhaustive;
    }
  }
}

function makeOrganizationSecurityActivityRoleChange(
  row: OrganizationSecurityActivityRow
) {
  if (row.event_type !== "organization_member_role_updated") {
    return;
  }

  const previousRole = row.metadata.previousRole ?? undefined;
  const role = row.metadata.role ?? undefined;

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
      const exhaustive: never = targetType;
      return exhaustive;
    }
  }
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

function isoDateToUtcStartDate(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

function getExclusiveDateUpperBound(value: string) {
  const date = isoDateToUtcStartDate(value);

  date.setUTCDate(date.getUTCDate() + 1);

  return date;
}

function formatRoleLabel(role: OrganizationRoleType) {
  return role.slice(0, 1).toUpperCase() + role.slice(1);
}

function decodeOrganizationSecurityActivityRows(
  rows: unknown
): Effect.Effect<
  readonly OrganizationSecurityActivityRow[],
  OrganizationSecurityActivityStorageError
> {
  return Effect.try({
    catch: (error) =>
      makeOrganizationSecurityActivityStorageError(
        error,
        "Organization security activity row decode failed"
      ),
    try: () => decodeSecurityActivityRows(rows),
  });
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
    makeOrganizationSecurityActivityStorageError(
      error,
      "Organization security activity lookup failed"
    )
  );
}

function makeOrganizationSecurityActivityStorageError(
  error: unknown,
  message: string
) {
  return new OrganizationSecurityActivityStorageError({
    cause: error instanceof Error ? error.message : undefined,
    message,
  });
}
