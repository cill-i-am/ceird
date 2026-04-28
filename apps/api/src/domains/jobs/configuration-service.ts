import { JobStorageError } from "@task-tracker/jobs-core";
import type {
  CreateRateCardInput,
  CreateServiceAreaInput,
  RateCardIdType as RateCardId,
  ServiceAreaIdType as ServiceAreaId,
  UpdateRateCardInput,
  UpdateServiceAreaInput,
} from "@task-tracker/jobs-core";
import { Effect } from "effect";

import { mapActorResolutionErrorsToAccessDenied } from "./actor-access.js";
import { JobsAuthorization } from "./authorization.js";
import { CurrentJobsActor } from "./current-jobs-actor.js";
import {
  ConfigurationRepository,
  JobsRepositoriesLive,
  RateCardsRepository,
} from "./repositories.js";

export class ConfigurationService extends Effect.Service<ConfigurationService>()(
  "@task-tracker/domains/jobs/ConfigurationService",
  {
    accessors: true,
    dependencies: [
      CurrentJobsActor.Default,
      JobsAuthorization.Default,
      JobsRepositoriesLive,
    ],
    effect: Effect.gen(function* ConfigurationServiceLive() {
      const authorization = yield* JobsAuthorization;
      const configurationRepository = yield* ConfigurationRepository;
      const currentJobsActor = yield* CurrentJobsActor;
      const rateCardsRepository = yield* RateCardsRepository;

      const loadActor = Effect.fn("ConfigurationService.loadActor")(
        function* () {
          return yield* currentJobsActor
            .get()
            .pipe(mapActorResolutionErrorsToAccessDenied());
        }
      );

      const listServiceAreas = Effect.fn(
        "ConfigurationService.listServiceAreas"
      )(function* () {
        const actor = yield* loadActor();
        yield* authorization.ensureCanManageConfiguration(actor);

        const items = yield* configurationRepository
          .listServiceAreas(actor.organizationId)
          .pipe(Effect.catchTag("SqlError", failConfigurationStorageError));

        return { items } as const;
      });

      const createServiceArea = Effect.fn(
        "ConfigurationService.createServiceArea"
      )(function* (input: CreateServiceAreaInput) {
        const actor = yield* loadActor();
        yield* authorization.ensureCanManageConfiguration(actor);

        return yield* configurationRepository
          .createServiceArea({
            description: input.description,
            name: input.name,
            organizationId: actor.organizationId,
          })
          .pipe(Effect.catchTag("SqlError", failConfigurationStorageError));
      });

      const updateServiceArea = Effect.fn(
        "ConfigurationService.updateServiceArea"
      )(function* (
        serviceAreaId: ServiceAreaId,
        input: UpdateServiceAreaInput
      ) {
        const actor = yield* loadActor();
        yield* authorization.ensureCanManageConfiguration(actor);

        return yield* configurationRepository
          .updateServiceArea(actor.organizationId, serviceAreaId, input)
          .pipe(Effect.catchTag("SqlError", failConfigurationStorageError));
      });

      const listRateCards = Effect.fn("ConfigurationService.listRateCards")(
        function* () {
          const actor = yield* loadActor();
          yield* authorization.ensureCanManageConfiguration(actor);

          const items = yield* rateCardsRepository
            .list(actor.organizationId)
            .pipe(Effect.catchTag("SqlError", failConfigurationStorageError));

          return { items } as const;
        }
      );

      const createRateCard = Effect.fn("ConfigurationService.createRateCard")(
        function* (input: CreateRateCardInput) {
          const actor = yield* loadActor();
          yield* authorization.ensureCanManageConfiguration(actor);

          return yield* rateCardsRepository
            .create({
              lines: input.lines,
              name: input.name,
              organizationId: actor.organizationId,
            })
            .pipe(Effect.catchTag("SqlError", failConfigurationStorageError));
        }
      );

      const updateRateCard = Effect.fn("ConfigurationService.updateRateCard")(
        function* (rateCardId: RateCardId, input: UpdateRateCardInput) {
          const actor = yield* loadActor();
          yield* authorization.ensureCanManageConfiguration(actor);

          return yield* rateCardsRepository
            .update(actor.organizationId, rateCardId, input)
            .pipe(Effect.catchTag("SqlError", failConfigurationStorageError));
        }
      );

      return {
        createRateCard,
        createServiceArea,
        listRateCards,
        listServiceAreas,
        updateRateCard,
        updateServiceArea,
      };
    }),
  }
) {}

function failConfigurationStorageError(
  error: unknown
): Effect.Effect<never, JobStorageError> {
  return Effect.fail(
    new JobStorageError({
      cause: error instanceof Error ? error.message : String(error),
      message: "Jobs configuration storage operation failed",
    })
  );
}
