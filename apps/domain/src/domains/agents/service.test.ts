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
import {
  decodeUserPreferences,
  OrganizationId,
  ProductActorId,
  UserId,
  UserPreferencesStorageError,
} from "@ceird/identity-core";
import { describe, expect, it } from "@effect/vitest";
import { EffectDrizzleQueryError } from "drizzle-orm/effect-core";
import { Cause, Effect, Exit, Layer, Option, Schema } from "effect";
import { HttpServerRequest } from "effect/unstable/http";
import { SqlClient } from "effect/unstable/sql";
import type { SqlError } from "effect/unstable/sql";

import { DomainDrizzle } from "../../platform/database/database.js";
import {
  configProviderFromMap,
  withConfigProvider,
} from "../../test/effect-test-helpers.js";
import {
  ActivityEventsRepository,
  ProductActivityActorsRepository,
} from "../activity/repository.js";
import type { RecordActivityEventInput } from "../activity/repository.js";
import { CommentsRepository } from "../comments/repository.js";
import { UserPreferencesRepository } from "../identity/preferences/repository.js";
import { JobsActivityRecorder } from "../jobs/activity-recorder.js";
import { JobsAuthorization } from "../jobs/authorization.js";
import {
  ContactsRepository,
  JobLabelAssignmentsRepository,
  JobsRepository,
} from "../jobs/repositories.js";
import { LabelsRepository } from "../labels/repositories.js";
import { OrganizationAuthorization } from "../organizations/authorization.js";
import { CurrentOrganizationActor } from "../organizations/current-actor.js";
import type { OrganizationActor } from "../organizations/current-actor.js";
import { OrganizationAuthorizationDeniedError } from "../organizations/errors.js";
import { SiteLocationProvider } from "../sites/location-provider.js";
import {
  SiteLabelAssignmentsRepository,
  SitesRepository,
} from "../sites/repositories.js";
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
const decodeProductActorId = Schema.decodeUnknownSync(ProductActorId);
const decodeUserId = Schema.decodeUnknownSync(UserId);

const organizationId = decodeOrganizationId("org_123");
const userId = decodeUserId("user_123");
const threadId = decodeAgentThreadId("11111111-1111-4111-8111-111111111111");
const actionRunId = decodeAgentActionRunId(
  "22222222-2222-4222-8222-222222222222"
);
const productAgentActorId = decodeProductActorId(
  "33333333-3333-4333-8333-333333333333"
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
    const activityEvents: RecordActivityEventInput[] = [];
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
          activityEventsRepository: {
            recordEvent: (input) =>
              Effect.sync(() => {
                activityEvents.push(input);
                return {} as never;
              }),
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
    expect(activityEvents).toStrictEqual([
      expect.objectContaining({
        actorId: productAgentActorId,
        eventType: "agent.product_effect",
        sourceId: actionRunId,
        sourceType: "agent_action_run",
        status: "synced",
        targetId: actionRunId,
        targetType: "agent_action_run",
      }),
    ]);
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

  it("does not include current-location coordinates in proximity action replay keys", async () => {
    let actionCalls = 0;
    let storedInput: BeginAgentActionRunInput["input"] | undefined;
    const firstInput = {
      limit: 10,
      origin: {
        coordinates: { latitude: 53.349_805, longitude: -6.260_31 },
        mode: "current_location",
      },
    };
    const secondInput = {
      limit: 10,
      origin: {
        coordinates: { latitude: 53.4, longitude: -6.3 },
        mode: "current_location",
      },
    };

    const response = await Effect.runPromise(
      runAgentThreadsService(
        Effect.gen(function* () {
          const service = yield* AgentThreadsService;
          const first = yield* service.runAction({
            input: firstInput,
            name: "ceird.jobs.proximity",
            operationId,
            threadId,
          });
          const second = yield* service.runAction({
            input: secondInput,
            name: "ceird.jobs.proximity",
            operationId,
            threadId,
          });

          return { first, second };
        }),
        {
          actions: {
            execute: () =>
              Effect.sync(() => {
                actionCalls += 1;

                return { rows: [] };
              }),
          },
          actionRunsRepository: {
            begin: (input: BeginAgentActionRunInput) =>
              Effect.sync(() => {
                if (storedInput === undefined) {
                  storedInput = input.input;

                  return {
                    inserted: true,
                    run: makeBeginRun(input),
                  };
                }

                return {
                  inserted: false,
                  run: makeBeginRun(
                    {
                      ...input,
                      input: storedInput,
                    },
                    {
                      result: null,
                      status: "succeeded",
                    }
                  ),
                };
              }),
            completeSucceeded: () =>
              Effect.succeed(
                makeActionRun({
                  actionKind: "read",
                  actionName: "ceird.jobs.proximity",
                  result: null,
                  status: "succeeded",
                })
              ),
          },
        }
      )
    );

    expect(response.first).toMatchObject({
      replayed: false,
      result: { rows: [] },
    });
    expect(response.second).toMatchObject({
      replayed: true,
      result: { rows: [] },
    });
    expect(actionCalls).toBe(2);
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

  it("emits idempotent product activity for fresh write action runs", async () => {
    const activityEvents: RecordActivityEventInput[] = [];
    let ensuredAgentActor = 0;
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
            execute: () => Effect.succeed({ labelId: "label_123" }),
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
          },
          activityEventsRepository: {
            recordEvent: (input) =>
              Effect.sync(() => {
                activityEvents.push(input);
                return {} as never;
              }),
          },
          productActivityActorsRepository: {
            ensureAgentThreadActor: (input) =>
              Effect.sync(() => {
                ensuredAgentActor += 1;
                expect(input).toStrictEqual({
                  organizationId,
                  threadId,
                  threadTitle: thread.title,
                  userId,
                });

                return makeProductAgentActorResult();
              }),
          },
        }
      )
    );

    expect(response).toStrictEqual({
      actionRunId,
      replayed: false,
      result: { labelId: "label_123" },
    });
    expect(ensuredAgentActor).toBe(1);
    expect(activityEvents).toStrictEqual([
      expect.objectContaining({
        actorId: productAgentActorId,
        display: {
          summary: "Agent started Create label",
        },
        eventType: "agent.product_effect",
        organizationId,
        sourceId: actionRunId,
        sourceType: "agent_action_run",
        status: "pending",
        targetId: actionRunId,
        targetType: "agent_action_run",
      }),
      expect.objectContaining({
        actorId: productAgentActorId,
        display: {
          summary: "Agent completed Create label",
        },
        eventType: "agent.product_effect",
        organizationId,
        sourceId: actionRunId,
        sourceType: "agent_action_run",
        status: "synced",
        targetId: actionRunId,
        targetType: "agent_action_run",
      }),
    ]);
    expect(JSON.stringify(activityEvents)).not.toContain(userId);
  });

  it("continues fresh write action runs when agent actor projection fails before execution", async () => {
    let actionCalls = 0;
    let completedRuns = 0;
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
              Effect.sync(() => {
                completedRuns += 1;

                return makeActionRun({
                  id: completedActionRunId,
                  result,
                  status: "succeeded",
                });
              }),
          },
          activityEventsRepository: {
            recordEvent: () =>
              Effect.die("Actor projection failure should skip events"),
          },
          productActivityActorsRepository: {
            ensureAgentThreadActor: () => Effect.fail(makeSqlError()),
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
    expect(completedRuns).toBe(1);
  });

  it("continues fresh write action runs when pending activity projection fails before execution", async () => {
    let actionCalls = 0;
    let completedRuns = 0;
    let recordCalls = 0;
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
              Effect.sync(() => {
                completedRuns += 1;

                return makeActionRun({
                  id: completedActionRunId,
                  result,
                  status: "succeeded",
                });
              }),
          },
          activityEventsRepository: {
            recordEvent: () => {
              recordCalls += 1;

              if (recordCalls === 1) {
                return Effect.fail(makeSqlError());
              }

              return Effect.succeed({} as never);
            },
          },
          productActivityActorsRepository: {
            ensureAgentThreadActor: () =>
              Effect.succeed(makeProductAgentActorResult()),
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
    expect(completedRuns).toBe(1);
    expect(recordCalls).toBe(2);
  });

  it("returns successful fresh write results when final activity projection fails after terminal completion", async () => {
    let completedRuns = 0;
    let recordCalls = 0;
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
            execute: () => Effect.succeed({ labelId: "label_123" }),
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
              Effect.sync(() => {
                completedRuns += 1;

                return makeActionRun({
                  id: completedActionRunId,
                  result,
                  status: "succeeded",
                });
              }),
          },
          activityEventsRepository: {
            recordEvent: () => {
              recordCalls += 1;

              if (recordCalls === 2) {
                return Effect.fail(makeSqlError());
              }

              return Effect.succeed({} as never);
            },
          },
          productActivityActorsRepository: {
            ensureAgentThreadActor: () =>
              Effect.succeed(makeProductAgentActorResult()),
          },
        }
      )
    );

    expect(response).toStrictEqual({
      actionRunId,
      replayed: false,
      result: { labelId: "label_123" },
    });
    expect(completedRuns).toBe(1);
    expect(recordCalls).toBe(2);
  });

  it("emits failed product activity for fresh failed write action runs", async () => {
    const activityEvents: RecordActivityEventInput[] = [];
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
              Effect.succeed(
                makeActionRun({
                  errorMessage: message,
                  id: completedActionRunId,
                  result,
                  status: "failed",
                })
              ),
          },
          activityEventsRepository: {
            recordEvent: (input) =>
              Effect.sync(() => {
                activityEvents.push(input);
                return {} as never;
              }),
          },
          productActivityActorsRepository: {
            ensureAgentThreadActor: () =>
              Effect.succeed(makeProductAgentActorResult()),
          },
        }
      )
    );

    expect(error).toBeInstanceOf(AgentAccessDeniedError);
    expect(activityEvents).toStrictEqual([
      expect.objectContaining({
        display: {
          summary: "Agent started Create label",
        },
        status: "pending",
      }),
      expect.objectContaining({
        display: {
          detail: "No access",
          summary: "Agent failed Create label",
        },
        status: "failed",
      }),
    ]);
  });

  it("keeps read action runs out of product activity", async () => {
    let ensuredAgentActor = 0;
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
            execute: () => Effect.succeed({ labels: [] }),
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
          activityEventsRepository: {
            recordEvent: () =>
              Effect.die("Read actions must not emit product activity"),
          },
          productActivityActorsRepository: {
            ensureAgentThreadActor: () =>
              Effect.sync(() => {
                ensuredAgentActor += 1;
                return makeProductAgentActorResult();
              }),
          },
        }
      )
    );

    expect(response).toStrictEqual({
      actionRunId,
      replayed: false,
      result: { labels: [] },
    });
    expect(ensuredAgentActor).toBe(0);
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

  it("maps Drizzle label action failures to agent storage errors", async () => {
    const error = await Effect.runPromise(
      runAgentActions(
        Effect.gen(function* () {
          const actions = yield* AgentActions;

          return yield* actions
            .execute(actor, "ceird.labels.create", { name: "Plumbing" })
            .pipe(Effect.flip);
        }),
        {
          labelsRepository: {
            create: () => Effect.fail(makeEffectDrizzleQueryError()),
          },
        }
      )
    );

    expect(error).toBeInstanceOf(AgentStorageError);
    expect(error).toMatchObject({
      message: "Agent action storage operation failed",
      operation: "action.execute",
    });
    expect(error.cause).toContain("EffectDrizzleQueryError");
  });

  it("validates internal current-location access for an enabled thread owner", async () => {
    const response = await Effect.runPromise(
      runAgentThreadsService(
        Effect.gen(function* () {
          const service = yield* AgentThreadsService;

          return yield* service.validateCurrentLocationAccess(threadId);
        })
      )
    );

    expect(response).toStrictEqual({ allowed: true });
  });

  it("denies internal current-location access when the thread owner preference is disabled", async () => {
    const error = await Effect.runPromise(
      runAgentThreadsService(
        Effect.gen(function* () {
          const service = yield* AgentThreadsService;

          return yield* service
            .validateCurrentLocationAccess(threadId)
            .pipe(Effect.flip);
        }),
        {
          userPreferencesRepository: {
            get: () =>
              Effect.succeed(
                decodeUserPreferences({
                  routeProximityLocationEnabled: false,
                  updatedAt: "2026-05-20T10:00:00.000Z",
                })
              ),
          },
        }
      )
    );

    expect(error).toBeInstanceOf(AgentAccessDeniedError);
    expect(error.message).toBe(
      "Current location access is disabled for this user."
    );
  });

  it("fails closed when current-location access cannot be verified", async () => {
    const error = await Effect.runPromise(
      runAgentThreadsService(
        Effect.gen(function* () {
          const service = yield* AgentThreadsService;

          return yield* service
            .validateCurrentLocationAccess(threadId)
            .pipe(Effect.flip);
        }),
        {
          userPreferencesRepository: {
            get: () =>
              Effect.fail(
                new UserPreferencesStorageError({
                  message: "Preferences unavailable",
                })
              ),
          },
        }
      )
    );

    expect(error).toBeInstanceOf(AgentAccessDeniedError);
    expect(error.message).toBe(
      "Current location access could not be verified."
    );
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

function runAgentActions<Value, Error>(
  effect: Effect.Effect<
    Value,
    Error,
    AgentActions | HttpServerRequest.HttpServerRequest
  >,
  options: AgentActionsTestOptions = {}
): Effect.Effect<Value, Error, never> {
  return effect.pipe(
    Effect.provide(AgentActions.DefaultWithoutDependencies),
    Effect.provide(makeAgentActionsTestLayer(options))
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
      ActivityEventsRepository,
      ActivityEventsRepository.of({
        recordEvent: () => Effect.succeed({} as never),
        ...options.activityEventsRepository,
      } as unknown as ContextService<typeof ActivityEventsRepository>)
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
      ProductActivityActorsRepository,
      ProductActivityActorsRepository.of({
        ensureAgentThreadActor: () =>
          Effect.succeed(makeProductAgentActorResult()),
        ...options.productActivityActorsRepository,
      } as unknown as ContextService<typeof ProductActivityActorsRepository>)
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
    ),
    Layer.succeed(
      UserPreferencesRepository,
      UserPreferencesRepository.of({
        get: () =>
          Effect.succeed(
            decodeUserPreferences({
              routeProximityLocationEnabled: true,
              updatedAt: "2026-05-20T10:00:00.000Z",
            })
          ),
        update: () => Effect.die("Unexpected UserPreferencesRepository.update"),
        ...options.userPreferencesRepository,
      } as unknown as ContextService<typeof UserPreferencesRepository>)
    )
  );
}

function makeAgentActionsTestLayer(options: AgentActionsTestOptions) {
  return Layer.mergeAll(
    makeUnusedDomainDrizzleLayer(),
    makeUnusedSqlClientLayer(),
    Layer.succeed(
      CommentsRepository,
      {} as ContextService<typeof CommentsRepository>
    ),
    Layer.succeed(
      ContactsRepository,
      {} as ContextService<typeof ContactsRepository>
    ),
    Layer.succeed(
      JobLabelAssignmentsRepository,
      {} as ContextService<typeof JobLabelAssignmentsRepository>
    ),
    Layer.succeed(
      JobsActivityRecorder,
      {} as ContextService<typeof JobsActivityRecorder>
    ),
    Layer.succeed(
      JobsAuthorization,
      {} as ContextService<typeof JobsAuthorization>
    ),
    Layer.succeed(JobsRepository, {} as ContextService<typeof JobsRepository>),
    Layer.succeed(
      LabelsRepository,
      LabelsRepository.of({
        create: () => Effect.die("Unexpected LabelsRepository.create"),
        ...options.labelsRepository,
      } as unknown as ContextService<typeof LabelsRepository>)
    ),
    Layer.succeed(
      OrganizationAuthorization,
      OrganizationAuthorization.of({
        ensureCanCreateSite: () => Effect.void,
        ensureCanManageConfiguration: () => Effect.void,
        ensureCanManageLabels: () => Effect.void,
        ensureCanViewOrganizationData: () => Effect.void,
        ensureCanViewOrganizationSecurityActivity: () => Effect.void,
        ...options.organizationAuthorization,
      } as unknown as ContextService<typeof OrganizationAuthorization>)
    ),
    Layer.succeed(HttpServerRequest.HttpServerRequest, {
      headers: new Headers({
        authorization: "Bearer agent-secret",
      }),
    } as unknown as HttpServerRequest.HttpServerRequest),
    Layer.succeed(
      SiteLocationProvider,
      {} as ContextService<typeof SiteLocationProvider>
    ),
    Layer.succeed(
      SiteLabelAssignmentsRepository,
      {} as ContextService<typeof SiteLabelAssignmentsRepository>
    ),
    Layer.succeed(
      SitesRepository,
      {} as ContextService<typeof SitesRepository>
    ),
    Layer.succeed(
      UserPreferencesRepository,
      {} as ContextService<typeof UserPreferencesRepository>
    )
  );
}

function makeUnusedSqlClientLayer() {
  return Layer.succeed(
    SqlClient.SqlClient,
    new Proxy(
      {},
      {
        get: (_target, property) => {
          throw new Error(
            `SqlClient.${String(property)} should not be called in AgentActions unit tests`
          );
        },
      }
    ) as unknown as SqlClient.SqlClient
  );
}

function makeUnusedDomainDrizzleLayer() {
  return Layer.succeed(
    DomainDrizzle,
    DomainDrizzle.of({
      db: new Proxy(
        {},
        {
          get: (_target, property) => {
            throw new Error(
              `DomainDrizzle.${String(property)} should not be called in AgentActions unit tests`
            );
          },
        }
      ) as never,
    })
  );
}

interface AgentThreadsServiceTestOptions {
  readonly actions?: Partial<ContextService<typeof AgentActions>>;
  readonly actionRunsRepository?: Partial<
    ContextService<typeof AgentActionRunsRepository>
  >;
  readonly activityEventsRepository?: Partial<
    ContextService<typeof ActivityEventsRepository>
  >;
  readonly productActivityActorsRepository?: Partial<
    ContextService<typeof ProductActivityActorsRepository>
  >;
  readonly threadsRepository?: Partial<
    ContextService<typeof AgentThreadsRepository>
  >;
  readonly organizationAuthorization?: Partial<
    ContextService<typeof OrganizationAuthorization>
  >;
  readonly userPreferencesRepository?: Partial<
    ContextService<typeof UserPreferencesRepository>
  >;
}

interface AgentActionsTestOptions {
  readonly labelsRepository?: Partial<ContextService<typeof LabelsRepository>>;
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

function makeEffectDrizzleQueryError(): EffectDrizzleQueryError {
  return new EffectDrizzleQueryError({
    cause: new Error("database unavailable"),
    params: [],
    query: "insert into label ...",
  });
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

function makeProductAgentActorResult() {
  return {
    actor: {
      displayDetail: "Agent product action",
      displayName: "Ceird agent",
      id: productAgentActorId,
      kind: "agent",
    },
    sourceAgentThreadId: threadId,
    sourceUserId: userId,
  } as const;
}
