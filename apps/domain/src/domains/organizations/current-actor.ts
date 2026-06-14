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
import { and, eq } from "drizzle-orm";
import { Layer, Context, Effect, Schema } from "effect";
import { HttpServerRequest } from "effect/unstable/http";

import {
  describeDomainStorageFailure,
  DomainDrizzle,
} from "../../platform/database/database.js";
import { member } from "../../platform/database/schema.js";
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

export class CurrentOrganizationActor extends Context.Service<CurrentOrganizationActor>()(
  "@ceird/domains/organizations/CurrentOrganizationActor",
  {
    make: Effect.gen(function* CurrentOrganizationActorLive() {
      const auth = yield* Authentication;
      const { db } = yield* DomainDrizzle;

      const get = Effect.fn("CurrentOrganizationActor.get")(function* () {
        const request = yield* HttpServerRequest.HttpServerRequest;

        return yield* resolveCurrentOrganizationActor({
          getSession: (headers) => auth.api.getSession({ headers }),
          headers: new Headers(request.headers),
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
              .pipe(
                Effect.catchTag(
                  "EffectDrizzleQueryError",
                  failCurrentOrganizationActorStorage
                )
              ),
        });
      });

      return { get };
    }),
  }
) {
  static readonly DefaultWithoutDependencies = Layer.effect(
    CurrentOrganizationActor,
    CurrentOrganizationActor.make
  );
  static readonly Default =
    CurrentOrganizationActor.DefaultWithoutDependencies.pipe(
      Layer.provide(Authentication.Default)
    );
}

function decodeSessionOrganizationId(input: unknown) {
  return Schema.decodeUnknownEffect(OrganizationId)(input).pipe(
    Effect.mapError(
      (parseError) =>
        new OrganizationSessionIdentityInvalidError({
          cause: String(parseError),
          field: "activeOrganizationId",
          message: "Session active organization id is invalid",
        })
    )
  );
}

function decodeSessionUserId(input: unknown) {
  return Schema.decodeUnknownEffect(UserId)(input).pipe(
    Effect.mapError(
      (parseError) =>
        new OrganizationSessionIdentityInvalidError({
          cause: String(parseError),
          field: "userId",
          message: "Session user id is invalid",
        })
    )
  );
}

function failCurrentOrganizationActorStorage(error: unknown) {
  return Effect.fail(
    new OrganizationActorStorageError({
      cause: describeDomainStorageFailure(error),
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

function formatUnknownError(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}
