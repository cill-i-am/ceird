import { AgentThreadId } from "@ceird/agents-core";
import { AGENT_ACTIONS_MANIFEST } from "@ceird/agents-core";
import { Schema } from "effect";

import {
  ensureCurrentAgentThread,
  authorizeCurrentAgentThread,
  prepareCurrentAgentSession,
} from "./agent-client";

const decodeAgentThreadId = Schema.decodeUnknownSync(AgentThreadId);

const existingThread = {
  agentInstanceName:
    "org:org_123:user:user_123:thread:11111111-1111-4111-8111-111111111111",
  createdAt: "2026-05-21T09:00:00.000Z",
  id: decodeAgentThreadId("11111111-1111-4111-8111-111111111111"),
  lastMessageAt: "2026-05-21T09:30:00.000Z",
  status: "active",
  title: "Existing chat",
  updatedAt: "2026-05-21T09:30:00.000Z",
};

const createdThread = {
  agentInstanceName:
    "org:org_123:user:user_123:thread:22222222-2222-4222-8222-222222222222",
  createdAt: "2026-05-21T10:00:00.000Z",
  id: decodeAgentThreadId("22222222-2222-4222-8222-222222222222"),
  lastMessageAt: null,
  status: "active",
  title: "New conversation",
  updatedAt: "2026-05-21T10:00:00.000Z",
};

describe("agent client", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("uses the newest existing thread before creating a chat thread", async () => {
    vi.stubEnv("VITE_API_ORIGIN", "http://127.0.0.1:3001");
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(Response.json({ items: [existingThread] }));

    await expect(ensureCurrentAgentThread()).resolves.toStrictEqual(
      existingThread
    );

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, requestInit] = fetchMock.mock.calls[0] ?? [];
    expect(String(url)).toBe("http://127.0.0.1:3001/agent/threads?limit=1");
    expect(requestInit?.method).toBe("GET");
    expect(requestInit?.credentials).toBe("include");
  });

  it("creates a chat thread when the current user has none", async () => {
    vi.stubEnv("VITE_API_ORIGIN", "http://127.0.0.1:3001");
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(Response.json({ items: [] }))
      .mockResolvedValueOnce(
        Response.json({ item: createdThread }, { status: 201 })
      );

    await expect(ensureCurrentAgentThread()).resolves.toStrictEqual(
      createdThread
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [listUrl, listRequestInit] = fetchMock.mock.calls[0] ?? [];
    expect(String(listUrl)).toBe("http://127.0.0.1:3001/agent/threads?limit=1");
    expect(listRequestInit?.method).toBe("GET");

    const [createUrl, createRequestInit] = fetchMock.mock.calls[1] ?? [];
    expect(String(createUrl)).toBe("http://127.0.0.1:3001/agent/threads");
    expect(createRequestInit?.method).toBe("POST");
    expect(
      new TextDecoder().decode(createRequestInit?.body as Uint8Array)
    ).toBe(JSON.stringify({ title: "New conversation" }));
  });

  it("authorizes the selected thread before connecting to the Agent Worker", async () => {
    vi.stubEnv("VITE_API_ORIGIN", "http://127.0.0.1:3001");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({
        agentInstanceName: existingThread.agentInstanceName,
        token: "agent-connect-token",
      })
    );

    await expect(
      authorizeCurrentAgentThread(existingThread.id)
    ).resolves.toStrictEqual({
      agentInstanceName: existingThread.agentInstanceName,
      token: "agent-connect-token",
    });

    const [url, requestInit] = fetchMock.mock.calls[0] ?? [];
    expect(String(url)).toBe(
      "http://127.0.0.1:3001/agent/threads/11111111-1111-4111-8111-111111111111/authorize"
    );
    expect(requestInit?.method).toBe("POST");
    expect(requestInit?.credentials).toBe("include");
  });

  it("prepares the current agent session in one idempotent request", async () => {
    vi.stubEnv("VITE_API_ORIGIN", "http://127.0.0.1:3001");
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({
        authorization: {
          agentInstanceName: existingThread.agentInstanceName,
          token: "agent-connect-token",
        },
        manifest: AGENT_ACTIONS_MANIFEST,
        thread: existingThread,
        tokenExpiresInSeconds: 300,
      })
    );

    await expect(prepareCurrentAgentSession()).resolves.toStrictEqual({
      authorization: {
        agentInstanceName: existingThread.agentInstanceName,
        token: "agent-connect-token",
      },
      manifest: AGENT_ACTIONS_MANIFEST,
      thread: existingThread,
      tokenExpiresInSeconds: 300,
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, requestInit] = fetchMock.mock.calls[0] ?? [];
    expect(String(url)).toBe("http://127.0.0.1:3001/agent/session/prepare");
    expect(requestInit?.method).toBe("POST");
    expect(requestInit?.credentials).toBe("include");
    expect(new TextDecoder().decode(requestInit?.body as Uint8Array)).toBe(
      JSON.stringify({ title: "New conversation" })
    );
  });
});
