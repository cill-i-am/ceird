import { OrganizationId, UserId } from "@ceird/identity-core";
import { ParseResult, Schema } from "effect";

import {
  AgentInstanceName,
  AGENT_ACTIONS,
  AGENT_ACTIONS_MANIFEST,
  AGENT_ACTION_MANIFEST_SCHEMA,
  AGENT_ACTION_NAMES,
  AGENT_EXECUTABLE_ACTIONS,
  AGENT_EXECUTABLE_ACTION_MANIFEST,
  AGENT_EXECUTABLE_ACTION_NAMES,
  AgentThreadId,
  AgentThreadListResponseSchema,
  AgentConnectTokenInvalidError,
  CreateAgentThreadInputSchema,
  buildAgentInstanceName,
  getAgentActionDefinition,
  getAgentActionManifest,
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
  it("exports the shared agent action registry metadata", () => {
    expect(AGENT_ACTION_NAMES).toContain("ceird.jobs.create");
    expect(AGENT_ACTION_NAMES).toContain("ceird.sites.create");
    expect(AGENT_ACTION_NAMES).toContain("ceird.labels.create");
    expect(AGENT_ACTION_NAMES).toContain("ceird.organization.members.invite");
    expect(getAgentActionDefinition("ceird.jobs.create").kind).toBe("write");
    expect(getAgentActionDefinition("ceird.jobs.remove_label").kind).toBe(
      "destructive"
    );
    expect(AGENT_ACTION_MANIFEST_SCHEMA).toBeDefined();
  });

  it("keeps action registry names unique", () => {
    expect(new Set(AGENT_ACTION_NAMES).size).toBe(AGENT_ACTION_NAMES.length);
  });

  it("keeps action registry model names unique", () => {
    const modelNames = AGENT_ACTIONS.map((action) => action.modelName);

    expect(new Set(modelNames).size).toBe(modelNames.length);
  });

  it.each(AGENT_ACTIONS)(
    "looks up the exact action definition for $name",
    (action) => {
      expect(getAgentActionDefinition(action.name)).toBe(action);
    }
  );

  it.each([
    { executableOnly: false, manifest: AGENT_ACTIONS_MANIFEST },
    { executableOnly: true, manifest: AGENT_EXECUTABLE_ACTION_MANIFEST },
    { executableOnly: false, manifest: getAgentActionManifest() },
    {
      executableOnly: true,
      manifest: getAgentActionManifest({ executableOnly: true }),
    },
  ])("projects a valid manifest %#", ({ executableOnly, manifest }) => {
    expect(
      Schema.decodeUnknownSync(AGENT_ACTION_MANIFEST_SCHEMA)(manifest)
    ).toStrictEqual(manifest);
    expect(
      manifest.actions.every((action) =>
        AGENT_ACTION_NAMES.includes(action.name)
      )
    ).toBeTruthy();

    const executableNames = new Set<string>(AGENT_EXECUTABLE_ACTION_NAMES);

    expect(
      executableOnly
        ? manifest.actions.every((action) => executableNames.has(action.name))
        : true
    ).toBeTruthy();
  });

  it("rejects manifest items with unknown action names", () => {
    expect(() =>
      Schema.decodeUnknownSync(AGENT_ACTION_MANIFEST_SCHEMA)({
        actions: [
          {
            ...AGENT_ACTIONS_MANIFEST.actions[0],
            name: "ceird.jobs.not_real",
          },
        ],
      })
    ).toThrow(/ceird\.jobs\.not_real/);
  });

  it("keeps executable actions scoped to the current domain-backed set", () => {
    expect(AGENT_EXECUTABLE_ACTION_NAMES).toStrictEqual([
      "ceird.labels.list",
      "ceird.labels.create",
      "ceird.labels.update",
      "ceird.labels.delete",
      "ceird.sites.options",
      "ceird.sites.list",
      "ceird.sites.create",
      "ceird.sites.update",
      "ceird.sites.comments.list",
      "ceird.sites.comments.add",
      "ceird.sites.assign_label",
      "ceird.sites.remove_label",
      "ceird.service_areas.list",
      "ceird.service_areas.create",
      "ceird.service_areas.update",
      "ceird.jobs.list",
      "ceird.jobs.detail",
      "ceird.jobs.options",
      "ceird.jobs.create",
      "ceird.jobs.update",
      "ceird.jobs.transition",
      "ceird.jobs.reopen",
      "ceird.jobs.activity.list",
      "ceird.jobs.add_comment",
      "ceird.jobs.visits.add",
      "ceird.jobs.assign_label",
      "ceird.jobs.remove_label",
      "ceird.jobs.cost_lines.add",
      "ceird.jobs.collaborators.list",
      "ceird.jobs.collaborators.attach",
      "ceird.jobs.collaborators.update",
      "ceird.jobs.collaborators.detach",
    ]);
    expect(
      AGENT_EXECUTABLE_ACTIONS.every(
        (action) =>
          action.executionStatus === "executable" &&
          AGENT_ACTION_NAMES.includes(action.name)
      )
    ).toBeTruthy();
  });

  it("keeps action kind and confirmation policy invariants consistent", () => {
    expect(
      AGENT_ACTIONS.filter((action) => action.kind === "read").every(
        (action) => action.confirmationPolicy === "none"
      )
    ).toBeTruthy();
    expect(
      AGENT_ACTIONS.filter((action) => action.kind === "destructive").every(
        (action) => action.confirmationPolicy === "confirm_destructive"
      )
    ).toBeTruthy();

    expect(getAgentActionDefinition("ceird.jobs.assign_label").kind).toBe(
      "write"
    );
    expect(
      getAgentActionDefinition("ceird.jobs.assign_label").confirmationPolicy
    ).toBe("confirm");
  });

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
