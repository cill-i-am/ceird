import { AgentInstanceName } from "@ceird/agents-core";
import { describe, expect, it } from "@effect/vitest";
import { Schema } from "effect";

import {
  AgentConnectTokenInvalidError,
  signAgentConnectToken,
  verifyAgentConnectToken,
} from "./internal-token.js";

const decodeAgentInstanceName = Schema.decodeUnknownSync(AgentInstanceName);
const agentInstanceName = decodeAgentInstanceName(
  "org:org_123:user:user_123:thread:11111111-1111-4111-8111-111111111111"
);

describe("agent connect tokens", () => {
  it("signs and verifies an agent instance name", async () => {
    const token = await signAgentConnectToken({
      agentInstanceName,
      now: new Date("2026-05-19T10:00:00.000Z"),
      secret: "secret",
      ttlSeconds: 60,
    });

    await expect(
      verifyAgentConnectToken({
        now: new Date("2026-05-19T10:00:59.000Z"),
        secret: "secret",
        token,
      })
    ).resolves.toBe(agentInstanceName);
  });

  it("rejects tampered and expired tokens", async () => {
    const token = await signAgentConnectToken({
      agentInstanceName,
      now: new Date("2026-05-19T10:00:00.000Z"),
      secret: "secret",
      ttlSeconds: 1,
    });

    await expect(
      verifyAgentConnectToken({
        now: new Date("2026-05-19T10:00:00.000Z"),
        secret: "other-secret",
        token,
      })
    ).rejects.toBeInstanceOf(AgentConnectTokenInvalidError);
    await expect(
      verifyAgentConnectToken({
        now: new Date("2026-05-19T10:00:02.000Z"),
        secret: "secret",
        token,
      })
    ).rejects.toBeInstanceOf(AgentConnectTokenInvalidError);
  });
});
