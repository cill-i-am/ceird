import { AgentInstanceName } from "@ceird/agents-core";
import type { DomainServiceBinding } from "@ceird/domain-core";
import { describe, expect, it } from "@effect/vitest";
import { Schema } from "effect";

import type { AgentWorkerEnv } from "./platform/cloudflare/env.js";
import { createCeirdTools } from "./tools.js";

const decodeAgentInstanceName = Schema.decodeUnknownSync(AgentInstanceName);
const agentInstanceName = decodeAgentInstanceName(
  "org:org_123:user:user_123:thread:11111111-1111-4111-8111-111111111111"
);

describe("Ceird Agent tools", () => {
  it("keeps mutating tools unavailable until an explicit confirmation-capable client enables them", () => {
    expect(Object.keys(createCeirdTools(makeEnv(), agentInstanceName))).toEqual(
      [
        "getJobDetail",
        "getJobOptions",
        "listJobs",
        "listLabels",
        "listSiteOptions",
      ]
    );
  });

  it("can expose mutating tools behind an explicit runtime flag", () => {
    expect(
      Object.keys(
        createCeirdTools(
          makeEnv({ AGENT_MUTATION_TOOLS_ENABLED: "true" }),
          agentInstanceName
        )
      )
    ).toEqual([
      "getJobDetail",
      "getJobOptions",
      "listJobs",
      "listLabels",
      "listSiteOptions",
      "addJobComment",
      "assignJobLabel",
      "removeJobLabel",
    ]);
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
