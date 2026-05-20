import {
  AGENT_ACTIONS,
  AGENT_EXECUTABLE_ACTIONS,
  AgentActionRunId,
  AgentInstanceName,
} from "@ceird/agents-core";
import type { DomainServiceBinding } from "@ceird/domain-core";
import { describe, expect, it } from "@effect/vitest";
import type { ToolExecutionOptions } from "ai";
import { Schema } from "effect";
import { beforeEach, vi } from "vitest";

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
      expect.arrayContaining(["listServiceAreas"])
    );
    expect(Object.keys(createCeirdTools(makeEnv(), agentInstanceName))).toEqual(
      expect.arrayContaining([
        "listRateCards",
        "listSites",
        "listSiteComments",
        "listOrganizationActivity",
        "listJobCollaborators",
      ])
    );
  });

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
        "createServiceArea",
        "updateServiceArea",
        "createJob",
        "updateJob",
        "transitionJob",
        "reopenJob",
        "addJobVisit",
        "addJobCostLine",
        "attachJobCollaborator",
        "updateJobCollaborator",
        "detachJobCollaborator",
        "createRateCard",
        "updateRateCard",
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
        "createServiceArea",
        "updateServiceArea",
        "createJob",
        "updateJob",
        "transitionJob",
        "reopenJob",
        "addJobVisit",
        "addJobCostLine",
        "attachJobCollaborator",
        "updateJobCollaborator",
        "detachJobCollaborator",
        "createRateCard",
        "updateRateCard",
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
