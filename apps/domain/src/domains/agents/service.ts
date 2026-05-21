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
  AGENT_THREAD_LIST_DEFAULT_LIMIT,
  getAgentActionKind,
  timingSafeEqual,
} from "@ceird/agents-core";
import type {
  AgentActionKind,
  AgentActionName,
  AgentActionRunId,
  AgentActionRunStatus,
  AgentThreadListQuery,
  AgentThreadId,
  CreateAgentThreadInput,
  RunAgentActionInput,
  RunAgentActionResponse,
} from "@ceird/agents-core";
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

import { mapOrganizationActorResolutionErrors } from "../organizations/actor-access.js";
import { OrganizationAuthorization } from "../organizations/authorization.js";
import { CurrentOrganizationActor } from "../organizations/current-actor.js";
import { ORGANIZATION_ACTOR_STORAGE_ERROR_TAG } from "../organizations/errors.js";
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
    Config.withDefault(300)
  ),
  internalSecret: Config.string("AGENT_INTERNAL_SECRET"),
}).pipe(Effect.orDie);

export class AgentThreadsService extends Context.Service<AgentThreadsService>()(
  "@ceird/domains/agents/AgentThreadsService",
  {
    make: Effect.gen(function* AgentThreadsServiceLive() {
      const actions = yield* AgentActions;
      const actionRunsRepository = yield* AgentActionRunsRepository;
      const actor = yield* CurrentOrganizationActor;
      const authorization = yield* OrganizationAuthorization;
      const config = yield* AgentRuntimeConfig;
      const threadsRepository = yield* AgentThreadsRepository;

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
            .pipe(Effect.mapError(mapAuthorizationDenied));

          return AGENT_ACTIONS_MANIFEST;
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
          .pipe(Effect.mapError(mapAuthorizationDenied));

        const items = yield* threadsRepository
          .listForUser(currentActor.organizationId, currentActor.userId, {
            limit,
          })
          .pipe(Effect.catchTag("SqlError", failStorage("thread.list")));
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
          .pipe(Effect.mapError(mapAuthorizationDenied));

        const item = yield* threadsRepository
          .create({
            organizationId: currentActor.organizationId,
            title: input.title,
            userId: currentActor.userId,
          })
          .pipe(Effect.catchTag("SqlError", failStorage("thread.create")));
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
          .pipe(Effect.mapError(mapAuthorizationDenied));

        const result = yield* threadsRepository
          .archive(currentActor.organizationId, currentActor.userId, threadId)
          .pipe(
            Effect.catchTag("SqlError", failStorage("thread.archive")),
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
          .pipe(Effect.mapError(mapAuthorizationDenied));

        const thread = yield* threadsRepository
          .findActiveForUser(
            currentActor.organizationId,
            currentActor.userId,
            threadId
          )
          .pipe(
            Effect.catchTag("SqlError", failStorage("thread.authorizeConnect")),
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

        const token = yield* Effect.tryPromise({
          catch: (error) =>
            new AgentStorageError({
              cause: formatUnknownCause(error),
              message: "Agent connect token signing failed",
              operation: "thread.authorizeConnect",
            }),
          try: () =>
            signAgentConnectToken({
              agentInstanceName: thread.agentInstanceName,
              secret: config.internalSecret,
              ttlSeconds: config.connectTokenTtlSeconds,
            }),
        });

        return {
          agentInstanceName: thread.agentInstanceName,
          token,
        } as const;
      });

      const touchActivity = Effect.fn("AgentThreadsService.touchActivity")(
        function* (threadId: AgentThreadId) {
          yield* Effect.annotateCurrentSpan("agent.threadId", threadId);
          yield* ensureInternalRequest(config.internalSecret);

          const item = yield* threadsRepository
            .touchActivity(threadId)
            .pipe(
              Effect.catchTag("SqlError", failStorage("thread.touchActivity")),
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
            Effect.catchTag("SqlError", failStorage("action.run")),
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

          if (!begin.inserted) {
            yield* ensureReplayMatchesCurrentRequest(begin.run, {
              actionKind,
              actionName: input.name,
              input: ledgerInput,
            });

            if (isReExecutableReadReplay(begin.run)) {
              const replayed = yield* actions
                .execute(threadActor.actor, input.name, input.input)
                .pipe(Effect.result);

              return replayedReadResultToOutcome(replayed, {
                actionRunId: begin.run.id,
                replayed: true,
              });
            }

            if (begin.run.status === "running") {
              const staleOutcome = yield* failStaleRunningActionRun(
                actionRunsRepository,
                begin.run,
                {
                  staleAfterSeconds: config.actionRunStaleAfterSeconds,
                }
              ).pipe(Effect.catchTag("SqlError", failStorage("action.run")));

              if (staleOutcome !== undefined) {
                return staleOutcome;
              }
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
            .execute(threadActor.actor, input.name, input.input)
            .pipe(Effect.result);

          if (Result.isSuccess(result)) {
            const completed = yield* actionRunsRepository
              .completeSucceeded(begin.run.id, result.success, {
                storeResult: actionKind !== "read",
              })
              .pipe(Effect.catchTag("SqlError", failStorage("action.run")));

            return succeedActionRun({
              actionRunId: completed.id,
              replayed: false,
              result: result.success,
            });
          }

          yield* actionRunsRepository
            .completeFailed(
              begin.run.id,
              result.failure.message,
              makeActionRunFailureLedgerValue(result.failure)
            )
            .pipe(Effect.catchTag("SqlError", failStorage("action.run")));

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
        runAction,
        touchActivity,
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
        CurrentOrganizationActor.Default,
        OrganizationAuthorization.Default
      )
    )
  );
}

const mapAgentActorErrors = mapOrganizationActorResolutionErrors(
  (message) => new AgentAccessDeniedError({ message })
);

function mapAuthorizationDenied(error: OrganizationAuthorizationDeniedError) {
  return new AgentAccessDeniedError({ message: error.message });
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

      return actionRunResultToOutcome(replayed);
    }

    return rejectActionRun(error);
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
      try: () => JSON.stringify(input) ?? "null",
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
