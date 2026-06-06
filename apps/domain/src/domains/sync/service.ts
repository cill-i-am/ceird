import {
  ORGANIZATION_SYNC_WHERE,
  ORGANIZATION_USER_SYNC_WHERE,
  SyncAccessDeniedError,
  SyncAuthorizationStorageError,
  SyncShapeAuthorizationSchema,
  SYNC_SHAPE_AUTHORIZATION_DEFINITIONS,
  SyncUnauthorizedError,
} from "@ceird/domain-core";
import type { SyncShapeName } from "@ceird/domain-core";
import { isInternalOrganizationRole } from "@ceird/identity-core";
import { Context, Effect, Layer, Match, Schema } from "effect";

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

        const definition = SYNC_SHAPE_AUTHORIZATION_DEFINITIONS[shapeName];
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
        };

        if (definition.scope === "organization-user") {
          const params = {
            "1": actor.organizationId,
            "2": actor.userId,
          };

          const authorization = {
            ...baseAuthorization,
            params,
            scope: "organization-user",
            where: ORGANIZATION_USER_SYNC_WHERE,
          };

          return yield* decodeSyncShapeAuthorization(authorization);
        }

        const params = {
          "1": actor.organizationId,
        };

        const authorization = {
          ...baseAuthorization,
          params,
          scope: "organization",
          where: ORGANIZATION_SYNC_WHERE,
        };

        return yield* decodeSyncShapeAuthorization(authorization);
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

function decodeSyncShapeAuthorization(input: unknown) {
  return Schema.decodeUnknownEffect(SyncShapeAuthorizationSchema)(input).pipe(
    Effect.orDie
  );
}

function mapCurrentActorError(
  error: SyncCurrentOrganizationActorError,
  shapeName: SyncShapeName
) {
  return Match.value(error).pipe(
    Match.when(
      {
        _tag: "@ceird/domains/organizations/OrganizationActiveOrganizationRequiredError",
      },
      (currentActorError) =>
        new SyncUnauthorizedError({
          cause: currentActorError._tag,
          message: "Authentication is required to authorize sync",
          shapeName,
        })
    ),
    Match.when(
      {
        _tag: "@ceird/domains/organizations/OrganizationSessionIdentityInvalidError",
      },
      (currentActorError) =>
        new SyncUnauthorizedError({
          cause: currentActorError._tag,
          message: "Authentication is required to authorize sync",
          shapeName,
        })
    ),
    Match.when(
      {
        _tag: "@ceird/domains/organizations/OrganizationSessionRequiredError",
      },
      (currentActorError) =>
        new SyncUnauthorizedError({
          cause: currentActorError._tag,
          message: "Authentication is required to authorize sync",
          shapeName,
        })
    ),
    Match.when(
      {
        _tag: "@ceird/domains/organizations/OrganizationActorStorageError",
      },
      (currentActorError) =>
        new SyncAuthorizationStorageError({
          cause: currentActorError.cause ?? currentActorError._tag,
          message: "Sync authorization lookup failed",
          shapeName,
        })
    ),
    Match.when(
      {
        _tag: "@ceird/domains/organizations/OrganizationActorMembershipNotFoundError",
      },
      (currentActorError) =>
        new SyncAccessDeniedError({
          cause: currentActorError._tag,
          message: "Organization membership is required to authorize sync",
          shapeName,
        })
    ),
    Match.when(
      {
        _tag: "@ceird/domains/organizations/OrganizationRoleNotSupportedError",
      },
      (currentActorError) =>
        new SyncAccessDeniedError({
          cause: currentActorError._tag,
          message: "Organization membership is required to authorize sync",
          shapeName,
        })
    ),
    Match.exhaustive
  );
}
