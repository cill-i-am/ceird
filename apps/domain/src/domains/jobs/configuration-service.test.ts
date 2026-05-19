import {
  JobAccessDeniedError,
  RateCardId,
  RateCardLineId,
} from "@ceird/jobs-core";
import type {
  CreateRateCardInput,
  OrganizationIdType as OrganizationId,
  RateCard,
  RateCardIdType,
  UpdateRateCardInput,
  UserId,
} from "@ceird/jobs-core";
import { HttpServerRequest } from "@effect/platform";
import { Cause, Effect, Exit, Layer, Option, Schema } from "effect";

import { CurrentOrganizationActor } from "../organizations/current-actor.js";
import type { OrganizationActor } from "../organizations/current-actor.js";
import { JobsAuthorization } from "./authorization.js";
import { ConfigurationService } from "./configuration-service.js";
import { RateCardsRepository } from "./repositories.js";

const rateCardId = Schema.decodeUnknownSync(RateCardId)(
  "22222222-2222-4222-8222-222222222222"
);
const rateCardLineId = Schema.decodeUnknownSync(RateCardLineId)(
  "33333333-3333-4333-8333-333333333333"
);
const actorUserId = "44444444-4444-4444-8444-444444444444" as UserId;

const rateCard: RateCard = {
  createdAt: "2026-04-22T10:00:00.000Z",
  id: rateCardId,
  lines: [
    {
      id: rateCardLineId,
      kind: "callout",
      name: "Standard callout",
      position: 1,
      rateCardId,
      unit: "visit",
      value: 125,
    },
  ],
  name: "Standard",
  updatedAt: "2026-04-22T10:00:00.000Z",
};

function makeActor(
  role: OrganizationActor["role"],
  overrides: Partial<OrganizationActor> = {}
): OrganizationActor {
  return {
    organizationId: "org_123" as OrganizationId,
    role,
    userId: actorUserId,
    ...overrides,
  };
}

interface ConfigurationServiceHarness {
  readonly calls: {
    createRateCard: number;
    listRateCards: number;
    updateRateCard: number;
  };
  readonly layer: Layer.Layer<
    ConfigurationService | HttpServerRequest.HttpServerRequest
  >;
}

function makeHarness(
  options: {
    readonly actor?: OrganizationActor;
  } = {}
): ConfigurationServiceHarness {
  const actor = options.actor ?? makeActor("owner");
  const calls = {
    createRateCard: 0,
    listRateCards: 0,
    updateRateCard: 0,
  };

  const rateCardsRepository = RateCardsRepository.make({
    create: (
      input: CreateRateCardInput & {
        readonly organizationId: OrganizationId;
      }
    ) =>
      Effect.sync(() => {
        calls.createRateCard += 1;
        expect(input).toStrictEqual({
          lines: [
            {
              kind: "callout",
              name: "Standard callout",
              position: 1,
              unit: "visit",
              value: 125,
            },
          ],
          name: "Standard",
          organizationId: actor.organizationId,
        });

        return rateCard;
      }),
    list: (organizationId: OrganizationId) =>
      Effect.sync(() => {
        calls.listRateCards += 1;
        expect(organizationId).toBe(actor.organizationId);

        return [rateCard] satisfies readonly RateCard[];
      }),
    update: (
      organizationId: OrganizationId,
      requestedRateCardId: RateCardIdType,
      input: UpdateRateCardInput
    ) =>
      Effect.sync(() => {
        calls.updateRateCard += 1;
        expect(organizationId).toBe(actor.organizationId);
        expect(requestedRateCardId).toBe(rateCardId);
        expect(input).toStrictEqual({ name: "Standard 2026" });

        return {
          ...rateCard,
          name: "Standard 2026",
        };
      }),
  });

  const serviceLayer = Layer.provide(
    ConfigurationService.DefaultWithoutDependencies,
    Layer.mergeAll(
      Layer.succeed(
        CurrentOrganizationActor,
        CurrentOrganizationActor.make({
          get: () => Effect.succeed(actor),
        })
      ),
      Layer.succeed(RateCardsRepository, rateCardsRepository),
      JobsAuthorization.Default
    )
  );

  return {
    calls,
    layer: Layer.mergeAll(
      serviceLayer,
      Layer.succeed(
        HttpServerRequest.HttpServerRequest,
        {} as HttpServerRequest.HttpServerRequest
      )
    ),
  };
}

function runConfigurationService<Value, Error>(
  effect: Effect.Effect<
    Value,
    Error,
    ConfigurationService | HttpServerRequest.HttpServerRequest
  >,
  harness: ConfigurationServiceHarness
) {
  return Effect.runPromise(effect.pipe(Effect.provide(harness.layer)));
}

function runConfigurationServiceExit<Value, Error>(
  effect: Effect.Effect<
    Value,
    Error,
    ConfigurationService | HttpServerRequest.HttpServerRequest
  >,
  harness: ConfigurationServiceHarness
) {
  return Effect.runPromiseExit(effect.pipe(Effect.provide(harness.layer)));
}

function getFailure<Value, Error>(exit: Exit.Exit<Value, Error>) {
  return Exit.isFailure(exit)
    ? Option.getOrUndefined(Cause.failureOption(exit.cause))
    : undefined;
}

describe("configuration service", () => {
  it("lists rate cards for owners", async () => {
    const harness = makeHarness();

    await expect(
      runConfigurationService(
        Effect.gen(function* () {
          const configuration = yield* ConfigurationService;

          return yield* configuration.listRateCards();
        }),
        harness
      )
    ).resolves.toStrictEqual({ items: [rateCard] });

    expect(harness.calls.listRateCards).toBe(1);
  }, 10_000);

  it("lets owners manage rate cards", async () => {
    const harness = makeHarness();

    await expect(
      runConfigurationService(
        Effect.gen(function* () {
          const configuration = yield* ConfigurationService;

          return yield* configuration.createRateCard({
            lines: [
              {
                kind: "callout",
                name: "Standard callout",
                position: 1,
                unit: "visit",
                value: 125,
              },
            ],
            name: "Standard",
          });
        }),
        harness
      )
    ).resolves.toStrictEqual(rateCard);

    await expect(
      runConfigurationService(
        Effect.gen(function* () {
          const configuration = yield* ConfigurationService;

          return yield* configuration.updateRateCard(rateCardId, {
            name: "Standard 2026",
          });
        }),
        harness
      )
    ).resolves.toMatchObject({ name: "Standard 2026" });

    expect(harness.calls.createRateCard).toBe(1);
    expect(harness.calls.updateRateCard).toBe(1);
  }, 10_000);

  it("blocks members from listing or managing configuration", async () => {
    const harness = makeHarness({ actor: makeActor("member") });

    const listRateCardsExit = await runConfigurationServiceExit(
      Effect.gen(function* () {
        const configuration = yield* ConfigurationService;

        return yield* configuration.listRateCards();
      }),
      harness
    );
    const createRateCardExit = await runConfigurationServiceExit(
      Effect.gen(function* () {
        const configuration = yield* ConfigurationService;

        return yield* configuration.createRateCard({
          lines: [],
          name: "Standard",
        });
      }),
      harness
    );

    expect(getFailure(listRateCardsExit)).toBeInstanceOf(JobAccessDeniedError);
    expect(getFailure(createRateCardExit)).toBeInstanceOf(JobAccessDeniedError);
    expect(harness.calls.listRateCards).toBe(0);
    expect(harness.calls.createRateCard).toBe(0);
  }, 10_000);
});
