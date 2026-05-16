import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Effect } from "effect";

import {
  hasRequiredScope,
  MCP_TOOL_REGISTRATIONS,
  registerMcpTools,
  type McpToolRuntime,
} from "./tools.js";

describe("mcp tools registry metadata", () => {
  it("registers exact unique tool names", () => {
    const names = MCP_TOOL_REGISTRATIONS.map((tool) => tool.name);
    expect(names).toStrictEqual([
      "ceird.labels.list",
      "ceird.sites.options",
      "ceird.jobs.list",
      "ceird.jobs.detail",
      "ceird.jobs.options",
      "ceird.jobs.activity.list",
      "ceird.rate_cards.list",
      "ceird.jobs.add_comment",
      "ceird.jobs.assign_label",
      "ceird.jobs.remove_label",
    ]);
    expect(new Set(names).size).toBe(names.length);
  });

  it("maps read write and admin scopes correctly", () => {
    const byName = new Map(
      MCP_TOOL_REGISTRATIONS.map((tool) => [tool.name, tool.requiredScope])
    );

    expect(byName.get("ceird.labels.list")).toBe("ceird:read");
    expect(byName.get("ceird.jobs.add_comment")).toBe("ceird:write");
    expect(byName.get("ceird.jobs.activity.list")).toBe("ceird:admin");
  });

  it("marks risky tools as admin tools", () => {
    const byName = new Map(
      MCP_TOOL_REGISTRATIONS.map((tool) => [tool.name, tool.isAdminTool])
    );

    expect(byName.get("ceird.jobs.activity.list")).toBe(true);
    expect(byName.get("ceird.rate_cards.list")).toBe(true);
    expect(byName.get("ceird.jobs.list")).toBe(false);
  });
});

describe("mcp scope enforcement", () => {
  it("allows admin scope for all tools", () => {
    expect(hasRequiredScope(["ceird:admin"], "ceird:read")).toBe(true);
    expect(hasRequiredScope(["ceird:admin"], "ceird:write")).toBe(true);
    expect(hasRequiredScope(["ceird:admin"], "ceird:admin")).toBe(true);
  });

  it("requires read for read tools and write for write tools", () => {
    expect(hasRequiredScope(["ceird:read"], "ceird:read")).toBe(true);
    expect(hasRequiredScope(["ceird:write"], "ceird:read")).toBe(false);
    expect(hasRequiredScope(["ceird:write"], "ceird:write")).toBe(true);
    expect(hasRequiredScope(["ceird:read"], "ceird:write")).toBe(false);
    expect(hasRequiredScope(["ceird:read", "ceird:write"], "ceird:write")).toBe(
      true
    );
  });
});

describe("mcp tool registration", () => {
  it("registers tools on a real McpServer instance", () => {
    const server = new McpServer({
      name: "test-server",
      version: "0.0.0",
    });
    const runtime: McpToolRuntime = {
      runWithMcpSession: async <A, _E, _R>(
        _session: { sessionId: string; userId: string },
        _effect: Effect.Effect<A, unknown, unknown>
      ) => ({ ok: true }) as A,
    };

    expect(() => registerMcpTools(server, runtime)).not.toThrow();
  });

  it("runs tool with MCP session identity and returns structured content", async () => {
    const tools = new Map<
      string,
      (input: unknown, extra: unknown) => Promise<unknown>
    >();
    const runtimeCalls: Array<{ sessionId: string; userId: string }> = [];
    const runtime: McpToolRuntime = {
      runWithMcpSession: async <A, _E, _R>(
        session: { sessionId: string; userId: string },
        _effect: Effect.Effect<A, unknown, unknown>
      ) => {
        runtimeCalls.push(session);
        return { ok: true } as A;
      },
    };

    registerMcpTools(
      {
        registerTool(name, _config, handler) {
          tools.set(
            name,
            handler as (input: unknown, extra: unknown) => Promise<unknown>
          );
          return {} as never;
        },
      },
      runtime
    );

    const handler = tools.get("ceird.labels.list");
    expect(handler).toBeDefined();

    const result = (await handler?.(undefined, {
      authInfo: {
        extra: { sessionId: "session_abc", subject: "user_abc" },
        scopes: ["ceird:read"],
      },
    })) as {
      content: Array<{ text: string; type: string }>;
      structuredContent: unknown;
      isError?: boolean;
    };

    expect(runtimeCalls).toHaveLength(1);
    expect(runtimeCalls[0]).toStrictEqual({
      sessionId: "session_abc",
      userId: "user_abc",
    });
    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toBeDefined();
    expect(result.content[0]?.type).toBe("text");
  });

  it("returns isError and does not call runtime when scope is insufficient", async () => {
    const tools = new Map<
      string,
      (input: unknown, extra: unknown) => Promise<unknown>
    >();
    let runtimeCalled = false;
    const runtime: McpToolRuntime = {
      runWithMcpSession: async <A, E, R>(
        _session: { sessionId: string; userId: string },
        effect: Effect.Effect<A, E, R>
      ) => {
        runtimeCalled = true;
        return Effect.runPromise(
          effect as unknown as Effect.Effect<A, E, never>
        );
      },
    };

    registerMcpTools(
      {
        registerTool(name, _config, handler) {
          tools.set(
            name,
            handler as (input: unknown, extra: unknown) => Promise<unknown>
          );
          return {} as never;
        },
      },
      runtime
    );

    const handler = tools.get("ceird.rate_cards.list");
    expect(handler).toBeDefined();

    const result = (await handler?.(undefined, {
      authInfo: {
        extra: { sessionId: "session_abc", subject: "user_abc" },
        scopes: ["ceird:read"],
      },
    })) as {
      isError?: boolean;
    };

    expect(result.isError).toBe(true);
    expect(runtimeCalled).toBe(false);
  });

  it("fails closed when auth info is missing", async () => {
    const tools = new Map<
      string,
      (input: unknown, extra: unknown) => Promise<unknown>
    >();
    const runtime: McpToolRuntime = {
      runWithMcpSession: async <A, E, R>(
        _session: { sessionId: string; userId: string },
        effect: Effect.Effect<A, E, R>
      ) => Effect.runPromise(effect as unknown as Effect.Effect<A, E, never>),
    };

    registerMcpTools(
      {
        registerTool(name, _config, handler) {
          tools.set(
            name,
            handler as (input: unknown, extra: unknown) => Promise<unknown>
          );
          return {} as never;
        },
      },
      runtime
    );

    const handler = tools.get("ceird.labels.list");
    expect(handler).toBeDefined();

    const result = (await handler?.({}, { authInfo: undefined })) as {
      isError?: boolean;
    };
    expect(result.isError).toBe(true);
  });
});
