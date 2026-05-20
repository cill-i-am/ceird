import {
  AgentAccessDeniedError,
  AgentActionRejectedError,
  AgentStorageError,
  AgentThreadNotFoundError,
  AGENT_THREAD_LIST_DEFAULT_LIMIT,
  getAgentActionKind,
  timingSafeEqual,
} from "@ceird/agents-core";
import type {
  AgentActionName,
  AgentActionRunId,
  AgentActionRunStatus,
  AgentStorageOperation,
  AgentThreadListQuery,
  AgentThreadId,
  CreateAgentThreadInput,
  RunAgentActionInput,
  RunAgentActionResponse,
} from "@ceird/agents-core";
import { HttpServerRequest } from "@effect/platform";
import { Config, Effect, Either, Option } from "effect";

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

const AgentRuntimeConfig = Config.all({
  connectTokenTtlSeconds: Config.integer(
    "AGENT_CONNECT_TOKEN_TTL_SECONDS"
  ).pipe(Config.withDefault(300)),
  internalSecret: Config.string("AGENT_INTERNAL_SECRET"),
}).pipe(Effect.orDie);

export class AgentThreadsService extends Effect.Service<AgentThreadsService>()(
  "@ceird/domains/agents/AgentThreadsService",
  {
    accessors: true,
    dependencies: [
      AgentActions.Default,
      AgentActionRunsRepository.Default,
      AgentThreadsRepository.Default,
      CurrentOrganizationActor.Default,
      OrganizationAuthorization.Default,
    ],
    effect: Effect.gen(function* AgentThreadsServiceLive() {
      const actions = yield* AgentActions;
      const actionRunsRepository = yield* AgentActionRunsRepository;
      const actor = yield* CurrentOrganizationActor;
      const authorization = yield* OrganizationAuthorization;
      const config = yield* AgentRuntimeConfig;
      const threadsRepository = yield* AgentThreadsRepository;

      const loadActor = Effect.fn("AgentThreadsService.loadActor")(
        function* () {
          return yield* actor
            .get()
            .pipe(
              mapAgentActorErrors,
              Effect.catchTag(
                ORGANIZATION_ACTOR_STORAGE_ERROR_TAG,
                failStorage("action.run")
              )
            );
        }
      );

      const list = Effect.fn("AgentThreadsService.list")(function* (
        query: AgentThreadListQuery
      ) {
        const currentActor = yield* loadActor();
        yield* authorization
          .ensureCanViewOrganizationData(currentActor)
          .pipe(Effect.mapError(mapAuthorizationDenied));

        const items = yield* threadsRepository
          .listForUser(currentActor.organizationId, currentActor.userId, {
            limit: query.limit ?? AGENT_THREAD_LIST_DEFAULT_LIMIT,
          })
          .pipe(Effect.catchTag("SqlError", failStorage("thread.list")));

        return { items } as const;
      });

      const create = Effect.fn("AgentThreadsService.create")(function* (
        input: CreateAgentThreadInput
      ) {
        const currentActor = yield* loadActor();
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

        return { item } as const;
      });

      const archive = Effect.fn("AgentThreadsService.archive")(function* (
        threadId: AgentThreadId
      ) {
        const currentActor = yield* loadActor();
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
        const currentActor = yield* loadActor();
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

        const token = yield* Effect.promise(() =>
          signAgentConnectToken({
            agentInstanceName: thread.agentInstanceName,
            secret: config.internalSecret,
            ttlSeconds: config.connectTokenTtlSeconds,
          })
        );

        return {
          agentInstanceName: thread.agentInstanceName,
          token,
        } as const;
      });

      const touchActivity = Effect.fn("AgentThreadsService.touchActivity")(
        function* (threadId: AgentThreadId) {
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

          if (!begin.inserted) {
            if (isReExecutableReadReplay(begin.run)) {
              const replayed = yield* actions
                .execute(threadActor.actor, input.name, input.input)
                .pipe(Effect.either);

              return replayedReadResultToOutcome(replayed, {
                actionRunId: begin.run.id,
                replayed: true,
              });
            }

            const replayed = yield* replayActionRun(begin.run.status, {
              actionRunId: begin.run.id,
              message: begin.run.errorMessage,
              name: begin.run.actionName,
              result: begin.run.result,
            }).pipe(Effect.either);

            return actionRunResultToOutcome(replayed);
          }

          const result = yield* actions
            .execute(threadActor.actor, input.name, input.input)
            .pipe(Effect.either);

          if (Either.isRight(result)) {
            const completed = yield* actionRunsRepository
              .completeSucceeded(begin.run.id, result.right, {
                storeResult: actionKind !== "read",
              })
              .pipe(Effect.catchTag("SqlError", failStorage("action.run")));

            return succeedActionRun({
              actionRunId: completed.id,
              replayed: false,
              result: result.right,
            });
          }

          yield* actionRunsRepository
            .completeFailed(begin.run.id, result.left.message)
            .pipe(Effect.catchTag("SqlError", failStorage("action.run")));

          return rejectActionRun(result.left);
        });
        const outcome =
          actionKind === "read"
            ? yield* runActionOnce
            : yield* actionRunsRepository
                .withTransaction(runActionOnce)
                .pipe(Effect.catchTag("SqlError", failStorage("action.run")));

        return yield* finishActionRunOutcome(outcome);
      });

      return {
        archive,
        authorizeConnect,
        create,
        list,
        runAction,
        touchActivity,
      };
    }),
  }
) {}

const mapAgentActorErrors = mapOrganizationActorResolutionErrors(
  (message) => new AgentAccessDeniedError({ message })
);

function mapAuthorizationDenied(error: OrganizationAuthorizationDeniedError) {
  return new AgentAccessDeniedError({ message: error.message });
}

function failStorage(operation: AgentStorageOperation) {
  return (_error: unknown) =>
    Effect.fail(
      new AgentStorageError({
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

function succeedActionRun(response: RunAgentActionResponse): ActionRunOutcome {
  return { _tag: "Succeeded", response };
}

function rejectActionRun(error: ActionRunFailure): ActionRunOutcome {
  return { _tag: "Rejected", error };
}

function actionRunResultToOutcome(
  result: Either.Either<RunAgentActionResponse, ActionRunFailure>
): ActionRunOutcome {
  return Either.isLeft(result)
    ? rejectActionRun(result.left)
    : succeedActionRun(result.right);
}

function replayedReadResultToOutcome(
  result: Either.Either<unknown, ActionRunFailure>,
  context: {
    readonly actionRunId: AgentActionRunId;
    readonly replayed: boolean;
  }
): ActionRunOutcome {
  if (Either.isLeft(result)) {
    return rejectActionRun(result.left);
  }

  return succeedActionRun({
    actionRunId: context.actionRunId,
    replayed: context.replayed,
    result: result.right,
  });
}

function finishActionRunOutcome(outcome: ActionRunOutcome) {
  return outcome._tag === "Succeeded"
    ? Effect.succeed(outcome.response)
    : Effect.fail(outcome.error);
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

const actionInputLedgerTextEncoder = new TextEncoder();

function makeActionInputLedgerValue(
  actionName: AgentActionName,
  input: unknown
) {
  return Effect.gen(function* () {
    const serialized = yield* Effect.try({
      catch: () =>
        new AgentActionRejectedError({
          message: "Agent action input could not be recorded",
          name: actionName,
        }),
      try: () => JSON.stringify(input) ?? "null",
    });
    const bytes = actionInputLedgerTextEncoder.encode(serialized);
    const digest = yield* Effect.tryPromise({
      catch: () =>
        new AgentStorageError({
          message: "Agent storage operation failed",
          operation: "action.run",
        }),
      try: () => crypto.subtle.digest("SHA-256", bytes),
    });

    return {
      byteLength: bytes.byteLength,
      sha256: bytesToHex(new Uint8Array(digest)),
    } as const;
  });
}

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function replayActionRun(
  status: AgentActionRunStatus,
  input: {
    readonly actionRunId: AgentActionRunId;
    readonly message: string | null;
    readonly name: AgentActionName;
    readonly result: unknown;
  }
) {
  switch (status) {
    case "succeeded": {
      return Effect.succeed({
        actionRunId: input.actionRunId,
        replayed: true,
        result: input.result,
      });
    }
    case "failed": {
      return Effect.fail(
        new AgentActionRejectedError({
          message: input.message ?? "Agent action operation already failed",
          name: input.name,
        })
      );
    }
    case "running": {
      return Effect.fail(
        new AgentActionRejectedError({
          message: "Agent action operation is already running",
          name: input.name,
        })
      );
    }
    default: {
      return Effect.fail(
        new AgentActionRejectedError({
          message: `Unsupported agent action status: ${String(status)}`,
          name: input.name,
        })
      );
    }
  }
}
