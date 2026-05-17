import type { OrganizationId, UserId } from "@ceird/identity-core";
import { SqlClient } from "@effect/sql";
import { Effect, Layer } from "effect";

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
  readonly sessionId: string;
  readonly userId: string;
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
    const sql = yield* SqlClient.SqlClient;

    return CurrentOrganizationActor.make({
      get: () =>
        resolveCurrentOrganizationActorFromMcpSession({
          loadMembershipRoles: (organizationId, userId) =>
            sql<MembershipRoleRow>`
              select role
              from member
              where organization_id = ${organizationId}
                and user_id = ${userId}
              limit 1
            `.pipe(
              Effect.catchTag("SqlError", failCurrentOrganizationActorStorage)
            ),
          loadSessionById: (sessionId) =>
            sql<SessionRow>`
              select
                active_organization_id as "activeOrganizationId",
                expires_at as "expiresAt",
                user_id as "userId"
              from session
              where id = ${sessionId}
                and expires_at > now()
              limit 1
            `.pipe(
              Effect.map((rows) => rows[0] ?? null),
              Effect.catchTag("SqlError", failCurrentOrganizationActorStorage)
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
    sessionId: string
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

  return yield* resolveCurrentOrganizationActor({
    headers: new Headers(),
    getSession: () =>
      Promise.resolve(
        sessionRow === null
          ? null
          : {
              session: {
                activeOrganizationId: sessionRow.activeOrganizationId,
              },
              user: {
                id: sessionRow.userId,
              },
            }
      ),
    loadMembershipRoles: options.loadMembershipRoles,
  });
});

function failCurrentOrganizationActorStorage(error: unknown) {
  return Effect.fail(
    new OrganizationActorStorageError({
      cause: error instanceof Error ? error.message : String(error),
      message: "MCP actor storage lookup failed",
    })
  );
}
