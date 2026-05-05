import { JobStorageError } from "@ceird/jobs-core";
import type {
  CreateRateCardInput,
  RateCardIdType as RateCardId,
  UpdateRateCardInput,
} from "@ceird/jobs-core";
import { Effect } from "effect";

import { CurrentOrganizationActor } from "../organizations/current-actor.js";
import { mapActorResolutionErrorsToAccessDenied } from "./actor-access.js";
import { JobsAuthorization } from "./authorization.js";
import { JobsRepositoriesLive, RateCardsRepository } from "./repositories.js";

export class ConfigurationService extends Effect.Service<ConfigurationService>()(
  "@ceird/domains/jobs/ConfigurationService",
  {
    accessors: true,
    dependencies: [
      CurrentOrganizationActor.Default,
      JobsAuthorization.Default,
      JobsRepositoriesLive,
    ],
    effect: Effect.gen(function* ConfigurationServiceLive() {
      const authorization = yield* JobsAuthorization;
      const currentOrganizationActor = yield* CurrentOrganizationActor;
      const rateCardsRepository = yield* RateCardsRepository;

      const loadActor = Effect.fn("ConfigurationService.loadActor")(
        function* () {
          return yield* currentOrganizationActor
            .get()
            .pipe(mapActorResolutionErrorsToAccessDenied());
        }
      );

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
        listRateCards,
        updateRateCard,
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
