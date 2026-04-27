import type { CreateSiteInput } from "@task-tracker/jobs-core";
import { Effect, Option } from "effect";

import { mapActorResolutionErrorsToAccessDenied } from "./actor-access.js";
import { JobsAuthorization } from "./authorization.js";
import { CurrentJobsActor } from "./current-jobs-actor.js";
import {
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

        if (input.regionId !== undefined) {
          yield* Effect.annotateCurrentSpan("regionId", input.regionId);
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
                regionId: input.regionId,
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
          .pipe(Effect.catchTag("SqlError", (error) => Effect.die(error)));
      });

      const getOptions = Effect.fn("SitesService.getOptions")(function* () {
        const actor = yield* loadActor();
        yield* authorization.ensureCanView(actor);
        yield* Effect.annotateCurrentSpan("action", "getOptions");
        yield* Effect.annotateCurrentSpan(
          "organizationId",
          actor.organizationId
        );
        yield* Effect.annotateCurrentSpan("actorUserId", actor.userId);
        yield* Effect.annotateCurrentSpan("actorRole", actor.role);

        const [regions, sites] = yield* Effect.all([
          sitesRepository.listRegions(actor.organizationId),
          sitesRepository.listOptions(actor.organizationId),
        ]).pipe(Effect.catchTag("SqlError", (error) => Effect.die(error)));

        return {
          regions,
          sites,
        } as const;
      });

      return {
        create,
        getOptions,
      };
    }),
  }
) {}
