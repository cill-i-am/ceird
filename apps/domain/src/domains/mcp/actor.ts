import type { OrganizationId, SessionId, UserId } from "@ceird/identity-core";
import { and, eq, gt, sql as drizzleSql } from "drizzle-orm";
import { Effect, Layer } from "effect";

import {
  describeDomainStorageFailure,
  DomainDrizzle,
} from "../../platform/database/database.js";
import {
  member,
  session as sessionTable,
} from "../../platform/database/schema.js";
import {
  CurrentOrganizationActor,
  resolveCurrentOrganizationActor,
} from "../organizations/current-actor.js";
import { OrganizationActorStorageError } from "../organizations/errors.js";

interface MembershipRoleRow {
  readonly role: string;
}

interface SessionRow {
  readonly activeOrganizationId: string | null;
  readonly expiresAt: Date;
  readonly userId: string;
}

export interface McpSessionIdentity {
  readonly organizationId?: OrganizationId | undefined;
  readonly sessionId: SessionId;
  readonly userId: UserId;
}

export const makeCurrentOrganizationActorFromMcpSessionLayer = (
  session: McpSessionIdentity
) =>
  Layer.effect(
    CurrentOrganizationActor,
    makeCurrentOrganizationActorFromMcpSession(session)
  );

const makeCurrentOrganizationActorFromMcpSession = (
  session: McpSessionIdentity
) =>
  Effect.gen(function* () {
    const { db } = yield* DomainDrizzle;

    return CurrentOrganizationActor.of({
      get: () =>
        resolveCurrentOrganizationActorFromMcpSession({
          loadMembershipRoles: (organizationId, userId) =>
            db
              .select({ role: member.role })
              .from(member)
              .where(
                and(
                  eq(member.organizationId, organizationId),
                  eq(member.userId, userId)
                )
              )
              .limit(1)
              .pipe(Effect.mapError(failCurrentOrganizationActorStorageError)),
          loadSessionById: (sessionId) =>
            db
              .select({
                activeOrganizationId: sessionTable.activeOrganizationId,
                expiresAt: sessionTable.expiresAt,
                userId: sessionTable.userId,
              })
              .from(sessionTable)
              .where(
                and(
                  eq(sessionTable.id, sessionId),
                  gt(sessionTable.expiresAt, drizzleSql`now()`)
                )
              )
              .limit(1)
              .pipe(
                Effect.map((rows) => rows[0] ?? null),
                Effect.mapError(failCurrentOrganizationActorStorageError)
              ),
          session,
        }),
    });
  });

export const resolveCurrentOrganizationActorFromMcpSession = Effect.fn(
  "McpCurrentOrganizationActor.resolveFromSession"
)(function* (options: {
  readonly session: McpSessionIdentity;
  readonly loadSessionById: (
    sessionId: SessionId
  ) => Effect.Effect<SessionRow | null, OrganizationActorStorageError>;
  readonly loadMembershipRoles: (
    organizationId: OrganizationId,
    userId: UserId
  ) => Effect.Effect<
    readonly MembershipRoleRow[],
    OrganizationActorStorageError
  >;
}) {
  const sessionRow = yield* options.loadSessionById(options.session.sessionId);

  if (sessionRow !== null && sessionRow.expiresAt.getTime() <= Date.now()) {
    return yield* Effect.fail(
      new OrganizationActorStorageError({
        cause: "session expired",
        message: "MCP session has expired",
      })
    );
  }

  if (sessionRow !== null && sessionRow.userId !== options.session.userId) {
    return yield* Effect.fail(
      new OrganizationActorStorageError({
        cause: "session user mismatch",
        message: "MCP session identity does not match session owner",
      })
    );
  }

  const organizationId =
    options.session.organizationId ?? sessionRow?.activeOrganizationId ?? null;

  return yield* resolveCurrentOrganizationActor({
    headers: new Headers(),
    getSession: () =>
      Promise.resolve(
        sessionRow === null
          ? null
          : {
              session: {
                activeOrganizationId: organizationId,
              },
              user: {
                id: sessionRow.userId,
              },
            }
      ),
    loadMembershipRoles: options.loadMembershipRoles,
  });
});

function failCurrentOrganizationActorStorageError(error: unknown) {
  return new OrganizationActorStorageError({
    cause: describeDomainStorageFailure(error),
    message: "MCP actor storage lookup failed",
  });
}
