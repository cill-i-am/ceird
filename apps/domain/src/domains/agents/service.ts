import {
  AgentAccessDeniedError,
  AGENT_ACCESS_DENIED_ERROR_TAG,
  AGENT_ACTION_REJECTED_ERROR_TAG,
  AGENT_ACTIONS_MANIFEST,
  AgentActionRejectedError,
  AgentActionNameSchema,
  AgentStorageOperation,
  AGENT_STORAGE_ERROR_TAG,
  AgentStorageError,
  AgentThreadNotFoundError,
  getAgentActionDefinition,
  AGENT_THREAD_LIST_DEFAULT_LIMIT,
  getAgentActionKind,
  timingSafeEqual,
} from "@ceird/agents-core";
import type {
  AgentActionKind,
  AgentActionName,
  AgentActionRunId,
  AgentActionRunStatus,
  AgentConnectAuthorization,
  AgentInstanceName,
  AgentThreadListQuery,
  AgentThreadId,
  CreateAgentThreadInput,
  PrepareAgentSessionInput,
  RunAgentActionInput,
  RunAgentActionResponse,
} from "@ceird/agents-core";
import type {
  OrganizationId,
  ProductActorId,
  UserId,
} from "@ceird/identity-core";
import { WorkItemId } from "@ceird/jobs-core";
import {
  Config,
  Context,
  Effect,
  Layer,
  Match,
  Option,
  Result,
  Schema,
} from "effect";
import { HttpServerRequest } from "effect/unstable/http";

import {
  ActivityEventsRepository,
  ProductActivityActorsRepository,
} from "../activity/repository.js";
import { UserPreferencesRepository } from "../identity/preferences/repository.js";
import { mapOrganizationActorResolutionErrors } from "../organizations/actor-access.js";
import { OrganizationAuthorization } from "../organizations/authorization.js";
import { CurrentOrganizationActor } from "../organizations/current-actor.js";
import {
  ORGANIZATION_ACTOR_STORAGE_ERROR_TAG,
  ORGANIZATION_AUTHORIZATION_DENIED_ERROR_TAG,
} from "../organizations/errors.js";
import type { OrganizationAuthorizationDeniedError } from "../organizations/errors.js";
import { AgentActions } from "./actions.js";
import { signAgentConnectToken } from "./internal-token.js";
import {
  AgentActionRunsRepository,
  AgentThreadsRepository,
} from "./repositories.js";
import type { AgentActionInputLedgerValue } from "./repositories.js";

const DEFAULT_AGENT_ACTION_RUN_STALE_AFTER_SECONDS = 15 * 60;
const STALE_ACTION_RUN_MESSAGE =
  "Agent action operation timed out before completion";
const ROUTE_PROXIMITY_ACTION_NAMES = new Set<AgentActionName>([
  "ceird.jobs.proximity",
  "ceird.jobs.route_preview",
  "ceird.sites.proximity",
  "ceird.sites.route_preview",
]);

const AgentRuntimeConfig = Config.all({
  actionRunStaleAfterSeconds: Config.int(
    "AGENT_ACTION_RUN_STALE_AFTER_SECONDS"
  ).pipe(
    Config.withDefault(DEFAULT_AGENT_ACTION_RUN_STALE_AFTER_SECONDS),
    Config.mapOrFail(
      decodePositiveIntegerConfig("AGENT_ACTION_RUN_STALE_AFTER_SECONDS")
    )
  ),
  connectTokenTtlSeconds: Config.int("AGENT_CONNECT_TOKEN_TTL_SECONDS").pipe(
    Config.withDefault(300),
    Config.mapOrFail(
      decodePositiveIntegerConfig("AGENT_CONNECT_TOKEN_TTL_SECONDS")
    )
  ),
  internalSecret: Config.string("AGENT_INTERNAL_SECRET"),
}).pipe(Effect.orDie);

export class AgentThreadsService extends Context.Service<AgentThreadsService>()(
  "@ceird/domains/agents/AgentThreadsService",
  {
    make: Effect.gen(function* AgentThreadsServiceLive() {
      const actions = yield* AgentActions;
      const actionRunsRepository = yield* AgentActionRunsRepository;
      const activityEventsRepository = yield* ActivityEventsRepository;
      const actor = yield* CurrentOrganizationActor;
      const authorization = yield* OrganizationAuthorization;
      const config = yield* AgentRuntimeConfig;
      const productActivityActorsRepository =
        yield* ProductActivityActorsRepository;
      const threadsRepository = yield* AgentThreadsRepository;
      const userPreferencesRepository = yield* UserPreferencesRepository;

      const loadActor = Effect.fn("AgentThreadsService.loadActor")(function* (
        operation: AgentStorageOperation
      ) {
        return yield* actor
          .get()
          .pipe(
            mapAgentActorErrors,
            Effect.catchTag(
              ORGANIZATION_ACTOR_STORAGE_ERROR_TAG,
              failStorage(operation)
            )
          );
      });

      const getActions = Effect.fn("AgentThreadsService.getActions")(
        function* () {
          const currentActor = yield* loadActor("action.manifest");
          yield* Effect.annotateCurrentSpan(
            "organizationId",
            currentActor.organizationId
          );
          yield* Effect.annotateCurrentSpan("actorUserId", currentActor.userId);
          yield* Effect.annotateCurrentSpan("actorRole", currentActor.role);
          yield* authorization
            .ensureCanViewOrganizationData(currentActor)
            .pipe(mapAuthorizationDenied);

          return AGENT_ACTIONS_MANIFEST;
        }
      );

      const prepareSession = Effect.fn("AgentThreadsService.prepareSession")(
        function* (input: PrepareAgentSessionInput) {
          const currentActor = yield* loadActor("session.prepare");
          yield* Effect.annotateCurrentSpan(
            "organizationId",
            currentActor.organizationId
          );
          yield* Effect.annotateCurrentSpan("actorUserId", currentActor.userId);
          yield* Effect.annotateCurrentSpan("actorRole", currentActor.role);
          yield* authorization
            .ensureCanViewOrganizationData(currentActor)
            .pipe(mapAuthorizationDenied);

          const thread = yield* threadsRepository
            .getOrCreateCurrent({
              organizationId: currentActor.organizationId,
              title: input.title,
              userId: currentActor.userId,
            })
            .pipe(Effect.mapError(toStorageError("session.prepare")));
          yield* Effect.annotateCurrentSpan("agent.threadId", thread.id);
          const authorizationResponse = yield* signAgentAuthorization({
            agentInstanceName: thread.agentInstanceName,
            config,
            operation: "session.prepare",
          });

          return {
            authorization: authorizationResponse,
            manifest: AGENT_ACTIONS_MANIFEST,
            thread,
            tokenExpiresInSeconds: config.connectTokenTtlSeconds,
          } as const;
        }
      );

      const list = Effect.fn("AgentThreadsService.list")(function* (
        query: AgentThreadListQuery
      ) {
        const currentActor = yield* loadActor("thread.list");
        const limit = query.limit ?? AGENT_THREAD_LIST_DEFAULT_LIMIT;
        yield* Effect.annotateCurrentSpan(
          "organizationId",
          currentActor.organizationId
        );
        yield* Effect.annotateCurrentSpan("actorUserId", currentActor.userId);
        yield* Effect.annotateCurrentSpan("actorRole", currentActor.role);
        yield* Effect.annotateCurrentSpan("agent.threadLimit", limit);
        yield* authorization
          .ensureCanViewOrganizationData(currentActor)
          .pipe(mapAuthorizationDenied);

        const items = yield* threadsRepository
          .listForUser(currentActor.organizationId, currentActor.userId, {
            limit,
          })
          .pipe(Effect.mapError(toStorageError("thread.list")));
        yield* Effect.annotateCurrentSpan("agent.threadCount", items.length);

        return { items } as const;
      });

      const create = Effect.fn("AgentThreadsService.create")(function* (
        input: CreateAgentThreadInput
      ) {
        const currentActor = yield* loadActor("thread.create");
        yield* Effect.annotateCurrentSpan(
          "organizationId",
          currentActor.organizationId
        );
        yield* Effect.annotateCurrentSpan("actorUserId", currentActor.userId);
        yield* Effect.annotateCurrentSpan("actorRole", currentActor.role);
        yield* authorization
          .ensureCanViewOrganizationData(currentActor)
          .pipe(mapAuthorizationDenied);

        const item = yield* threadsRepository
          .create({
            organizationId: currentActor.organizationId,
            title: input.title,
            userId: currentActor.userId,
          })
          .pipe(Effect.mapError(toStorageError("thread.create")));
        yield* Effect.annotateCurrentSpan("agent.threadId", item.id);

        return { item } as const;
      });

      const archive = Effect.fn("AgentThreadsService.archive")(function* (
        threadId: AgentThreadId
      ) {
        const currentActor = yield* loadActor("thread.archive");
        yield* Effect.annotateCurrentSpan("agent.threadId", threadId);
        yield* Effect.annotateCurrentSpan(
          "organizationId",
          currentActor.organizationId
        );
        yield* Effect.annotateCurrentSpan("actorUserId", currentActor.userId);
        yield* Effect.annotateCurrentSpan("actorRole", currentActor.role);
        yield* authorization
          .ensureCanViewOrganizationData(currentActor)
          .pipe(mapAuthorizationDenied);

        const result = yield* threadsRepository
          .archive(currentActor.organizationId, currentActor.userId, threadId)
          .pipe(
            Effect.mapError(toStorageError("thread.archive")),
            Effect.map(Option.getOrUndefined)
          );

        if (result === undefined) {
          return yield* Effect.fail(
            new AgentThreadNotFoundError({
              message: "Agent thread does not exist",
              threadId,
            })
          );
        }

        return { item: result } as const;
      });

      const authorizeConnect = Effect.fn(
        "AgentThreadsService.authorizeConnect"
      )(function* (threadId: AgentThreadId) {
        const currentActor = yield* loadActor("thread.authorizeConnect");
        yield* Effect.annotateCurrentSpan("agent.threadId", threadId);
        yield* Effect.annotateCurrentSpan(
          "organizationId",
          currentActor.organizationId
        );
        yield* Effect.annotateCurrentSpan("actorUserId", currentActor.userId);
        yield* Effect.annotateCurrentSpan("actorRole", currentActor.role);
        yield* authorization
          .ensureCanViewOrganizationData(currentActor)
          .pipe(mapAuthorizationDenied);

        const thread = yield* threadsRepository
          .findActiveForUser(
            currentActor.organizationId,
            currentActor.userId,
            threadId
          )
          .pipe(
            Effect.mapError(toStorageError("thread.authorizeConnect")),
            Effect.map(Option.getOrUndefined)
          );

        if (thread === undefined) {
          return yield* Effect.fail(
            new AgentThreadNotFoundError({
              message: "Agent thread does not exist",
              threadId,
            })
          );
        }

        const authorizationResponse = yield* signAgentAuthorization({
          agentInstanceName: thread.agentInstanceName,
          config,
          operation: "thread.authorizeConnect",
        });

        return authorizationResponse;
      });

      const touchActivity = Effect.fn("AgentThreadsService.touchActivity")(
        function* (threadId: AgentThreadId) {
          yield* Effect.annotateCurrentSpan("agent.threadId", threadId);
          yield* ensureInternalRequest(config.internalSecret);

          const item = yield* threadsRepository
            .touchActivity(threadId)
            .pipe(
              Effect.mapError(toStorageError("thread.touchActivity")),
              Effect.map(Option.getOrUndefined)
            );

          if (item === undefined) {
            return yield* Effect.fail(
              new AgentThreadNotFoundError({
                message: "Agent thread does not exist",
                threadId,
              })
            );
          }

          return { item } as const;
        }
      );

      const validateCurrentLocationAccess = Effect.fn(
        "AgentThreadsService.validateCurrentLocationAccess"
      )(function* (threadId: AgentThreadId) {
        yield* Effect.annotateCurrentSpan("agent.threadId", threadId);
        yield* ensureInternalRequest(config.internalSecret);

        const threadActor = yield* threadsRepository
          .resolveActiveThreadActor(threadId)
          .pipe(
            Effect.mapError(toStorageError("thread.currentLocationAccess")),
            Effect.map(Option.getOrUndefined)
          );

        if (threadActor === undefined) {
          return yield* Effect.fail(
            new AgentThreadNotFoundError({
              message: "Agent thread does not exist",
              threadId,
            })
          );
        }

        const preferences = yield* userPreferencesRepository
          .get(threadActor.actor.userId)
          .pipe(
            Effect.mapError(
              () =>
                new AgentAccessDeniedError({
                  message: "Current location access could not be verified.",
                })
            )
          );

        if (!preferences.routeProximityLocationEnabled) {
          return yield* Effect.fail(
            new AgentAccessDeniedError({
              message: "Current location access is disabled for this user.",
            })
          );
        }

        return { allowed: true } as const;
      });

      const runAction = Effect.fn("AgentThreadsService.runAction")(function* (
        input: RunAgentActionInput
      ) {
        yield* Effect.annotateCurrentSpan("agent.threadId", input.threadId);
        yield* Effect.annotateCurrentSpan(
          "agent.operationId",
          input.operationId
        );
        yield* Effect.annotateCurrentSpan("agent.actionName", input.name);
        yield* ensureInternalRequest(config.internalSecret);

        const threadActor = yield* threadsRepository
          .resolveActiveThreadActor(input.threadId)
          .pipe(
            Effect.mapError(toStorageError("action.run")),
            Effect.map(Option.getOrUndefined)
          );

        if (threadActor === undefined) {
          return yield* Effect.fail(
            new AgentThreadNotFoundError({
              message: "Agent thread does not exist",
              threadId: input.threadId,
            })
          );
        }

        const actionKind = getAgentActionKind(input.name);
        yield* Effect.annotateCurrentSpan("agent.actionKind", actionKind);
        const ledgerInput = yield* makeActionInputLedgerValue(
          input.name,
          input.input
        );
        const runActionOnce = Effect.gen(function* () {
          let productActivityActorId: ProductActorId | undefined;
          const begin = yield* actionRunsRepository
            .begin({
              actionKind,
              actionName: input.name,
              input: ledgerInput,
              operationId: input.operationId,
              organizationId: threadActor.actor.organizationId,
              threadId: input.threadId,
              userId: threadActor.actor.userId,
            })
            .pipe(Effect.catchTag("SqlError", failStorage("action.run")));
          yield* Effect.annotateCurrentSpan("agent.actionRunId", begin.run.id);
          yield* Effect.annotateCurrentSpan(
            "agent.actionRunInserted",
            begin.inserted
          );
          yield* Effect.annotateCurrentSpan(
            "agent.actionRunStatus",
            begin.run.status
          );
          if (begin.inserted && actionKind !== "read") {
            productActivityActorId = yield* resolveAgentProductActivityActorId({
              productActivityActorsRepository,
              threadActor,
            }).pipe(Effect.catchTag("SqlError", failStorage("action.run")));
            yield* recordAgentProductActivityEvent({
              actionName: input.name,
              actorId: productActivityActorId,
              activityEventsRepository,
              organizationId: threadActor.actor.organizationId,
              runId: begin.run.id,
              status: "pending",
            }).pipe(Effect.catchTag("SqlError", failStorage("action.run")));
          }

          if (!begin.inserted) {
            yield* ensureReplayMatchesCurrentRequest(begin.run, {
              actionKind,
              actionName: input.name,
              input: ledgerInput,
            });

            if (isReExecutableReadReplay(begin.run)) {
              const replayed = yield* actions
                .execute(threadActor.actor, input.name, input.input, {
                  threadId: input.threadId,
                })
                .pipe(Effect.result);

              return replayedReadResultToOutcome(replayed, {
                actionRunId: begin.run.id,
                replayed: true,
              });
            }

            if (begin.run.status === "running") {
              const staleResult = yield* failStaleRunningActionRun(
                actionRunsRepository,
                begin.run,
                {
                  staleAfterSeconds: config.actionRunStaleAfterSeconds,
                }
              ).pipe(Effect.catchTag("SqlError", failStorage("action.run")));

              if (staleResult !== undefined) {
                if (
                  staleResult.completed !== undefined &&
                  actionKind !== "read"
                ) {
                  productActivityActorId =
                    yield* resolveAgentProductActivityActorId({
                      productActivityActorsRepository,
                      threadActor,
                    }).pipe(
                      Effect.catchTag("SqlError", failStorage("action.run"))
                    );
                  yield* recordAgentProductActivityEvent({
                    actionName: staleResult.completed.actionName,
                    actorId: productActivityActorId,
                    activityEventsRepository,
                    detail:
                      staleResult.completed.errorMessage ??
                      STALE_ACTION_RUN_MESSAGE,
                    organizationId: staleResult.completed.organizationId,
                    runId: staleResult.completed.id,
                    status: "failed",
                  }).pipe(
                    Effect.catchTag("SqlError", failStorage("action.run"))
                  );
                }

                return staleResult.outcome;
              }
            }

            const replayedActivityStatus = agentActionRunStatusToActivityStatus(
              begin.run.status
            );
            if (replayedActivityStatus !== undefined && actionKind !== "read") {
              productActivityActorId =
                yield* resolveAgentProductActivityActorId({
                  productActivityActorsRepository,
                  threadActor,
                }).pipe(Effect.catchTag("SqlError", failStorage("action.run")));
              yield* recordAgentProductActivityEvent({
                actionName: begin.run.actionName,
                actorId: productActivityActorId,
                activityEventsRepository,
                detail:
                  replayedActivityStatus === "failed"
                    ? (begin.run.errorMessage ?? undefined)
                    : undefined,
                organizationId: threadActor.actor.organizationId,
                runId: begin.run.id,
                status: replayedActivityStatus,
              }).pipe(Effect.catchTag("SqlError", failStorage("action.run")));
            }

            const replayed = yield* replayActionRun(begin.run.status, {
              actionRunId: begin.run.id,
              message: begin.run.errorMessage,
              name: begin.run.actionName,
              result: begin.run.result,
            }).pipe(Effect.result);

            return actionRunResultToOutcome(replayed);
          }

          const result = yield* actions
            .execute(threadActor.actor, input.name, input.input, {
              threadId: input.threadId,
            })
            .pipe(Effect.result);

          if (Result.isSuccess(result)) {
            const completed = yield* actionRunsRepository
              .completeSucceeded(begin.run.id, result.success, {
                storeResult: actionKind !== "read",
              })
              .pipe(Effect.catchTag("SqlError", failStorage("action.run")));
            if (productActivityActorId !== undefined) {
              yield* recordAgentProductActivityEvent({
                actionName: completed.actionName,
                actorId: productActivityActorId,
                activityEventsRepository,
                organizationId: completed.organizationId,
                runId: completed.id,
                status: "synced",
              }).pipe(Effect.catchTag("SqlError", failStorage("action.run")));
            }

            return succeedActionRun({
              actionRunId: completed.id,
              replayed: false,
              result: result.success,
            });
          }

          const completed = yield* actionRunsRepository
            .completeFailed(
              begin.run.id,
              result.failure.message,
              makeActionRunFailureLedgerValue(result.failure)
            )
            .pipe(Effect.catchTag("SqlError", failStorage("action.run")));
          if (productActivityActorId !== undefined) {
            yield* recordAgentProductActivityEvent({
              actionName: completed.actionName,
              actorId: productActivityActorId,
              activityEventsRepository,
              detail: completed.errorMessage ?? result.failure.message,
              organizationId: completed.organizationId,
              runId: completed.id,
              status: "failed",
            }).pipe(Effect.catchTag("SqlError", failStorage("action.run")));
          }

          return rejectActionRun(result.failure);
        });
        const outcome = yield* runActionOnce;

        return yield* finishActionRunOutcome(outcome);
      });

      return {
        archive,
        authorizeConnect,
        create,
        getActions,
        list,
        prepareSession,
        runAction,
        touchActivity,
        validateCurrentLocationAccess,
      };
    }),
  }
) {
  static readonly archive = (
    ...args: Parameters<
      Context.Service.Shape<typeof AgentThreadsService>["archive"]
    >
  ) => AgentThreadsService.use((service) => service.archive(...args));
  static readonly authorizeConnect = (
    ...args: Parameters<
      Context.Service.Shape<typeof AgentThreadsService>["authorizeConnect"]
    >
  ) => AgentThreadsService.use((service) => service.authorizeConnect(...args));
  static readonly create = (
    ...args: Parameters<
      Context.Service.Shape<typeof AgentThreadsService>["create"]
    >
  ) => AgentThreadsService.use((service) => service.create(...args));
  static readonly getActions = (
    ...args: Parameters<
      Context.Service.Shape<typeof AgentThreadsService>["getActions"]
    >
  ) => AgentThreadsService.use((service) => service.getActions(...args));
  static readonly list = (
    ...args: Parameters<
      Context.Service.Shape<typeof AgentThreadsService>["list"]
    >
  ) => AgentThreadsService.use((service) => service.list(...args));
  static readonly prepareSession = (
    ...args: Parameters<
      Context.Service.Shape<typeof AgentThreadsService>["prepareSession"]
    >
  ) => AgentThreadsService.use((service) => service.prepareSession(...args));
  static readonly runAction = (
    ...args: Parameters<
      Context.Service.Shape<typeof AgentThreadsService>["runAction"]
    >
  ) => AgentThreadsService.use((service) => service.runAction(...args));
  static readonly touchActivity = (
    ...args: Parameters<
      Context.Service.Shape<typeof AgentThreadsService>["touchActivity"]
    >
  ) => AgentThreadsService.use((service) => service.touchActivity(...args));
  static readonly validateCurrentLocationAccess = (
    ...args: Parameters<
      Context.Service.Shape<
        typeof AgentThreadsService
      >["validateCurrentLocationAccess"]
    >
  ) =>
    AgentThreadsService.use((service) =>
      service.validateCurrentLocationAccess(...args)
    );
  static readonly DefaultWithoutDependencies = Layer.effect(
    AgentThreadsService,
    AgentThreadsService.make
  );
  static readonly Default = AgentThreadsService.DefaultWithoutDependencies.pipe(
    Layer.provide(
      Layer.mergeAll(
        AgentActions.Default,
        AgentActionRunsRepository.Default,
        AgentThreadsRepository.Default,
        ActivityEventsRepository.Default,
        CurrentOrganizationActor.Default,
        OrganizationAuthorization.Default,
        ProductActivityActorsRepository.Default,
        UserPreferencesRepository.Default
      )
    )
  );
}

const mapAgentActorErrors = mapOrganizationActorResolutionErrors(
  (message) => new AgentAccessDeniedError({ message })
);

function mapAuthorizationDenied<Value, Requirements>(
  effect: Effect.Effect<
    Value,
    OrganizationAuthorizationDeniedError,
    Requirements
  >
): Effect.Effect<Value, AgentAccessDeniedError, Requirements> {
  return effect.pipe(
    Effect.catchTag(ORGANIZATION_AUTHORIZATION_DENIED_ERROR_TAG, (error) =>
      Effect.fail(new AgentAccessDeniedError({ message: error.message }))
    )
  );
}

function failStorage(operation: AgentStorageOperation) {
  return (error: unknown) =>
    Effect.fail(
      new AgentStorageError({
        cause: formatUnknownCause(error),
        message: "Agent storage operation failed",
        operation,
      })
    );
}

function toStorageError(operation: AgentStorageOperation) {
  return (error: unknown) =>
    new AgentStorageError({
      cause: formatUnknownCause(error),
      message: "Agent storage operation failed",
      operation,
    });
}

function signAgentAuthorization(input: {
  readonly agentInstanceName: AgentInstanceName;
  readonly config: {
    readonly connectTokenTtlSeconds: number;
    readonly internalSecret: string;
  };
  readonly operation: AgentStorageOperation;
}): Effect.Effect<AgentConnectAuthorization, AgentStorageError> {
  return Effect.tryPromise({
    catch: (error) =>
      new AgentStorageError({
        cause: formatUnknownCause(error),
        message: "Agent connect token signing failed",
        operation: input.operation,
      }),
    try: () =>
      signAgentConnectToken({
        agentInstanceName: input.agentInstanceName,
        secret: input.config.internalSecret,
        ttlSeconds: input.config.connectTokenTtlSeconds,
      }),
  })
    .pipe(
      Effect.map((token) => ({
        agentInstanceName: input.agentInstanceName,
        token,
      }))
    )
    .pipe(
      Effect.withSpan("AgentThreadsService.signAgentAuthorization", {
        attributes: {
          "agent.tokenTtlSeconds": input.config.connectTokenTtlSeconds,
          operation: input.operation,
        },
      })
    );
}

const ensureInternalRequest = Effect.fn(
  "AgentThreadsService.ensureInternalRequest"
)(function* (secret: string) {
  const request = yield* HttpServerRequest.HttpServerRequest;
  const authorization = new Headers(request.headers).get("authorization");

  if (!timingSafeEqual(authorization ?? "", `Bearer ${secret}`)) {
    return yield* Effect.fail(
      new AgentAccessDeniedError({
        message: "Agent internal authorization failed",
      })
    );
  }
});

type ActionRunFailure =
  | AgentAccessDeniedError
  | AgentActionRejectedError
  | AgentStorageError;

type ActionRunOutcome =
  | {
      readonly _tag: "Succeeded";
      readonly response: RunAgentActionResponse;
    }
  | {
      readonly _tag: "Rejected";
      readonly error: ActionRunFailure;
    };

const ACTION_RUN_FAILURE_LEDGER_TAGS = [
  AGENT_ACCESS_DENIED_ERROR_TAG,
  AGENT_ACTION_REJECTED_ERROR_TAG,
  AGENT_STORAGE_ERROR_TAG,
] as const;
const AgentActionRunFailureLedgerValueSchema = Schema.Struct({
  actionName: Schema.optional(AgentActionNameSchema),
  cause: Schema.optional(Schema.String),
  operation: Schema.optional(AgentStorageOperation),
  tag: Schema.Literals(ACTION_RUN_FAILURE_LEDGER_TAGS),
  workItemId: Schema.optional(WorkItemId),
});
type AgentActionRunFailureLedgerValue = Schema.Schema.Type<
  typeof AgentActionRunFailureLedgerValueSchema
>;
const isAgentActionRunFailureLedgerValue = Schema.is(
  AgentActionRunFailureLedgerValueSchema
);

function succeedActionRun(response: RunAgentActionResponse): ActionRunOutcome {
  return { _tag: "Succeeded", response };
}

function rejectActionRun(error: ActionRunFailure): ActionRunOutcome {
  return { _tag: "Rejected", error };
}

function makeActionRunFailureLedgerValue(
  error: ActionRunFailure
): AgentActionRunFailureLedgerValue {
  if (error instanceof AgentAccessDeniedError) {
    return { tag: AGENT_ACCESS_DENIED_ERROR_TAG };
  }

  if (error instanceof AgentStorageError) {
    return {
      ...(error.cause === undefined ? {} : { cause: error.cause }),
      operation: error.operation,
      tag: AGENT_STORAGE_ERROR_TAG,
    };
  }

  return {
    ...(error.actionName === undefined ? {} : { actionName: error.actionName }),
    ...(error.cause === undefined ? {} : { cause: error.cause }),
    tag: AGENT_ACTION_REJECTED_ERROR_TAG,
    ...(error.workItemId === undefined ? {} : { workItemId: error.workItemId }),
  };
}

function actionRunResultToOutcome(
  result: Result.Result<RunAgentActionResponse, ActionRunFailure>
): ActionRunOutcome {
  return Result.isFailure(result)
    ? rejectActionRun(result.failure)
    : succeedActionRun(result.success);
}

function replayedReadResultToOutcome(
  result: Result.Result<unknown, ActionRunFailure>,
  context: {
    readonly actionRunId: AgentActionRunId;
    readonly replayed: boolean;
  }
): ActionRunOutcome {
  if (Result.isFailure(result)) {
    return rejectActionRun(result.failure);
  }

  return succeedActionRun({
    actionRunId: context.actionRunId,
    replayed: context.replayed,
    result: result.success,
  });
}

function finishActionRunOutcome(outcome: ActionRunOutcome) {
  return outcome._tag === "Succeeded"
    ? Effect.succeed(outcome.response)
    : Effect.fail(outcome.error);
}

function resolveAgentProductActivityActorId(input: {
  readonly productActivityActorsRepository: Context.Service.Shape<
    typeof ProductActivityActorsRepository
  >;
  readonly threadActor: {
    readonly actor: {
      readonly organizationId: OrganizationId;
      readonly userId: UserId;
    };
    readonly thread: {
      readonly id: AgentThreadId;
      readonly title: string;
    };
  };
}) {
  return input.productActivityActorsRepository
    .ensureAgentThreadActor({
      organizationId: input.threadActor.actor.organizationId,
      threadId: input.threadActor.thread.id,
      threadTitle: input.threadActor.thread.title,
      userId: input.threadActor.actor.userId,
    })
    .pipe(Effect.map(({ actor }) => actor.id));
}

function recordAgentProductActivityEvent(input: {
  readonly actionName: AgentActionName;
  readonly activityEventsRepository: Context.Service.Shape<
    typeof ActivityEventsRepository
  >;
  readonly actorId: ProductActorId;
  readonly detail?: string | undefined;
  readonly organizationId: OrganizationId;
  readonly runId: AgentActionRunId;
  readonly status: "failed" | "pending" | "synced";
}) {
  const action = getAgentActionDefinition(input.actionName);

  return input.activityEventsRepository.recordEvent({
    actorId: input.actorId,
    display: {
      ...(input.detail === undefined
        ? {}
        : { detail: formatActivityDisplayText(input.detail, 280) }),
      summary: formatAgentProductActivitySummary(
        action.display.label,
        input.status
      ),
    },
    eventType: "agent.product_effect",
    organizationId: input.organizationId,
    sourceId: input.runId,
    sourceType: "agent_action_run",
    status: input.status,
    targetId: input.runId,
    targetType: "agent_action_run",
  });
}

function agentActionRunStatusToActivityStatus(
  status: AgentActionRunStatus
): "failed" | "synced" | undefined {
  if (status === "succeeded") {
    return "synced";
  }

  if (status === "failed") {
    return "failed";
  }
}

function formatAgentProductActivitySummary(
  actionLabel: string,
  status: "failed" | "pending" | "synced"
): string {
  const prefix = getAgentProductActivitySummaryPrefix(status);

  return `${prefix}${formatActivityDisplayText(
    actionLabel,
    160 - prefix.length
  )}`;
}

function getAgentProductActivitySummaryPrefix(
  status: "failed" | "pending" | "synced"
): string {
  const prefixes = {
    failed: "Agent failed ",
    pending: "Agent started ",
    synced: "Agent completed ",
  } satisfies Record<typeof status, string>;

  return prefixes[status];
}

function formatActivityDisplayText(text: string, maxLength: number): string {
  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, maxLength - 3)}...`;
}

function failStaleRunningActionRun(
  actionRunsRepository: Context.Service.Shape<typeof AgentActionRunsRepository>,
  run: {
    readonly actionName: AgentActionName;
    readonly createdAt: string;
    readonly id: AgentActionRunId;
  },
  options: { readonly staleAfterSeconds: number }
) {
  return Effect.gen(function* () {
    const nowMs = yield* Effect.sync(() => Date.now());
    const ageMs = nowMs - Date.parse(run.createdAt);

    if (Number.isNaN(ageMs) || ageMs < options.staleAfterSeconds * 1000) {
      return;
    }

    yield* Effect.annotateCurrentSpan("agent.actionRunStale", true);
    yield* Effect.annotateCurrentSpan("agent.actionRunAgeMs", ageMs);

    const error = new AgentActionRejectedError({
      actionName: run.actionName,
      message: STALE_ACTION_RUN_MESSAGE,
    });

    const completed = yield* actionRunsRepository.completeFailed(
      run.id,
      error.message,
      makeActionRunFailureLedgerValue(error),
      { staleAfterSeconds: options.staleAfterSeconds }
    );

    if (
      completed.status !== "failed" ||
      completed.errorMessage !== error.message
    ) {
      const replayed = yield* replayActionRun(completed.status, {
        actionRunId: completed.id,
        message: completed.errorMessage,
        name: completed.actionName,
        result: completed.result,
      }).pipe(Effect.result);

      return { outcome: actionRunResultToOutcome(replayed) };
    }

    return { completed, outcome: rejectActionRun(error) };
  });
}

function isReExecutableReadReplay(input: {
  readonly actionKind: string;
  readonly result: unknown;
  readonly status: AgentActionRunStatus;
}) {
  return (
    input.actionKind === "read" &&
    input.status === "succeeded" &&
    input.result === null
  );
}

function ensureReplayMatchesCurrentRequest(
  run: {
    readonly actionKind: AgentActionKind;
    readonly actionName: AgentActionName;
    readonly input: AgentActionInputLedgerValue;
  },
  request: {
    readonly actionKind: AgentActionKind;
    readonly actionName: AgentActionName;
    readonly input: AgentActionInputLedgerValue;
  }
) {
  if (
    run.actionKind === request.actionKind &&
    run.actionName === request.actionName &&
    run.input.byteLength === request.input.byteLength &&
    run.input.sha256 === request.input.sha256
  ) {
    return Effect.void;
  }

  return Effect.fail(
    new AgentActionRejectedError({
      actionName: request.actionName,
      message:
        "Agent action operation id was already used for a different request",
    })
  );
}

const actionInputLedgerTextEncoder = new TextEncoder();

function makeActionInputLedgerValue(
  actionName: AgentActionName,
  input: unknown
) {
  return Effect.gen(function* () {
    const serialized = yield* Effect.try({
      catch: () =>
        new AgentActionRejectedError({
          actionName,
          message: "Agent action input could not be recorded",
        }),
      try: () =>
        JSON.stringify(sanitizeActionInputForLedger(actionName, input)) ??
        "null",
    });
    const bytes = actionInputLedgerTextEncoder.encode(serialized);
    const digest = yield* Effect.tryPromise({
      catch: (error) =>
        new AgentStorageError({
          cause: formatUnknownCause(error),
          message: "Agent storage operation failed",
          operation: "action.run",
        }),
      try: () => crypto.subtle.digest("SHA-256", bytes),
    });

    return {
      byteLength: bytes.byteLength,
      sha256: bytesToHex(new Uint8Array(digest)),
    } satisfies AgentActionInputLedgerValue;
  });
}

function sanitizeActionInputForLedger(
  actionName: AgentActionName,
  input: unknown
): unknown {
  if (!ROUTE_PROXIMITY_ACTION_NAMES.has(actionName)) {
    return input;
  }

  return sanitizeProximityLedgerValue(input);
}

function sanitizeProximityLedgerValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sanitizeProximityLedgerValue);
  }

  if (!isRecord(value)) {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      key,
      key === "origin" && isRecord(entry)
        ? sanitizeProximityOriginForLedger(entry)
        : sanitizeProximityLedgerValue(entry),
    ])
  );
}

function sanitizeProximityOriginForLedger(
  origin: Record<string, unknown>
): Record<string, unknown> {
  return typeof origin.mode === "string" ? { mode: origin.mode } : {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function decodePositiveIntegerConfig(configKey: string) {
  const schema = Schema.Int.check(
    Schema.isGreaterThanOrEqualTo(1, {
      message: `${configKey} must be a positive integer`,
    })
  );

  return (value: number) =>
    Schema.decodeUnknownEffect(schema)(value).pipe(
      Effect.mapError((error) => new Config.ConfigError(error))
    );
}

function replayActionRun(
  status: AgentActionRunStatus,
  input: {
    readonly actionRunId: AgentActionRunId;
    readonly message: string | null;
    readonly name: AgentActionName;
    readonly result: unknown;
  }
): Effect.Effect<RunAgentActionResponse, ActionRunFailure> {
  return Match.value(status).pipe(
    Match.when("succeeded", () =>
      Effect.succeed({
        actionRunId: input.actionRunId,
        replayed: true,
        result: input.result,
      })
    ),
    Match.when("failed", () => replayFailedActionRun(input)),
    Match.when("running", () =>
      Effect.fail(
        new AgentActionRejectedError({
          actionName: input.name,
          message: "Agent action operation is already running",
        })
      )
    ),
    Match.exhaustive
  );
}

function replayFailedActionRun(input: {
  readonly message: string | null;
  readonly name: AgentActionName;
  readonly result: unknown;
}): Effect.Effect<never, ActionRunFailure> {
  const message = input.message ?? "Agent action operation already failed";
  const failure =
    isAgentActionRunFailureLedgerValue(input.result) === true
      ? input.result
      : ({ tag: AGENT_ACTION_REJECTED_ERROR_TAG } as const);

  return Match.value(failure.tag).pipe(
    Match.when(AGENT_ACCESS_DENIED_ERROR_TAG, () =>
      Effect.fail(new AgentAccessDeniedError({ message }))
    ),
    Match.when(AGENT_STORAGE_ERROR_TAG, () =>
      Effect.fail(
        new AgentStorageError({
          ...(failure.cause === undefined ? {} : { cause: failure.cause }),
          message,
          operation: failure.operation ?? "action.execute",
        })
      )
    ),
    Match.when(AGENT_ACTION_REJECTED_ERROR_TAG, () =>
      Effect.fail(
        new AgentActionRejectedError({
          actionName: failure.actionName ?? input.name,
          ...(failure.cause === undefined ? {} : { cause: failure.cause }),
          message,
          ...(failure.workItemId === undefined
            ? {}
            : { workItemId: failure.workItemId }),
        })
      )
    ),
    Match.exhaustive
  );
}

function formatUnknownCause(error: unknown): string {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`;
  }

  return String(error);
}
