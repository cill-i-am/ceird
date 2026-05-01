import { HttpServerRequest } from "@effect/platform";
import { SqlClient } from "@effect/sql";
import {
  isExternalOrganizationRole,
  isInternalOrganizationRole,
  OrganizationRole as OrganizationRoleSchema,
} from "@task-tracker/identity-core";
import type {
  InternalOrganizationRole,
  OrganizationRole,
} from "@task-tracker/identity-core";
import {
  JobStorageError,
  OrganizationId,
  UserId,
} from "@task-tracker/jobs-core";
import type { OrganizationIdType, UserIdType } from "@task-tracker/jobs-core";
import { Effect, Schema } from "effect";

import { Authentication } from "../identity/authentication/auth.js";
import {
  JobsActiveOrganizationRequiredError,
  JobsActorMembershipNotFoundError,
  JobsOrganizationRoleNotSupportedError,
  JobsSessionRequiredError,
} from "./errors.js";

interface MembershipRoleRow {
  readonly role: string;
}

interface CurrentJobsActorSession {
  readonly session: {
    readonly activeOrganizationId?: string | null | undefined;
  };
  readonly user: {
    readonly id: string;
  };
}

export type JobsActorRole =
  | InternalOrganizationRole
  | Extract<OrganizationRole, "external">;

export interface JobsActor {
  readonly organizationId: OrganizationIdType;
  readonly role: JobsActorRole;
  readonly userId: UserIdType;
}

const decodeOrganizationId = Schema.decodeUnknownSync(OrganizationId);
const decodeUserId = Schema.decodeUnknownSync(UserId);
const isOrganizationRole = Schema.is(OrganizationRoleSchema);

export const resolveCurrentJobsActor = Effect.fn("CurrentJobsActor.resolve")(
  function* (options: {
    readonly headers: Headers;
    readonly getSession: (
      headers: Headers
    ) => Promise<CurrentJobsActorSession | null>;
    readonly loadMembershipRoles: (
      organizationId: OrganizationIdType,
      userId: UserIdType
    ) => Effect.Effect<readonly MembershipRoleRow[], JobStorageError>;
  }) {
    const session = yield* Effect.promise(() =>
      options.getSession(options.headers)
    );

    if (session === null) {
      return yield* Effect.fail(
        new JobsSessionRequiredError({
          message: "Authentication is required to access jobs",
        })
      );
    }

    const userId = decodeUserId(session.user.id);
    const { activeOrganizationId } = session.session;

    if (activeOrganizationId === null || activeOrganizationId === undefined) {
      return yield* Effect.fail(
        new JobsActiveOrganizationRequiredError({
          message: "An active organization is required to access jobs",
          userId,
        })
      );
    }

    const organizationId = decodeOrganizationId(activeOrganizationId);
    const rows = yield* options.loadMembershipRoles(organizationId, userId);
    const membershipRole = rows[0]?.role;

    if (membershipRole === undefined) {
      return yield* Effect.fail(
        new JobsActorMembershipNotFoundError({
          message: "User is not a member of the active organization",
          organizationId,
          userId,
        })
      );
    }

    const role = normalizeJobsActorRole(membershipRole);

    if (role === undefined) {
      return yield* Effect.fail(
        new JobsOrganizationRoleNotSupportedError({
          membershipRole,
          message: "User role is not permitted to access jobs",
          organizationId,
          userId,
        })
      );
    }

    return {
      organizationId,
      role,
      userId,
    } satisfies JobsActor;
  }
);

export class CurrentJobsActor extends Effect.Service<CurrentJobsActor>()(
  "@task-tracker/domains/jobs/CurrentJobsActor",
  {
    accessors: true,
    dependencies: [Authentication.Default],
    effect: Effect.gen(function* CurrentJobsActorLive() {
      const auth = yield* Authentication;
      const sql = yield* SqlClient.SqlClient;

      const get = Effect.fn("CurrentJobsActor.get")(function* () {
        const request = yield* HttpServerRequest.HttpServerRequest;
        return yield* resolveCurrentJobsActor({
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
              Effect.catchTag("SqlError", failCurrentJobsActorStorageError)
            ),
        });
      });

      return {
        get,
      };
    }),
  }
) {}

function failCurrentJobsActorStorageError(
  error: unknown
): Effect.Effect<never, JobStorageError> {
  return Effect.fail(
    new JobStorageError({
      cause: error instanceof Error ? error.message : String(error),
      message: "Jobs actor storage lookup failed",
    })
  );
}

function normalizeJobsActorRole(
  membershipRole: string
): JobsActorRole | undefined {
  if (!isOrganizationRole(membershipRole)) {
    return undefined;
  }

  return isInternalOrganizationRole(membershipRole) ||
    isExternalOrganizationRole(membershipRole)
    ? membershipRole
    : undefined;
}
