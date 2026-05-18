import type { OrganizationId, SessionId, UserId } from "@ceird/identity-core";
import { SqlClient } from "@effect/sql";
import { Context, Effect, Layer } from "effect";

import {
  CurrentOrganizationActor,
  resolveCurrentOrganizationActor,
} from "../organizations/current-actor.js";
import { OrganizationActorStorageError } from "../organizations/errors.js";

type CurrentOrganizationActorService = Parameters<
  typeof CurrentOrganizationActor.make
>[0];

interface MembershipRoleRow {
  readonly role: string;
}

interface SessionRow {
  readonly activeOrganizationId: string | null;
  readonly expiresAt: Date;
  readonly userId: string;
}

export interface McpSessionIdentity {
  readonly sessionId: SessionId;
  readonly userId: UserId;
}

export class McpSessionContext extends Context.Tag(
  "@ceird/domains/mcp/McpSessionContext"
)<McpSessionContext, McpSessionIdentity>() {}

export const makeCurrentOrganizationActorFromMcpSessionLayer = (
  session: McpSessionIdentity
) =>
  Layer.effect(
    CurrentOrganizationActor,
    makeCurrentOrganizationActorFromMcpSession(Effect.succeed(session))
  );

const makeCurrentOrganizationActorFromMcpSession = <RSession>(
  sessionEffect: Effect.Effect<McpSessionIdentity, never, RSession>
) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;

    return CurrentOrganizationActor.make({
      get: (() =>
        Effect.gen(function* () {
          const session = yield* sessionEffect;

          return yield* resolveCurrentOrganizationActorFromMcpSession({
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
          });
        })) as unknown as CurrentOrganizationActorService["get"],
    });
  });

export const CurrentOrganizationActorFromMcpSessionLive = Layer.effect(
  CurrentOrganizationActor,
  makeCurrentOrganizationActorFromMcpSession(McpSessionContext)
);

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

  return yield* resolveCurrentOrganizationActor({
    headers: new Headers(),
    getSession: () =>
      Effect.succeed(
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
