import {
  AgentAccessDeniedError,
  AGENT_ACCESS_DENIED_ERROR_TAG,
  AGENT_ACTION_REJECTED_ERROR_TAG,
  AgentActionOperationId,
  AgentActionRejectedError,
  AgentActionRunId,
  AGENT_STORAGE_ERROR_TAG,
  AgentStorageError,
  AgentThreadId,
  buildAgentInstanceName,
  verifyAgentConnectToken,
} from "@ceird/agents-core";
import type { AgentThread } from "@ceird/agents-core";
import { OrganizationId, UserId } from "@ceird/identity-core";
import { describe, expect, it } from "@effect/vitest";
import { Cause, Effect, Exit, Layer, Option, Schema } from "effect";
import { HttpServerRequest } from "effect/unstable/http";
import type { SqlError } from "effect/unstable/sql";

import {
  configProviderFromMap,
  withConfigProvider,
} from "../../test/effect-test-helpers.js";
import { OrganizationAuthorization } from "../organizations/authorization.js";
import { CurrentOrganizationActor } from "../organizations/current-actor.js";
import type { OrganizationActor } from "../organizations/current-actor.js";
import { OrganizationAuthorizationDeniedError } from "../organizations/errors.js";
import { AgentActions } from "./actions.js";
import {
  AgentActionRunsRepository,
  AgentThreadsRepository,
} from "./repositories.js";
import type {
  AgentActionRun,
  AgentActionRunBeginProjection,
  BeginAgentActionRunInput,
} from "./repositories.js";
import { AgentThreadsService } from "./service.js";

const decodeAgentActionOperationId = Schema.decodeUnknownSync(
  AgentActionOperationId
);
const decodeAgentActionRunId = Schema.decodeUnknownSync(AgentActionRunId);
const decodeAgentThreadId = Schema.decodeUnknownSync(AgentThreadId);
const decodeOrganizationId = Schema.decodeUnknownSync(OrganizationId);
const decodeUserId = Schema.decodeUnknownSync(UserId);

const organizationId = decodeOrganizationId("org_123");
const userId = decodeUserId("user_123");
const threadId = decodeAgentThreadId("11111111-1111-4111-8111-111111111111");
const actionRunId = decodeAgentActionRunId(
  "22222222-2222-4222-8222-222222222222"
);
const operationId = decodeAgentActionOperationId("tool-call:1");
const actor = {
  organizationId,
  role: "owner",
  userId,
} satisfies OrganizationActor;
const thread = {
  agentInstanceName: buildAgentInstanceName({
    organizationId,
    threadId,
    userId,
  }),
  createdAt: "2026-05-20T10:00:00.000Z",
  id: threadId,
  lastMessageAt: null,
  status: "active",
  title: "Agent thread",
  updatedAt: "2026-05-20T10:00:00.000Z",
} satisfies AgentThread;

describe("agent threads service", () => {
  it("replays successful write operations without executing the action again", async () => {
    let actionCalls = 0;
    const response = await Effect.runPromise(
      runAgentThreadsService(
        Effect.gen(function* () {
          const service = yield* AgentThreadsService;

          return yield* service.runAction({
            input: { name: "Plumbing" },
            name: "ceird.labels.create",
            operationId,
            threadId,
          });
        }),
        {
          actions: {
            execute: () =>
              Effect.sync(() => {
                actionCalls += 1;

                return { shouldNotExecute: true };
              }),
          },
          actionRunsRepository: {
            begin: (input: BeginAgentActionRunInput) =>
              Effect.succeed({
                inserted: false,
                run: makeBeginRun(input, {
                  result: { labelId: "label_123" },
                  status: "succeeded",
                }),
              }),
            withTransaction: <Value, Error, Requirements>(
              effect: Effect.Effect<Value, Error, Requirements>
            ) => effect,
          },
        }
      )
    );

    expect(response).toStrictEqual({
      actionRunId,
      replayed: true,
      result: { labelId: "label_123" },
    });
    expect(actionCalls).toBe(0);
  });

  it("re-executes successful read replays instead of returning a null result", async () => {
    let actionCalls = 0;
    const response = await Effect.runPromise(
      runAgentThreadsService(
        Effect.gen(function* () {
          const service = yield* AgentThreadsService;

          return yield* service.runAction({
            input: {},
            name: "ceird.labels.list",
            operationId,
            threadId,
          });
        }),
        {
          actions: {
            execute: () =>
              Effect.sync(() => {
                actionCalls += 1;

                return { items: [] };
              }),
          },
          actionRunsRepository: {
            begin: (input: BeginAgentActionRunInput) =>
              Effect.succeed({
                inserted: false,
                run: makeBeginRun(input, {
                  result: null,
                  status: "succeeded",
                }),
              }),
          },
        }
      )
    );

    expect(response).toStrictEqual({
      actionRunId,
      replayed: true,
      result: { items: [] },
    });
    expect(actionCalls).toBe(1);
  });

  it("rejects replayed operation ids with different inputs before executing", async () => {
    let actionCalls = 0;
    const error = await Effect.runPromise(
      runAgentThreadsService(
        Effect.gen(function* () {
          const service = yield* AgentThreadsService;

          return yield* service
            .runAction({
              input: { name: "Plumbing" },
              name: "ceird.labels.create",
              operationId,
              threadId,
            })
            .pipe(Effect.flip);
        }),
        {
          actions: {
            execute: () =>
              Effect.sync(() => {
                actionCalls += 1;

                return { shouldNotExecute: true };
              }),
          },
          actionRunsRepository: {
            begin: () =>
              Effect.succeed({
                inserted: false,
                run: {
                  actionKind: "write",
                  actionName: "ceird.labels.create",
                  createdAt: new Date().toISOString(),
                  errorMessage: null,
                  id: actionRunId,
                  input: {
                    byteLength: 999,
                    sha256: "different-input",
                  },
                  operationId,
                  result: { id: "old-result" },
                  status: "succeeded",
                },
              }),
            withTransaction: <Value, Error, Requirements>(
              effect: Effect.Effect<Value, Error, Requirements>
            ) => effect,
          },
        }
      )
    );

    expect(error).toBeInstanceOf(AgentActionRejectedError);
    expect(error).toMatchObject({
      actionName: "ceird.labels.create",
      message:
        "Agent action operation id was already used for a different request",
    });
    expect(actionCalls).toBe(0);
  });

  it("rejects already-running replays without executing the action again", async () => {
    let actionCalls = 0;
    const error = await Effect.runPromise(
      runAgentThreadsService(
        Effect.gen(function* () {
          const service = yield* AgentThreadsService;

          return yield* service
            .runAction({
              input: { name: "Plumbing" },
              name: "ceird.labels.create",
              operationId,
              threadId,
            })
            .pipe(Effect.flip);
        }),
        {
          actions: {
            execute: () =>
              Effect.sync(() => {
                actionCalls += 1;

                return { shouldNotExecute: true };
              }),
          },
          actionRunsRepository: {
            begin: (input: BeginAgentActionRunInput) =>
              Effect.succeed({
                inserted: false,
                run: makeBeginRun(input, { status: "running" }),
              }),
            withTransaction: <Value, Error, Requirements>(
              effect: Effect.Effect<Value, Error, Requirements>
            ) => effect,
          },
        }
      )
    );

    expect(error).toBeInstanceOf(AgentActionRejectedError);
    expect(error).toMatchObject({
      actionName: "ceird.labels.create",
      message: "Agent action operation is already running",
    });
    expect(actionCalls).toBe(0);
  });

  it("fails stale running replays so an abandoned operation becomes terminal", async () => {
    let actionCalls = 0;
    let failedActionRunId: AgentActionRunId | undefined;
    let failureMessage: string | undefined;
    let failureOptions: unknown;
    let failureResult: unknown;
    const error = await Effect.runPromise(
      runAgentThreadsService(
        Effect.gen(function* () {
          const service = yield* AgentThreadsService;

          return yield* service
            .runAction({
              input: { name: "Plumbing" },
              name: "ceird.labels.create",
              operationId,
              threadId,
            })
            .pipe(Effect.flip);
        }),
        {
          actions: {
            execute: () =>
              Effect.sync(() => {
                actionCalls += 1;

                return { shouldNotExecute: true };
              }),
          },
          actionRunsRepository: {
            begin: (input: BeginAgentActionRunInput) =>
              Effect.succeed({
                inserted: false,
                run: makeBeginRun(input, {
                  createdAt: "2020-01-01T00:00:00.000Z",
                  status: "running",
                }),
              }),
            completeFailed: (
              completedActionRunId: AgentActionRunId,
              message: string,
              result: unknown,
              options?: unknown
            ) =>
              Effect.sync(() => {
                failedActionRunId = completedActionRunId;
                failureMessage = message;
                failureOptions = options;
                failureResult = result;

                return makeActionRun({
                  createdAt: "2020-01-01T00:00:00.000Z",
                  errorMessage: message,
                  id: completedActionRunId,
                  result,
                  status: "failed",
                });
              }),
            withTransaction: <Value, Error, Requirements>(
              effect: Effect.Effect<Value, Error, Requirements>
            ) => effect,
          },
        }
      )
    );

    expect(error).toBeInstanceOf(AgentActionRejectedError);
    expect(error).toMatchObject({
      actionName: "ceird.labels.create",
      message: "Agent action operation timed out before completion",
    });
    expect(failedActionRunId).toBe(actionRunId);
    expect(failureMessage).toBe(
      "Agent action operation timed out before completion"
    );
    expect(failureOptions).toStrictEqual({ staleAfterSeconds: 900 });
    expect(failureResult).toStrictEqual({
      actionName: "ceird.labels.create",
      tag: AGENT_ACTION_REJECTED_ERROR_TAG,
    });
    expect(actionCalls).toBe(0);
  });

  it("replays the current terminal run when stale recovery loses a race", async () => {
    let actionCalls = 0;
    const response = await Effect.runPromise(
      runAgentThreadsService(
        Effect.gen(function* () {
          const service = yield* AgentThreadsService;

          return yield* service.runAction({
            input: { name: "Plumbing" },
            name: "ceird.labels.create",
            operationId,
            threadId,
          });
        }),
        {
          actions: {
            execute: () =>
              Effect.sync(() => {
                actionCalls += 1;

                return { shouldNotExecute: true };
              }),
          },
          actionRunsRepository: {
            begin: (input: BeginAgentActionRunInput) =>
              Effect.succeed({
                inserted: false,
                run: makeBeginRun(input, {
                  createdAt: "2020-01-01T00:00:00.000Z",
                  status: "running",
                }),
              }),
            completeFailed: (completedActionRunId: AgentActionRunId) =>
              Effect.succeed(
                makeActionRun({
                  id: completedActionRunId,
                  result: { labelId: "label_123" },
                  status: "succeeded",
                })
              ),
            withTransaction: <Value, Error, Requirements>(
              effect: Effect.Effect<Value, Error, Requirements>
            ) => effect,
          },
        }
      )
    );

    expect(response).toStrictEqual({
      actionRunId,
      replayed: true,
      result: { labelId: "label_123" },
    });
    expect(actionCalls).toBe(0);
  });

  it("does not wrap write action execution in the action-run repository transaction", async () => {
    let actionCalls = 0;
    const response = await Effect.runPromise(
      runAgentThreadsService(
        Effect.gen(function* () {
          const service = yield* AgentThreadsService;

          return yield* service.runAction({
            input: { name: "Plumbing" },
            name: "ceird.labels.create",
            operationId,
            threadId,
          });
        }),
        {
          actions: {
            execute: () =>
              Effect.sync(() => {
                actionCalls += 1;

                return { labelId: "label_123" };
              }),
          },
          actionRunsRepository: {
            begin: (input: BeginAgentActionRunInput) =>
              Effect.succeed({
                inserted: true,
                run: makeBeginRun(input),
              }),
            completeSucceeded: (
              completedActionRunId: AgentActionRunId,
              result: unknown
            ) =>
              Effect.succeed(
                makeActionRun({
                  id: completedActionRunId,
                  result,
                  status: "succeeded",
                })
              ),
            withTransaction: () =>
              Effect.die(
                "Action execution must not run inside the action-run repository transaction"
              ),
          },
        }
      )
    );

    expect(response).toStrictEqual({
      actionRunId,
      replayed: false,
      result: { labelId: "label_123" },
    });
    expect(actionCalls).toBe(1);
  });

  it("passes the current thread id into fresh action execution", async () => {
    let receivedThreadId: AgentThreadId | undefined;
    const response = await Effect.runPromise(
      runAgentThreadsService(
        Effect.gen(function* () {
          const service = yield* AgentThreadsService;

          return yield* service.runAction({
            input: {},
            name: "ceird.labels.list",
            operationId,
            threadId,
          });
        }),
        {
          actions: {
            execute: (_actor, _name, _input, context) =>
              Effect.sync(() => {
                receivedThreadId = context?.threadId;

                return { labels: [] };
              }),
          },
          actionRunsRepository: {
            begin: (input: BeginAgentActionRunInput) =>
              Effect.succeed({
                inserted: true,
                run: makeBeginRun(input),
              }),
            completeSucceeded: (
              completedActionRunId: AgentActionRunId,
              result: unknown
            ) =>
              Effect.succeed(
                makeActionRun({
                  actionKind: "read",
                  actionName: "ceird.labels.list",
                  id: completedActionRunId,
                  result,
                  status: "succeeded",
                })
              ),
          },
        }
      )
    );

    expect(response).toMatchObject({
      replayed: false,
      result: { labels: [] },
    });
    expect(receivedThreadId).toBe(threadId);
  });

  it("preserves the failure category when replaying failed operations", async () => {
    const error = await Effect.runPromise(
      runAgentThreadsService(
        Effect.gen(function* () {
          const service = yield* AgentThreadsService;

          return yield* service
            .runAction({
              input: { name: "Plumbing" },
              name: "ceird.labels.create",
              operationId,
              threadId,
            })
            .pipe(Effect.flip);
        }),
        {
          actionRunsRepository: {
            begin: (input: BeginAgentActionRunInput) =>
              Effect.succeed({
                inserted: false,
                run: makeBeginRun(input, {
                  errorMessage: "Storage was unavailable",
                  result: { tag: AGENT_STORAGE_ERROR_TAG },
                  status: "failed",
                }),
              }),
            withTransaction: <Value, Error, Requirements>(
              effect: Effect.Effect<Value, Error, Requirements>
            ) => effect,
          },
        }
      )
    );

    expect(error).toBeInstanceOf(AgentStorageError);
    expect(error).toMatchObject({
      message: "Storage was unavailable",
      operation: "action.execute",
    });
  });

  it("records the failure category for fresh failed action runs", async () => {
    let failureResult: unknown;
    const error = await Effect.runPromise(
      runAgentThreadsService(
        Effect.gen(function* () {
          const service = yield* AgentThreadsService;

          return yield* service
            .runAction({
              input: { name: "Plumbing" },
              name: "ceird.labels.create",
              operationId,
              threadId,
            })
            .pipe(Effect.flip);
        }),
        {
          actions: {
            execute: () =>
              Effect.fail(new AgentAccessDeniedError({ message: "No access" })),
          },
          actionRunsRepository: {
            begin: (input: BeginAgentActionRunInput) =>
              Effect.succeed({
                inserted: true,
                run: makeBeginRun(input),
              }),
            completeFailed: (
              completedActionRunId: AgentActionRunId,
              message: string,
              result: unknown
            ) =>
              Effect.sync(() => {
                failureResult = result;

                return makeActionRun({
                  errorMessage: message,
                  id: completedActionRunId,
                  result,
                  status: "failed",
                });
              }),
            withTransaction: <Value, Error, Requirements>(
              effect: Effect.Effect<Value, Error, Requirements>
            ) => effect,
          },
        }
      )
    );

    expect(error).toBeInstanceOf(AgentAccessDeniedError);
    expect(failureResult).toStrictEqual({
      tag: AGENT_ACCESS_DENIED_ERROR_TAG,
    });
  });

  it("prepares an idempotent agent session with the current thread, token, and action manifest", async () => {
    let getOrCreateCurrentCalls = 0;
    const response = await Effect.runPromise(
      runAgentThreadsService(
        Effect.gen(function* () {
          const service = yield* AgentThreadsService;

          return yield* service.prepareSession({ title: " Operator desk " });
        }),
        {
          threadsRepository: {
            getOrCreateCurrent: (input) =>
              Effect.sync(() => {
                getOrCreateCurrentCalls += 1;
                expect(input).toStrictEqual({
                  organizationId,
                  title: " Operator desk ",
                  userId,
                });

                return thread;
              }),
          },
        }
      )
    );

    expect(getOrCreateCurrentCalls).toBe(1);
    expect(response.thread).toStrictEqual(thread);
    expect(response.authorization.agentInstanceName).toBe(
      thread.agentInstanceName
    );
    expect(response.authorization.token).toEqual(expect.any(String));
    await expect(
      verifyAgentConnectToken({
        secret: "agent-secret",
        token: response.authorization.token,
      })
    ).resolves.toBe(response.thread.agentInstanceName);
    expect(response.manifest.actions.length).toBeGreaterThan(0);
    expect(response.tokenExpiresInSeconds).toBe(300);
  });

  it("denies prepare-session before creating or authorizing a thread", async () => {
    let getOrCreateCurrentCalls = 0;
    const error = await Effect.runPromise(
      runAgentThreadsService(
        Effect.gen(function* () {
          const service = yield* AgentThreadsService;

          return yield* service
            .prepareSession({ title: "Operator desk" })
            .pipe(Effect.flip);
        }),
        {
          organizationAuthorization: {
            ensureCanViewOrganizationData: () =>
              Effect.fail(
                new OrganizationAuthorizationDeniedError({
                  message: "Cannot view this organization",
                })
              ),
          },
          threadsRepository: {
            getOrCreateCurrent: () =>
              Effect.sync(() => {
                getOrCreateCurrentCalls += 1;

                return thread;
              }),
          },
        }
      )
    );

    expect(error).toBeInstanceOf(AgentAccessDeniedError);
    expect(error.message).toBe("Cannot view this organization");
    expect(getOrCreateCurrentCalls).toBe(0);
  });

  it("maps prepare-session repository failures to agent storage errors", async () => {
    const error = await Effect.runPromise(
      runAgentThreadsService(
        Effect.gen(function* () {
          const service = yield* AgentThreadsService;

          return yield* service
            .prepareSession({ title: "Operator desk" })
            .pipe(Effect.flip);
        }),
        {
          threadsRepository: {
            getOrCreateCurrent: () => Effect.fail(makeSqlError()),
          },
        }
      )
    );

    expect(error).toBeInstanceOf(AgentStorageError);
    expect(error).toMatchObject({
      message: "Agent storage operation failed",
      operation: "session.prepare",
    });
    expect(error.cause).toContain("database unavailable");
  });

  it("rejects non-positive agent connect token TTL config", async () => {
    const exit = await Effect.runPromise(
      runAgentThreadsService(
        Effect.gen(function* () {
          const service = yield* AgentThreadsService;

          return yield* service.prepareSession({ title: "Operator desk" });
        }),
        {},
        new Map([
          ["AGENT_INTERNAL_SECRET", "agent-secret"],
          ["AGENT_CONNECT_TOKEN_TTL_SECONDS", "0"],
        ])
      ).pipe(Effect.exit)
    );

    expect(Exit.isFailure(exit)).toBe(true);
    expect(Exit.isFailure(exit) ? Cause.pretty(exit.cause) : "").toContain(
      "AGENT_CONNECT_TOKEN_TTL_SECONDS must be a positive integer"
    );
  });
});

function runAgentThreadsService<Value, Error>(
  effect: Effect.Effect<
    Value,
    Error,
    AgentThreadsService | HttpServerRequest.HttpServerRequest
  >,
  options: AgentThreadsServiceTestOptions = {},
  configValues = new Map<string, string>([
    ["AGENT_INTERNAL_SECRET", "agent-secret"],
  ])
): Effect.Effect<Value, Error, never> {
  return effect.pipe(
    Effect.provide(AgentThreadsService.DefaultWithoutDependencies),
    Effect.provide(makeAgentThreadsServiceTestLayer(options)),
    withConfigProvider(configProviderFromMap(configValues))
  ) as Effect.Effect<Value, Error, never>;
}

function makeAgentThreadsServiceTestLayer(
  options: AgentThreadsServiceTestOptions
) {
  return Layer.mergeAll(
    Layer.succeed(
      AgentActions,
      AgentActions.of({
        execute: () => Effect.die("Unexpected AgentActions.execute call"),
        ...options.actions,
      } as unknown as ContextService<typeof AgentActions>)
    ),
    Layer.succeed(
      AgentActionRunsRepository,
      AgentActionRunsRepository.of({
        begin: () => Effect.die("Unexpected AgentActionRunsRepository.begin"),
        completeFailed: () =>
          Effect.die("Unexpected AgentActionRunsRepository.completeFailed"),
        completeSucceeded: () =>
          Effect.die("Unexpected AgentActionRunsRepository.completeSucceeded"),
        withTransaction: <Value, Error, Requirements>(
          effect: Effect.Effect<Value, Error, Requirements>
        ) => effect,
        ...options.actionRunsRepository,
      } as unknown as ContextService<typeof AgentActionRunsRepository>)
    ),
    Layer.succeed(
      AgentThreadsRepository,
      AgentThreadsRepository.of({
        resolveActiveThreadActor: () =>
          Effect.succeed(Option.some({ actor, thread })),
        ...options.threadsRepository,
      } as unknown as ContextService<typeof AgentThreadsRepository>)
    ),
    Layer.succeed(
      CurrentOrganizationActor,
      CurrentOrganizationActor.of({
        get: () => Effect.succeed(actor),
      })
    ),
    Layer.succeed(HttpServerRequest.HttpServerRequest, {
      headers: new Headers({
        authorization: "Bearer agent-secret",
      }),
    } as unknown as HttpServerRequest.HttpServerRequest),
    Layer.succeed(
      OrganizationAuthorization,
      OrganizationAuthorization.of({
        ensureCanViewOrganizationData: () => Effect.void,
        ...options.organizationAuthorization,
      } as unknown as ContextService<typeof OrganizationAuthorization>)
    )
  );
}

interface AgentThreadsServiceTestOptions {
  readonly actions?: Partial<ContextService<typeof AgentActions>>;
  readonly actionRunsRepository?: Partial<
    ContextService<typeof AgentActionRunsRepository>
  >;
  readonly threadsRepository?: Partial<
    ContextService<typeof AgentThreadsRepository>
  >;
  readonly organizationAuthorization?: Partial<
    ContextService<typeof OrganizationAuthorization>
  >;
}

function makeSqlError(): SqlError.SqlError {
  return Object.assign(new Error("database unavailable"), {
    _tag: "SqlError" as const,
    cause: "database unavailable",
  }) as unknown as SqlError.SqlError;
}

type ContextService<Service> = Service extends {
  of: (service: infer Value) => unknown;
}
  ? Value
  : never;

function makeBeginRun(
  input: BeginAgentActionRunInput,
  overrides: Partial<AgentActionRunBeginProjection> = {}
): AgentActionRunBeginProjection {
  return {
    actionKind: input.actionKind,
    actionName: input.actionName,
    createdAt: new Date().toISOString(),
    errorMessage: null,
    id: actionRunId,
    input: input.input,
    operationId: input.operationId,
    result: null,
    status: "running",
    ...overrides,
  };
}

function makeActionRun(
  overrides: Partial<AgentActionRun> = {}
): AgentActionRun {
  return {
    actionKind: "write",
    actionName: "ceird.labels.create",
    completedAt: "2026-05-20T10:00:01.000Z",
    createdAt: "2026-05-20T10:00:00.000Z",
    errorMessage: null,
    id: actionRunId,
    input: {
      byteLength: 2,
      sha256: "0".repeat(64),
    },
    operationId,
    organizationId,
    result: null,
    status: "running",
    threadId,
    updatedAt: "2026-05-20T10:00:01.000Z",
    userId,
    ...overrides,
  };
}
