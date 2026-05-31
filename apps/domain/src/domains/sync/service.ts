import {
  SyncAccessDeniedError,
  SyncAuthorizationStorageError,
  SyncUnauthorizedError,
} from "@ceird/domain-core";
import type { SyncShapeAuthorization, SyncShapeName } from "@ceird/domain-core";
import { isInternalOrganizationRole } from "@ceird/identity-core";
import { Context, Effect, Layer } from "effect";

import { CurrentOrganizationActor } from "../organizations/current-actor.js";
import type {
  OrganizationActiveOrganizationRequiredError,
  OrganizationActorMembershipNotFoundError,
  OrganizationActorStorageError,
  OrganizationRoleNotSupportedError,
  OrganizationSessionIdentityInvalidError,
  OrganizationSessionRequiredError,
} from "../organizations/errors.js";

export {
  SyncAccessDeniedError,
  SyncAuthorizationStorageError,
  SyncUnauthorizedError,
} from "@ceird/domain-core";

type SyncCurrentOrganizationActorError =
  | OrganizationActiveOrganizationRequiredError
  | OrganizationActorMembershipNotFoundError
  | OrganizationActorStorageError
  | OrganizationRoleNotSupportedError
  | OrganizationSessionIdentityInvalidError
  | OrganizationSessionRequiredError;

interface SyncShapeDefinition {
  readonly scope: "organization" | "organization-user";
  readonly table: string;
}

const syncShapeDefinitions = {
  "agent-action-runs": {
    scope: "organization-user",
    table: "agent_action_runs",
  },
  "agent-threads": {
    scope: "organization-user",
    table: "agent_threads",
  },
  comments: {
    scope: "organization",
    table: "comments",
  },
  contacts: {
    scope: "organization",
    table: "contacts",
  },
  jobs: {
    scope: "organization",
    table: "work_items",
  },
  labels: {
    scope: "organization",
    table: "labels",
  },
  "site-comments": {
    scope: "organization",
    table: "site_comments",
  },
  "site-contacts": {
    scope: "organization",
    table: "site_contacts",
  },
  "site-labels": {
    scope: "organization",
    table: "site_labels",
  },
  sites: {
    scope: "organization",
    table: "sites",
  },
  "work-item-activity": {
    scope: "organization",
    table: "work_item_activity",
  },
  "work-item-collaborators": {
    scope: "organization",
    table: "work_item_collaborators",
  },
  "work-item-comments": {
    scope: "organization",
    table: "work_item_comments",
  },
  "work-item-labels": {
    scope: "organization",
    table: "work_item_labels",
  },
  "work-item-visits": {
    scope: "organization",
    table: "work_item_visits",
  },
} as const satisfies Record<SyncShapeName, SyncShapeDefinition>;

export class SyncAuthorizationService extends Context.Service<SyncAuthorizationService>()(
  "@ceird/domains/sync/SyncAuthorizationService",
  {
    make: Effect.gen(function* SyncAuthorizationServiceLive() {
      const currentActor = yield* CurrentOrganizationActor;

      const authorizeShape = Effect.fn(
        "SyncAuthorizationService.authorizeShape"
      )(function* (shapeName: SyncShapeName) {
        yield* Effect.annotateCurrentSpan("sync.shapeName", shapeName);

        const actor = yield* currentActor
          .get()
          .pipe(
            Effect.mapError((error) => mapCurrentActorError(error, shapeName))
          );

        if (!isInternalOrganizationRole(actor.role)) {
          return yield* Effect.fail(
            new SyncAccessDeniedError({
              message:
                "Sync is currently limited to internal organization members",
              shapeName,
            })
          );
        }

        const definition = syncShapeDefinitions[shapeName];
        yield* Effect.annotateCurrentSpan("sync.scope", definition.scope);
        yield* Effect.annotateCurrentSpan("sync.table", definition.table);
        yield* Effect.annotateCurrentSpan(
          "organization.id",
          actor.organizationId
        );
        yield* Effect.annotateCurrentSpan("user.id", actor.userId);
        yield* Effect.annotateCurrentSpan("organization.role", actor.role);

        const baseAuthorization = {
          organizationId: actor.organizationId,
          shape: shapeName,
          table: definition.table,
          userId: actor.userId,
        } satisfies Pick<
          SyncShapeAuthorization,
          "organizationId" | "shape" | "table" | "userId"
        >;

        if (definition.scope === "organization-user") {
          const params = {
            "1": actor.organizationId,
            "2": actor.userId,
          };

          return {
            ...baseAuthorization,
            params,
            scope: "organization-user",
            where: "organization_id = $1 AND user_id = $2",
          } satisfies SyncShapeAuthorization;
        }

        const params = {
          "1": actor.organizationId,
        };

        return {
          ...baseAuthorization,
          params,
          scope: "organization",
          where: "organization_id = $1",
        } satisfies SyncShapeAuthorization;
      });

      return { authorizeShape };
    }),
  }
) {
  static readonly DefaultWithoutDependencies = Layer.effect(
    SyncAuthorizationService,
    SyncAuthorizationService.make
  );
  static readonly Default =
    SyncAuthorizationService.DefaultWithoutDependencies.pipe(
      Layer.provide(CurrentOrganizationActor.Default)
    );
}

function mapCurrentActorError(
  error: SyncCurrentOrganizationActorError,
  shapeName: SyncShapeName
) {
  switch (error._tag) {
    case "@ceird/domains/organizations/OrganizationActiveOrganizationRequiredError":
    case "@ceird/domains/organizations/OrganizationSessionIdentityInvalidError":
    case "@ceird/domains/organizations/OrganizationSessionRequiredError": {
      return new SyncUnauthorizedError({
        cause: error._tag,
        message: "Authentication is required to authorize sync",
        shapeName,
      });
    }
    case "@ceird/domains/organizations/OrganizationActorStorageError": {
      return new SyncAuthorizationStorageError({
        cause: error._tag,
        message: "Sync authorization lookup failed",
        shapeName,
      });
    }
    case "@ceird/domains/organizations/OrganizationActorMembershipNotFoundError":
    case "@ceird/domains/organizations/OrganizationRoleNotSupportedError": {
      return new SyncAccessDeniedError({
        cause: error._tag,
        message: "Organization membership is required to authorize sync",
        shapeName,
      });
    }
    default: {
      const exhaustive: never = error;

      return exhaustive;
    }
  }
}
