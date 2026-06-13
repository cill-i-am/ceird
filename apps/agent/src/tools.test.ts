import {
  AGENT_ACTIONS,
  AGENT_EXECUTABLE_ACTIONS,
  AgentActionRunId,
  AgentInstanceName,
} from "@ceird/agents-core/runtime";
import type { AgentProximityOriginContextFrame } from "@ceird/agents-core/runtime";
import type { DomainServiceBinding } from "@ceird/domain-core";
import { beforeEach, describe, expect, it } from "@effect/vitest";
import type { ToolExecutionOptions } from "ai";
import { Schema } from "effect";
import { vi } from "vitest";

import type { runDomainAction as runDomainActionFunction } from "./domain-client.js";
import type { AgentWorkerEnv } from "./platform/cloudflare/env.js";
import { createCeirdTools } from "./tools.js";

type RunDomainAction = typeof runDomainActionFunction;

const { runDomainAction } = vi.hoisted(() => ({
  runDomainAction: vi.fn<RunDomainAction>(),
}));

vi.mock(import("./domain-client.js"), () => ({
  runDomainAction,
}));

const decodeAgentActionRunId = Schema.decodeUnknownSync(AgentActionRunId);
const decodeAgentInstanceName = Schema.decodeUnknownSync(AgentInstanceName);
const agentInstanceName = decodeAgentInstanceName(
  "org:org_123:user:user_123:thread:11111111-1111-4111-8111-111111111111"
);
const actionRunId = decodeAgentActionRunId(
  "22222222-2222-4222-8222-222222222222"
);

describe("Ceird Agent tools", () => {
  beforeEach(() => {
    runDomainAction.mockReset();
    runDomainAction.mockResolvedValue({
      actionRunId,
      replayed: false,
      result: { ok: true },
    });
  });

  it("exposes only executable read action model names by default", () => {
    const expectedReadModelNames = AGENT_EXECUTABLE_ACTIONS.filter(
      (action) => action.kind === "read"
    ).map((action) => action.modelName);

    expect(Object.keys(createCeirdTools(makeEnv(), agentInstanceName))).toEqual(
      expectedReadModelNames
    );
    expect(Object.keys(createCeirdTools(makeEnv(), agentInstanceName))).toEqual(
      expect.arrayContaining([
        "listSites",
        "listSiteComments",
        "listOrganizationActivity",
        "listJobCollaborators",
      ])
    );
  });

  it.each([undefined, "false", "TRUE", " true "])(
    "keeps mutation tools absent unless the env flag is exactly true (%s)",
    (flagValue) => {
      const tools = createCeirdTools(
        makeEnv(
          flagValue === undefined
            ? {}
            : { AGENT_MUTATION_TOOLS_ENABLED: flagValue }
        ),
        agentInstanceName
      );
      const mutationModelNames = AGENT_EXECUTABLE_ACTIONS.filter(
        (action) => action.kind === "write" || action.kind === "destructive"
      ).map((action) => action.modelName);

      expect(Object.keys(tools)).not.toEqual(
        expect.arrayContaining(mutationModelNames)
      );
    }
  );

  it("exposes every executable action model name when mutations are enabled", () => {
    const expectedExecutableModelNames = AGENT_EXECUTABLE_ACTIONS.map(
      (action) => action.modelName
    );

    expect(
      Object.keys(
        createCeirdTools(
          makeEnv({ AGENT_MUTATION_TOOLS_ENABLED: "true" }),
          agentInstanceName
        )
      )
    ).toEqual(expectedExecutableModelNames);
    expect(expectedExecutableModelNames).toEqual(
      expect.arrayContaining([
        "createLabel",
        "updateLabel",
        "deleteLabel",
        "createSite",
        "updateSite",
        "addSiteComment",
        "assignSiteLabel",
        "removeSiteLabel",
        "createJob",
        "updateJob",
        "transitionJob",
        "reopenJob",
        "addJobVisit",
        "attachJobCollaborator",
        "updateJobCollaborator",
        "detachJobCollaborator",
      ])
    );
  });

  it("does not expose planned actions even when mutations are enabled", () => {
    const tools = createCeirdTools(
      makeEnv({ AGENT_MUTATION_TOOLS_ENABLED: "true" }),
      agentInstanceName
    );

    const plannedModelNames = AGENT_ACTIONS.filter(
      (action) => action.executionStatus === "planned"
    ).map((action) => action.modelName);

    expect(Object.keys(tools)).toEqual(
      expect.arrayContaining([
        "createLabel",
        "updateLabel",
        "deleteLabel",
        "createSite",
        "updateSite",
        "addSiteComment",
        "assignSiteLabel",
        "removeSiteLabel",
        "createJob",
        "updateJob",
        "transitionJob",
        "reopenJob",
        "addJobVisit",
        "attachJobCollaborator",
        "updateJobCollaborator",
        "detachJobCollaborator",
      ])
    );
    expect(Object.keys(tools)).not.toEqual(
      expect.arrayContaining(plannedModelNames)
    );
  });

  it("sources tool descriptions from registry metadata", () => {
    const tools = createCeirdTools(makeEnv(), agentInstanceName);
    const listLabelsAction = AGENT_EXECUTABLE_ACTIONS.find(
      (action) => action.name === "ceird.labels.list"
    );

    expect(tools.listLabels?.description).toBe(
      listLabelsAction?.modelDescription
    );
  });

  it("marks every executable write and destructive action as approval-gated", () => {
    const tools = createCeirdTools(
      makeEnv({ AGENT_MUTATION_TOOLS_ENABLED: "true" }),
      agentInstanceName
    );
    const writeOrDestructiveActions = AGENT_EXECUTABLE_ACTIONS.filter(
      (action) => action.kind === "write" || action.kind === "destructive"
    );

    expect(writeOrDestructiveActions.length).toBeGreaterThan(0);

    for (const action of writeOrDestructiveActions) {
      expect(
        (tools[action.modelName] as { readonly needsApproval?: unknown })
          .needsApproval
      ).toBe(true);
    }

    expect(
      AGENT_EXECUTABLE_ACTIONS.filter((action) => action.kind === "read").every(
        (action) =>
          (tools[action.modelName] as { readonly needsApproval?: unknown })
            .needsApproval === undefined
      )
    ).toBe(true);
    expect(
      (tools.listLabels as { readonly needsApproval?: unknown }).needsApproval
    ).toBeUndefined();
  });

  it("normalizes empty action inputs to strict empty object schemas", () => {
    const tools = createCeirdTools(makeEnv(), agentInstanceName);

    const inputSchema = tools.listLabels?.inputSchema as
      | { readonly jsonSchema: unknown }
      | undefined;

    expect(inputSchema?.jsonSchema).toEqual({
      additionalProperties: false,
      properties: {},
      type: "object",
    });
  });

  it("executes generated tools through the registry action name and stable operation id", async () => {
    const tools = createCeirdTools(makeEnv(), agentInstanceName);
    const result = await tools.listJobs?.execute?.({ limit: "10" }, {
      abortSignal: new AbortController().signal,
      messages: [],
      toolCallId: "call with spaces",
    } satisfies ToolExecutionOptions);

    expect(result).toEqual({ ok: true });
    expect(runDomainAction).toHaveBeenCalledExactlyOnceWith(makeEnv(), {
      input: { limit: "10" },
      name: "ceird.jobs.list",
      operationId: "tool:call_with_spaces:ceird.jobs.list",
      threadId: "11111111-1111-4111-8111-111111111111",
    });
  });

  it("replaces current-location proximity tool origins with hidden request origin", async () => {
    const proximityOrigin = {
      accuracyMeters: 12,
      coordinates: { latitude: 53.349_805, longitude: -6.260_31 },
      mode: "current_location",
    } satisfies AgentProximityOriginContextFrame["origin"];
    const tools = createCeirdTools(makeEnv(), agentInstanceName, {
      proximityOrigin,
    });
    const result = await tools.rankNearbyJobs?.execute?.(
      {
        limit: 10,
        origin: {
          coordinates: { latitude: 0, longitude: 0 },
          mode: "current_location",
        },
      },
      {
        abortSignal: new AbortController().signal,
        messages: [],
        toolCallId: "nearby-call",
      } satisfies ToolExecutionOptions
    );

    expect(result).toEqual({ ok: true });
    expect(runDomainAction).toHaveBeenCalledExactlyOnceWith(makeEnv(), {
      input: {
        limit: 10,
        origin: proximityOrigin,
      },
      name: "ceird.jobs.proximity",
      operationId: "tool:nearby-call:ceird.jobs.proximity",
      threadId: "11111111-1111-4111-8111-111111111111",
    });
  });

  it("overrides model-supplied typed proximity origins with the hidden request origin", async () => {
    const proximityOrigin = {
      accuracyMeters: 12,
      coordinates: { latitude: 53.349_805, longitude: -6.260_31 },
      mode: "current_location",
    } satisfies AgentProximityOriginContextFrame["origin"];
    const tools = createCeirdTools(makeEnv(), agentInstanceName, {
      proximityOrigin,
    });

    await tools.rankNearbyJobs?.execute?.(
      {
        limit: 10,
        origin: {
          coordinates: { latitude: 53.342_886, longitude: -6.267_428 },
          displayText: "Heuston Station",
          mode: "typed_origin",
          originToken: "fake-token",
          placeId: "google-place-origin",
        },
      },
      {
        abortSignal: new AbortController().signal,
        messages: [],
        toolCallId: "typed-origin-call",
      } satisfies ToolExecutionOptions
    );

    expect(runDomainAction).toHaveBeenCalledExactlyOnceWith(makeEnv(), {
      input: {
        limit: 10,
        origin: proximityOrigin,
      },
      name: "ceird.jobs.proximity",
      operationId: "tool:typed-origin-call:ceird.jobs.proximity",
      threadId: "11111111-1111-4111-8111-111111111111",
    });
  });

  it("keeps proximity tool output rich for the app but redacted for the model", async () => {
    const tools = createCeirdTools(makeEnv(), agentInstanceName);
    const modelOutput = await (
      tools.rankNearbyJobs as
        | {
            readonly toModelOutput?: (options: {
              readonly input: unknown;
              readonly output: unknown;
              readonly toolCallId: string;
            }) => unknown;
          }
        | undefined
    )?.toModelOutput?.({
      input: {},
      output: {
        origin: {
          computedAt: "2026-06-06T10:00:00.000Z",
          coordinates: { latitude: 53.349_805, longitude: -6.260_31 },
          displayText: "Docklands depot",
          mode: "typed_origin",
          originToken: "secret-origin-token",
          placeId: "ChIJdocklandsDepot",
        },
        routeLine: {
          coordinates: [
            { latitude: 53.349_805, longitude: -6.260_31 },
            { latitude: 53.3498, longitude: -6.2603 },
          ],
          format: "geojson_linestring",
        },
        rows: [
          {
            job: {
              site: {
                coordinates: { latitude: 53.349_805, longitude: -6.260_31 },
              },
              title: "Urgent boiler repair",
            },
            routeSummary: {
              distanceMeters: 1200,
              durationSeconds: 420,
            },
          },
        ],
      },
      toolCallId: "model-output-call",
    });

    expect(modelOutput).toEqual({
      type: "json",
      value: {
        origin: {
          mode: "typed_origin",
        },
        rows: [
          {
            job: {
              site: {},
              title: "Urgent boiler repair",
            },
            routeSummary: {
              distanceMeters: 1200,
              durationSeconds: 420,
            },
          },
        ],
      },
    });
    expect(JSON.stringify(modelOutput)).not.toContain("53.349805");
    expect(JSON.stringify(modelOutput)).not.toContain("Docklands depot");
    expect(JSON.stringify(modelOutput)).not.toContain("ChIJdocklandsDepot");
    expect(JSON.stringify(modelOutput)).not.toContain("routeLine");
    expect(JSON.stringify(modelOutput)).not.toContain("originToken");
  });
});

function makeEnv(overrides: Partial<AgentWorkerEnv> = {}): AgentWorkerEnv {
  return {
    AGENT_INTERNAL_SECRET: "agent-secret",
    AI: {} as Ai,
    CeirdAgent: {} as DurableObjectNamespace,
    DOMAIN: {} as DomainServiceBinding,
    ...overrides,
  };
}
