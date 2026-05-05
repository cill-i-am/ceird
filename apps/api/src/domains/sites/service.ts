import type {
  CreateSiteInput,
  ServiceAreaOption,
  SiteIdType as SiteId,
  UpdateSiteInput,
} from "@ceird/sites-core";
import {
  SiteAccessDeniedError,
  SiteNotFoundError,
  SiteStorageError,
} from "@ceird/sites-core";
import { Effect, Option } from "effect";

import { mapOrganizationActorResolutionErrors } from "../organizations/actor-access.js";
import {
  hasElevatedOrganizationAccess,
  isExternalOrganizationActor,
  OrganizationAuthorization,
} from "../organizations/authorization.js";
import { CurrentOrganizationActor } from "../organizations/current-actor.js";
import type { OrganizationActor } from "../organizations/current-actor.js";
import type { OrganizationAuthorizationDeniedError } from "../organizations/errors.js";
import { ORGANIZATION_ACTOR_STORAGE_ERROR_TAG } from "../organizations/errors.js";
import { SiteGeocoder } from "./geocoder.js";
import { ServiceAreasRepository, SitesRepository } from "./repositories.js";

export class SitesService extends Effect.Service<SitesService>()(
  "@ceird/domains/sites/SitesService",
  {
    accessors: true,
    dependencies: [
      CurrentOrganizationActor.Default,
      OrganizationAuthorization.Default,
      ServiceAreasRepository.Default,
      SitesRepository.Default,
      SiteGeocoder.Default,
    ],
    effect: Effect.gen(function* SitesServiceLive() {
      const authorization = yield* OrganizationAuthorization;
      const serviceAreasRepository = yield* ServiceAreasRepository;
      const currentOrganizationActor = yield* CurrentOrganizationActor;
      const siteGeocoder = yield* SiteGeocoder;
      const sitesRepository = yield* SitesRepository;

      const loadActor = Effect.fn("SitesService.loadActor")(function* () {
        return yield* currentOrganizationActor
          .get()
          .pipe(
            mapSitesActorErrors,
            Effect.catchTag(
              ORGANIZATION_ACTOR_STORAGE_ERROR_TAG,
              failSitesStorageError
            )
          );
      });

      const create = Effect.fn("SitesService.create")(function* (
        input: CreateSiteInput
      ) {
        const actor = yield* loadActor();
        yield* authorization
          .ensureCanCreateSite(actor)
          .pipe(Effect.mapError(mapAuthorizationDenied));
        yield* Effect.annotateCurrentSpan("action", "create");
        yield* Effect.annotateCurrentSpan(
          "organizationId",
          actor.organizationId
        );
        yield* Effect.annotateCurrentSpan("actorUserId", actor.userId);
        yield* Effect.annotateCurrentSpan("actorRole", actor.role);

        if (input.serviceAreaId !== undefined) {
          yield* Effect.annotateCurrentSpan(
            "serviceAreaId",
            input.serviceAreaId
          );
        }

        const geocodedLocation = yield* siteGeocoder.geocode(input);

        return yield* sitesRepository
          .withTransaction(
            Effect.gen(function* () {
              const siteId = yield* sitesRepository.create({
                accessNotes: input.accessNotes,
                addressLine1: input.addressLine1,
                addressLine2: input.addressLine2,
                country: input.country,
                county: input.county,
                eircode: input.eircode,
                geocodedAt: geocodedLocation.geocodedAt,
                geocodingProvider: geocodedLocation.provider,
                latitude: geocodedLocation.latitude,
                longitude: geocodedLocation.longitude,
                name: input.name,
                organizationId: actor.organizationId,
                serviceAreaId: input.serviceAreaId,
                town: input.town,
              });
              yield* Effect.annotateCurrentSpan("siteId", siteId);

              const site = yield* sitesRepository
                .getOptionById(actor.organizationId, siteId)
                .pipe(
                  Effect.flatMap(
                    Option.match({
                      onNone: () =>
                        Effect.die(
                          new Error(
                            `Created site could not be loaded: organizationId=${actor.organizationId} siteId=${siteId}`
                          )
                        ),
                      onSome: Effect.succeed,
                    })
                  )
                );

              return site;
            })
          )
          .pipe(Effect.catchTag("SqlError", failSitesStorageError));
      });

      const update = Effect.fn("SitesService.update")(function* (
        siteId: SiteId,
        input: UpdateSiteInput
      ) {
        const actor = yield* loadActor();
        yield* authorization
          .ensureCanCreateSite(actor)
          .pipe(Effect.mapError(mapAuthorizationDenied));
        yield* Effect.annotateCurrentSpan("action", "update");
        yield* Effect.annotateCurrentSpan(
          "organizationId",
          actor.organizationId
        );
        yield* Effect.annotateCurrentSpan("siteId", siteId);
        yield* Effect.annotateCurrentSpan("actorUserId", actor.userId);
        yield* Effect.annotateCurrentSpan("actorRole", actor.role);

        if (input.serviceAreaId !== undefined) {
          yield* Effect.annotateCurrentSpan(
            "serviceAreaId",
            input.serviceAreaId
          );
        }

        const geocodedLocation = yield* siteGeocoder.geocode(input);

        const site = yield* sitesRepository
          .withTransaction(
            sitesRepository
              .update(actor.organizationId, siteId, {
                accessNotes: input.accessNotes,
                addressLine1: input.addressLine1,
                addressLine2: input.addressLine2,
                country: input.country,
                county: input.county,
                eircode: input.eircode,
                geocodedAt: geocodedLocation.geocodedAt,
                geocodingProvider: geocodedLocation.provider,
                latitude: geocodedLocation.latitude,
                longitude: geocodedLocation.longitude,
                name: input.name,
                serviceAreaId: input.serviceAreaId,
                town: input.town,
              })
              .pipe(Effect.map(Option.getOrUndefined))
          )
          .pipe(Effect.catchTag("SqlError", failSitesStorageError));

        if (site !== undefined) {
          return site;
        }

        return yield* Effect.fail(
          new SiteNotFoundError({
            message: "Site does not exist",
            siteId,
          })
        );
      });

      const getOptions = Effect.fn("SitesService.getOptions")(function* () {
        const actor = yield* loadActor();
        yield* ensureCanViewOrganizationSiteOptions(actor, authorization);
        yield* Effect.annotateCurrentSpan("action", "getOptions");
        yield* Effect.annotateCurrentSpan(
          "organizationId",
          actor.organizationId
        );
        yield* Effect.annotateCurrentSpan("actorUserId", actor.userId);
        yield* Effect.annotateCurrentSpan("actorRole", actor.role);

        const [sites, serviceAreas] = hasElevatedOrganizationAccess(actor)
          ? yield* Effect.all([
              sitesRepository.listOptions(actor.organizationId),
              serviceAreasRepository.listOptions(actor.organizationId),
            ]).pipe(Effect.catchTag("SqlError", failSitesStorageError))
          : yield* sitesRepository.listOptions(actor.organizationId).pipe(
              Effect.map(
                (siteOptions) =>
                  [
                    siteOptions,
                    deriveServiceAreaOptionsFromSites(siteOptions),
                  ] as const
              ),
              Effect.catchTag("SqlError", failSitesStorageError)
            );

        return {
          serviceAreas,
          sites,
        } as const;
      });

      return {
        create,
        getOptions,
        update,
      };
    }),
  }
) {}

function failSitesStorageError(
  error: unknown
): Effect.Effect<never, SiteStorageError> {
  return Effect.fail(
    new SiteStorageError({
      cause: error instanceof Error ? error.message : String(error),
      message: "Sites storage operation failed",
    })
  );
}

function ensureCanViewOrganizationSiteOptions(
  actor: OrganizationActor,
  authorization: OrganizationAuthorization
) {
  return Effect.gen(function* () {
    if (isExternalOrganizationActor(actor)) {
      return yield* Effect.fail(
        new SiteAccessDeniedError({
          message:
            "External collaborators cannot view organization-wide site options",
        })
      );
    }

    yield* authorization
      .ensureCanViewOrganizationData(actor)
      .pipe(Effect.mapError(mapAuthorizationDenied));
  });
}

const mapSitesActorErrors = mapOrganizationActorResolutionErrors(
  (message) => new SiteAccessDeniedError({ message })
);

function mapAuthorizationDenied(error: OrganizationAuthorizationDeniedError) {
  return new SiteAccessDeniedError({ message: error.message });
}

function deriveServiceAreaOptionsFromSites(
  sites: readonly {
    readonly serviceAreaId?: ServiceAreaOption["id"] | undefined;
    readonly serviceAreaName?: string | undefined;
  }[]
): readonly ServiceAreaOption[] {
  const serviceAreasById = new Map<
    ServiceAreaOption["id"],
    ServiceAreaOption
  >();

  for (const site of sites) {
    if (
      site.serviceAreaId === undefined ||
      site.serviceAreaName === undefined
    ) {
      continue;
    }

    serviceAreasById.set(site.serviceAreaId, {
      id: site.serviceAreaId,
      name: site.serviceAreaName,
    });
  }

  return [...serviceAreasById.values()].toSorted(compareServiceAreaOptions);
}

function compareServiceAreaOptions(
  left: ServiceAreaOption,
  right: ServiceAreaOption
): number {
  const nameComparison = left.name.localeCompare(right.name);

  return nameComparison === 0
    ? left.id.localeCompare(right.id)
    : nameComparison;
}
