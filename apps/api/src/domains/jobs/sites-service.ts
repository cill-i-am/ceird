import { isExternalOrganizationRole } from "@task-tracker/identity-core";
import {
  JobAccessDeniedError,
  JobStorageError,
  SiteNotFoundError,
} from "@task-tracker/jobs-core";
import type {
  CreateSiteInput,
  ServiceAreaOption,
  SiteIdType as SiteId,
  UpdateSiteInput,
} from "@task-tracker/jobs-core";
import { Effect, Option } from "effect";

import { mapActorResolutionErrorsToAccessDenied } from "./actor-access.js";
import { JobsAuthorization } from "./authorization.js";
import { CurrentJobsActor } from "./current-jobs-actor.js";
import type { JobsActor } from "./current-jobs-actor.js";
import {
  ConfigurationRepository,
  JobsRepositoriesLive,
  JobsRepository,
  SitesRepository,
} from "./repositories.js";
import { SiteGeocoder } from "./site-geocoder.js";

export class SitesService extends Effect.Service<SitesService>()(
  "@task-tracker/domains/jobs/SitesService",
  {
    accessors: true,
    dependencies: [
      CurrentJobsActor.Default,
      JobsAuthorization.Default,
      JobsRepositoriesLive,
      SiteGeocoder.Default,
    ],
    effect: Effect.gen(function* SitesServiceLive() {
      const authorization = yield* JobsAuthorization;
      const configurationRepository = yield* ConfigurationRepository;
      const currentJobsActor = yield* CurrentJobsActor;
      const jobsRepository = yield* JobsRepository;
      const siteGeocoder = yield* SiteGeocoder;
      const sitesRepository = yield* SitesRepository;

      const loadActor = Effect.fn("SitesService.loadActor")(function* () {
        return yield* currentJobsActor
          .get()
          .pipe(mapActorResolutionErrorsToAccessDenied());
      });

      const create = Effect.fn("SitesService.create")(function* (
        input: CreateSiteInput
      ) {
        const actor = yield* loadActor();
        yield* authorization.ensureCanCreateSite(actor);
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
          yield* sitesRepository
            .ensureServiceAreaInOrganization(
              actor.organizationId,
              input.serviceAreaId
            )
            .pipe(Effect.catchTag("SqlError", failSitesStorageError));
        }

        const geocodedLocation = yield* siteGeocoder.geocode(input);

        return yield* jobsRepository
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
        yield* authorization.ensureCanCreateSite(actor);
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
          yield* sitesRepository
            .ensureServiceAreaInOrganization(
              actor.organizationId,
              input.serviceAreaId
            )
            .pipe(Effect.catchTag("SqlError", failSitesStorageError));
        }

        const geocodedLocation = yield* siteGeocoder.geocode(input);

        const site = yield* jobsRepository
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

        const sites = yield* sitesRepository
          .listOptions(actor.organizationId)
          .pipe(Effect.catchTag("SqlError", failSitesStorageError));
        const serviceAreas = hasElevatedAccess(actor)
          ? yield* configurationRepository
              .listServiceAreaOptions(actor.organizationId)
              .pipe(Effect.catchTag("SqlError", failSitesStorageError))
          : deriveServiceAreaOptionsFromSites(sites);

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
): Effect.Effect<never, JobStorageError> {
  return Effect.fail(
    new JobStorageError({
      cause: error instanceof Error ? error.message : String(error),
      message: "Sites storage operation failed",
    })
  );
}

function ensureCanViewOrganizationSiteOptions(
  actor: JobsActor,
  authorization: JobsAuthorization
) {
  return Effect.gen(function* () {
    yield* authorization.ensureCanView(actor);

    if (!isExternalOrganizationRole(actor.role)) {
      return;
    }

    return yield* Effect.fail(
      new JobAccessDeniedError({
        message:
          "External collaborators cannot view organization-wide site options",
      })
    );
  });
}

function hasElevatedAccess(actor: { readonly role: string }): boolean {
  return actor.role === "owner" || actor.role === "admin";
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
