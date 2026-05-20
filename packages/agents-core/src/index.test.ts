import { OrganizationId, UserId } from "@ceird/identity-core";
import { ParseResult, Schema } from "effect";

import {
  AgentInstanceName,
  AgentThreadId,
  AgentThreadListResponseSchema,
  AgentConnectTokenInvalidError,
  CreateAgentThreadInputSchema,
  buildAgentInstanceName,
  parseAgentInstanceName,
  signAgentConnectToken,
  verifyAgentConnectToken,
} from "./index.js";

const decodeOrganizationId = Schema.decodeUnknownSync(OrganizationId);
const decodeAgentThreadId = Schema.decodeUnknownSync(AgentThreadId);
const decodeUserId = Schema.decodeUnknownSync(UserId);
const decodeCreateInput = ParseResult.decodeUnknownSync(
  CreateAgentThreadInputSchema
);
const decodeListResponse = ParseResult.decodeUnknownSync(
  AgentThreadListResponseSchema
);
const decodeInstanceName = Schema.decodeUnknownSync(AgentInstanceName);

describe("@ceird/agents-core", () => {
  it("builds and parses deterministic org/user/thread instance names", () => {
    const name = buildAgentInstanceName({
      organizationId: decodeOrganizationId("org:with/slash"),
      threadId: decodeAgentThreadId("11111111-1111-4111-8111-111111111111"),
      userId: decodeUserId("user:with/slash"),
    });

    expect(name).toBe(
      "org:org%3Awith%2Fslash:user:user%3Awith%2Fslash:thread:11111111-1111-4111-8111-111111111111"
    );
    expect(decodeInstanceName(name)).toBe(name);
    expect(parseAgentInstanceName(name)).toStrictEqual({
      organizationId: "org:with/slash",
      threadId: "11111111-1111-4111-8111-111111111111",
      userId: "user:with/slash",
    });
  });

  it("rejects malformed instance names", () => {
    expect(() =>
      parseAgentInstanceName("org:a:user:b" as AgentInstanceName)
    ).toThrow(/Invalid agent instance name/);
    expect(() => decodeInstanceName("not-an-agent-name")).toThrow(
      "Expected a string matching the pattern"
    );
  });

  it("normalizes create input and list responses", () => {
    expect(
      decodeCreateInput({ title: "  Follow up on quote  " })
    ).toStrictEqual({
      title: "Follow up on quote",
    });
    expect(decodeCreateInput({})).toStrictEqual({});

    expect(
      decodeListResponse({
        items: [
          {
            agentInstanceName:
              "org:org_123:user:user_123:thread:11111111-1111-4111-8111-111111111111",
            createdAt: "2026-05-18T10:00:00.000Z",
            id: "11111111-1111-4111-8111-111111111111",
            lastMessageAt: null,
            status: "active",
            title: "New thread",
            updatedAt: "2026-05-18T10:00:00.000Z",
          },
        ],
      }).items[0]?.status
    ).toBe("active");

    expect(() =>
      decodeListResponse({
        items: [
          {
            agentInstanceName:
              "org:org_123:user:user_123:thread:11111111-1111-4111-8111-111111111111",
            createdAt: "not-a-date",
            id: "11111111-1111-4111-8111-111111111111",
            lastMessageAt: null,
            status: "active",
            title: "New thread",
            updatedAt: "2026-05-18T10:00:00.000Z",
          },
        ],
      })
    ).toThrow("Expected an ISO-8601 UTC datetime string");
  });

  it("signs and rejects malformed connect tokens", async () => {
    const agentInstanceName = decodeInstanceName(
      "org:org_123:user:user_123:thread:11111111-1111-4111-8111-111111111111"
    );
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
    const malformedPayload = Buffer.from("not-json").toString("base64url");

    await expect(
      verifyAgentConnectToken({
        now: new Date("2026-05-19T10:00:59.000Z"),
        secret: "secret",
        token: `v1.${malformedPayload}.${await signTestHmac(
          "secret",
          malformedPayload
        )}`,
      })
    ).rejects.toBeInstanceOf(AgentConnectTokenInvalidError);
  });
});

async function signTestHmac(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { hash: "SHA-256", name: "HMAC" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(data)
  );

  return Buffer.from(signature).toString("base64url");
}
