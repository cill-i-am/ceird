import {
  isExternalOrganizationRole,
  isInternalOrganizationRole,
  OrganizationId,
  OrganizationRole as OrganizationRoleSchema,
  UserId,
} from "@ceird/identity-core";
import type {
  InternalOrganizationRole,
  OrganizationId as OrganizationIdType,
  OrganizationRole,
  UserId as UserIdType,
} from "@ceird/identity-core";
import { HttpServerRequest } from "@effect/platform";
import { SqlClient } from "@effect/sql";
import { Effect, ParseResult, Schema } from "effect";

import { Authentication } from "../identity/authentication/auth.js";
import {
  OrganizationActiveOrganizationRequiredError,
  OrganizationActorMembershipNotFoundError,
  OrganizationActorStorageError,
  OrganizationRoleNotSupportedError,
  OrganizationSessionIdentityInvalidError,
  OrganizationSessionRequiredError,
} from "./errors.js";

interface MembershipRoleRow {
  readonly role: string;
}

interface CurrentOrganizationActorSession {
  readonly session: {
    readonly activeOrganizationId?: string | null | undefined;
  };
  readonly user: {
    readonly id: string;
  };
}

export type OrganizationActorRole =
  | InternalOrganizationRole
  | Extract<OrganizationRole, "external">;

export interface OrganizationActor {
  readonly organizationId: OrganizationIdType;
  readonly role: OrganizationActorRole;
  readonly userId: UserIdType;
}

const isOrganizationRole = Schema.is(OrganizationRoleSchema);

export const resolveCurrentOrganizationActor = Effect.fn(
  "CurrentOrganizationActor.resolve"
)(function* (options: {
  readonly headers: Headers;
  readonly getSession: (
    headers: Headers
  ) => Promise<CurrentOrganizationActorSession | null | undefined>;
  readonly loadMembershipRoles: (
    organizationId: OrganizationIdType,
    userId: UserIdType
  ) => Effect.Effect<
    readonly MembershipRoleRow[],
    OrganizationActorStorageError
  >;
}) {
  const session = yield* Effect.tryPromise({
    try: () => options.getSession(options.headers),
    catch: (cause) =>
      new OrganizationActorStorageError({
        cause: formatUnknownError(cause),
        message: "Organization actor session lookup failed",
      }),
  });

  if (session === null || session === undefined) {
    return yield* Effect.fail(
      new OrganizationSessionRequiredError({
        message: "Authentication is required to access the organization",
      })
    );
  }

  const userId = yield* decodeSessionUserId(session.user.id);
  const { activeOrganizationId } = session.session;

  if (activeOrganizationId === null || activeOrganizationId === undefined) {
    return yield* Effect.fail(
      new OrganizationActiveOrganizationRequiredError({
        message: "An active organization is required",
        userId,
      })
    );
  }

  const organizationId =
    yield* decodeSessionOrganizationId(activeOrganizationId);
  const rows = yield* options.loadMembershipRoles(organizationId, userId);
  const membershipRole = rows[0]?.role;

  if (membershipRole === undefined) {
    return yield* Effect.fail(
      new OrganizationActorMembershipNotFoundError({
        message: "User is not a member of the active organization",
        organizationId,
        userId,
      })
    );
  }

  const role = normalizeOrganizationActorRole(membershipRole);

  if (role === undefined) {
    return yield* Effect.fail(
      new OrganizationRoleNotSupportedError({
        membershipRole,
        message: "User role is not permitted to access the organization",
        organizationId,
        userId,
      })
    );
  }

  return {
    organizationId,
    role,
    userId,
  } satisfies OrganizationActor;
});

export class CurrentOrganizationActor extends Effect.Service<CurrentOrganizationActor>()(
  "@ceird/domains/organizations/CurrentOrganizationActor",
  {
    accessors: true,
    dependencies: [Authentication.Default],
    effect: Effect.gen(function* CurrentOrganizationActorLive() {
      const auth = yield* Authentication;
      const sql = yield* SqlClient.SqlClient;

      const get = Effect.fn("CurrentOrganizationActor.get")(function* () {
        const request = yield* HttpServerRequest.HttpServerRequest;

        return yield* resolveCurrentOrganizationActor({
          getSession: (headers) => auth.api.getSession({ headers }),
          headers: new Headers(request.headers),
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
        });
      });

      return { get };
    }),
  }
) {}

function decodeSessionOrganizationId(input: unknown) {
  return Schema.decodeUnknown(OrganizationId)(input).pipe(
    Effect.mapError(
      (parseError) =>
        new OrganizationSessionIdentityInvalidError({
          cause: formatParseError(parseError),
          field: "activeOrganizationId",
          message: "Session active organization id is invalid",
        })
    )
  );
}

function decodeSessionUserId(input: unknown) {
  return Schema.decodeUnknown(UserId)(input).pipe(
    Effect.mapError(
      (parseError) =>
        new OrganizationSessionIdentityInvalidError({
          cause: formatParseError(parseError),
          field: "userId",
          message: "Session user id is invalid",
        })
    )
  );
}

function failCurrentOrganizationActorStorage(error: unknown) {
  return Effect.fail(
    new OrganizationActorStorageError({
      cause: error instanceof Error ? error.message : String(error),
      message: "Organization actor storage lookup failed",
    })
  );
}

function normalizeOrganizationActorRole(
  membershipRole: string
): OrganizationActorRole | undefined {
  if (!isOrganizationRole(membershipRole)) {
    return undefined;
  }

  return isInternalOrganizationRole(membershipRole) ||
    isExternalOrganizationRole(membershipRole)
    ? membershipRole
    : undefined;
}

function formatParseError(parseError: ParseResult.ParseError) {
  return ParseResult.TreeFormatter.formatErrorSync(parseError);
}

function formatUnknownError(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
