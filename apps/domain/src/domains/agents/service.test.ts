import {
  AgentActionOperationId,
  AgentActionRejectedError,
  AgentActionRunId,
  AgentThreadId,
  buildAgentInstanceName,
} from "@ceird/agents-core";
import type { AgentThread } from "@ceird/agents-core";
import { OrganizationId, UserId } from "@ceird/identity-core";
import { HttpServerRequest } from "@effect/platform";
import { describe, expect, it } from "@effect/vitest";
import { ConfigProvider, Effect, Layer, Option, Schema } from "effect";

import { OrganizationAuthorization } from "../organizations/authorization.js";
import { CurrentOrganizationActor } from "../organizations/current-actor.js";
import type { OrganizationActor } from "../organizations/current-actor.js";
import { AgentActions } from "./actions.js";
import {
  AgentActionRunsRepository,
  AgentThreadsRepository,
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
      message:
        "Agent action operation id was already used for a different request",
      name: "ceird.labels.create",
    });
    expect(actionCalls).toBe(0);
  });
});

function runAgentThreadsService<Value, Error>(
  effect: Effect.Effect<
    Value,
    Error,
    AgentThreadsService | HttpServerRequest.HttpServerRequest
  >,
  options: AgentThreadsServiceTestOptions = {}
): Effect.Effect<Value, Error, never> {
  return effect.pipe(
    Effect.provide(AgentThreadsService.DefaultWithoutDependencies),
    Effect.provide(makeAgentThreadsServiceTestLayer(options)),
    Effect.withConfigProvider(
      ConfigProvider.fromMap(
        new Map([["AGENT_INTERNAL_SECRET", "agent-secret"]])
      )
    )
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
      CurrentOrganizationActor.make({
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
}

type ContextService<Service> = Service extends {
  of: (service: infer Value) => unknown;
}
  ? Value
  : never;
