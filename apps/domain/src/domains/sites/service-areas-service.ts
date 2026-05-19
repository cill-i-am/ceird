import { SiteAccessDeniedError, SiteStorageError } from "@ceird/sites-core";
import type {
  CreateServiceAreaInput,
  ServiceAreaIdType as ServiceAreaId,
  UpdateServiceAreaInput,
} from "@ceird/sites-core";
import { Effect } from "effect";

import { mapOrganizationActorResolutionErrors } from "../organizations/actor-access.js";
import { OrganizationAuthorization } from "../organizations/authorization.js";
import { CurrentOrganizationActor } from "../organizations/current-actor.js";
import type { OrganizationAuthorizationDeniedError } from "../organizations/errors.js";
import { ORGANIZATION_ACTOR_STORAGE_ERROR_TAG } from "../organizations/errors.js";
import { ServiceAreasRepository } from "./repositories.js";

export class ServiceAreasService extends Effect.Service<ServiceAreasService>()(
  "@ceird/domains/sites/ServiceAreasService",
  {
    accessors: true,
    dependencies: [
      CurrentOrganizationActor.Default,
      OrganizationAuthorization.Default,
      ServiceAreasRepository.Default,
    ],
    effect: Effect.gen(function* ServiceAreasServiceLive() {
      const actor = yield* CurrentOrganizationActor;
      const authorization = yield* OrganizationAuthorization;
      const repository = yield* ServiceAreasRepository;

      const loadActor = Effect.fn("ServiceAreasService.loadActor")(
        function* () {
          return yield* actor
            .get()
            .pipe(
              mapSitesActorErrors,
              Effect.catchTag(
                ORGANIZATION_ACTOR_STORAGE_ERROR_TAG,
                failSiteStorage
              )
            );
        }
      );

      const list = Effect.fn("ServiceAreasService.list")(function* () {
        const currentActor = yield* loadActor();
        yield* authorization
          .ensureCanManageConfiguration(currentActor)
          .pipe(Effect.mapError(mapAuthorizationDenied));

        const serviceAreas = yield* repository
          .list(currentActor.organizationId)
          .pipe(Effect.catchTag("SqlError", failSiteStorage));

        return { items: serviceAreas } as const;
      });

      const create = Effect.fn("ServiceAreasService.create")(function* (
        input: CreateServiceAreaInput
      ) {
        const currentActor = yield* loadActor();
        yield* authorization
          .ensureCanManageConfiguration(currentActor)
          .pipe(Effect.mapError(mapAuthorizationDenied));

        return yield* repository
          .create({
            description: input.description,
            name: input.name,
            organizationId: currentActor.organizationId,
          })
          .pipe(Effect.catchTag("SqlError", failSiteStorage));
      });

      const update = Effect.fn("ServiceAreasService.update")(function* (
        serviceAreaId: ServiceAreaId,
        input: UpdateServiceAreaInput
      ) {
        const currentActor = yield* loadActor();
        yield* authorization
          .ensureCanManageConfiguration(currentActor)
          .pipe(Effect.mapError(mapAuthorizationDenied));

        return yield* repository
          .update(currentActor.organizationId, serviceAreaId, input)
          .pipe(Effect.catchTag("SqlError", failSiteStorage));
      });

      return {
        create,
        list,
        update,
      };
    }),
  }
) {}

const mapSitesActorErrors = mapOrganizationActorResolutionErrors(
  (message) => new SiteAccessDeniedError({ message })
);

function mapAuthorizationDenied(error: OrganizationAuthorizationDeniedError) {
  return new SiteAccessDeniedError({ message: error.message });
}

function failSiteStorage(error: unknown) {
  return Effect.fail(
    new SiteStorageError({
      cause: error instanceof Error ? error.message : String(error),
      message: "Site configuration storage operation failed",
    })
  );
}
