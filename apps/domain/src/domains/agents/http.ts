import { HttpApiBuilder } from "@effect/platform";
import { Effect, Layer } from "effect";

import { AppApi } from "../../http-api.js";
import { observeApiOperation } from "../api-observability.js";
import { DomainCorsLive } from "../http-cors.js";
import { AgentThreadsService } from "./service.js";

const observeAgentsOperation = (operation: string) =>
  observeApiOperation({
    domain: "agents",
    operation,
    service: "AgentThreadsService",
  });

const AgentThreadsHandlersLive = HttpApiBuilder.group(
  AppApi,
  "agentThreads",
  (handlers) =>
    Effect.gen(function* () {
      const agentThreadsService = yield* AgentThreadsService;

      return handlers
        .handle("listAgentThreads", ({ urlParams }) =>
          agentThreadsService
            .list(urlParams)
            .pipe(observeAgentsOperation("listAgentThreads"))
        )
        .handle("createAgentThread", ({ payload }) =>
          agentThreadsService
            .create(payload)
            .pipe(observeAgentsOperation("createAgentThread"))
        )
        .handle("archiveAgentThread", ({ path }) =>
          agentThreadsService
            .archive(path.threadId)
            .pipe(observeAgentsOperation("archiveAgentThread"))
        )
        .handle("authorizeAgentConnect", ({ path }) =>
          agentThreadsService
            .authorizeConnect(path.threadId)
            .pipe(observeAgentsOperation("authorizeAgentConnect"))
        );
    })
);

const AgentActionsHandlersLive = HttpApiBuilder.group(
  AppApi,
  "agentActions",
  (handlers) =>
    Effect.gen(function* () {
      const agentThreadsService = yield* AgentThreadsService;

      return handlers.handle("getAgentActionManifest", () =>
        agentThreadsService
          .getActions()
          .pipe(observeAgentsOperation("getAgentActionManifest"))
      );
    })
);

const AgentInternalHandlersLive = HttpApiBuilder.group(
  AppApi,
  "agentInternal",
  (handlers) =>
    Effect.gen(function* () {
      const agentThreadsService = yield* AgentThreadsService;

      return handlers
        .handle("runAgentAction", ({ payload }) =>
          agentThreadsService
            .runAction(payload)
            .pipe(observeAgentsOperation("runAgentAction"))
        )
        .handle("touchAgentThreadActivity", ({ path }) =>
          agentThreadsService
            .touchActivity(path.threadId)
            .pipe(observeAgentsOperation("touchAgentThreadActivity"))
        );
    })
);

export const AgentsHttpLive = Layer.mergeAll(
  DomainCorsLive,
  AgentActionsHandlersLive,
  AgentThreadsHandlersLive,
  AgentInternalHandlersLive
).pipe(Layer.provide(AgentThreadsService.Default));
