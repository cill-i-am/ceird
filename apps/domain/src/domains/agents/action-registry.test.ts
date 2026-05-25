import { AGENT_EXECUTABLE_ACTION_NAMES } from "@ceird/agents-core";
import { describe, expect, it } from "@effect/vitest";

import { getDomainAgentActionHandlerNames } from "./action-registry.js";

describe("agent domain action registry", () => {
  it("registers the narrowed sites, jobs, labels, and collaborator actions", () => {
    expect([...getDomainAgentActionHandlerNames()].toSorted()).toStrictEqual(
      [...AGENT_EXECUTABLE_ACTION_NAMES].toSorted()
    );
  });
});
