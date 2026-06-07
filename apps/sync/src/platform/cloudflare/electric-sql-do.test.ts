import { describe, expect, it, vi } from "@effect/vitest";
import { Effect } from "effect";

import { handleElectricSqlFetch } from "./electric-sql-do.js";

function makeState(
  container?: NonNullable<DurableObjectState["container"]>,
  options: { readonly events?: string[] } = {}
) {
  return {
    blockConcurrencyWhile: vi.fn(async (callback: () => Promise<unknown>) => {
      options.events?.push("block:start");
      await callback();
      options.events?.push("block:end");
    }),
    container,
    waitUntil: vi.fn<(promise: Promise<unknown>) => void>(),
  } as unknown as DurableObjectState;
}

describe("ElectricSql Durable Object", () => {
  it("starts a stopped container and waits for the port before forwarding", async () => {
    const portFetch = vi
      .fn<
        (request: RequestInfo | URL, init?: RequestInit) => Promise<Response>
      >()
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(new Response("ok"));
    const container = {
      get running() {
        return containerRunning;
      },
      destroy: vi.fn<() => Promise<void>>(),
      getTcpPort: vi.fn(() => ({ fetch: portFetch }) as unknown as Fetcher),
      interceptAllOutboundHttp: vi.fn<() => Promise<void>>(),
      interceptOutboundHttp: vi.fn<() => Promise<void>>(),
      monitor: vi.fn(() => Promise.resolve()),
      setInactivityTimeout: vi.fn<() => Promise<void>>(),
      signal: vi.fn(),
      snapshotDirectory: vi.fn<() => Promise<ContainerDirectorySnapshot>>(),
      start: vi.fn(() => {
        containerRunning = true;
      }),
    } as unknown as NonNullable<DurableObjectState["container"]>;
    let containerRunning = false;
    const state = makeState(container);

    const response = await handleElectricSqlFetch(
      new Request("https://sync.example.com/v1/shape?offset=-1", {
        headers: {
          "x-request-id": "req_electric",
        },
      }),
      state
    ).pipe(Effect.runPromise);

    await expect(response.text()).resolves.toBe("ok");
    expect(response.status).toBe(200);
    expect(container.start).toHaveBeenCalledOnce();
    expect(state.blockConcurrencyWhile).toHaveBeenCalledOnce();
    expect(portFetch).toHaveBeenCalledTimes(2);
    expect(portFetch.mock.calls[0]?.[0]).toBe("http://electric/v1/health");
  });

  it("keeps the readiness health polling outside blockConcurrencyWhile", async () => {
    const events: string[] = [];
    const portFetch = vi
      .fn<
        (request: RequestInfo | URL, init?: RequestInit) => Promise<Response>
      >()
      .mockImplementation((request) => {
        events.push(
          request instanceof Request
            ? `fetch:${new URL(request.url).pathname}`
            : `fetch:${String(request)}`
        );

        return Promise.resolve(new Response("ok"));
      });
    const container = {
      get running() {
        return containerRunning;
      },
      destroy: vi.fn<() => Promise<void>>(),
      getTcpPort: vi.fn(() => ({ fetch: portFetch }) as unknown as Fetcher),
      interceptAllOutboundHttp: vi.fn<() => Promise<void>>(),
      interceptOutboundHttp: vi.fn<() => Promise<void>>(),
      monitor: vi.fn(() => Promise.resolve()),
      setInactivityTimeout: vi.fn<() => Promise<void>>(),
      signal: vi.fn(),
      snapshotDirectory: vi.fn<() => Promise<ContainerDirectorySnapshot>>(),
      start: vi.fn(() => {
        containerRunning = true;
      }),
    } as unknown as NonNullable<DurableObjectState["container"]>;
    let containerRunning = false;
    const state = makeState(container, { events });

    const response = await handleElectricSqlFetch(
      new Request("https://sync.example.com/v1/shape?offset=-1"),
      state
    ).pipe(Effect.runPromise);

    expect(response.status).toBe(200);
    expect(events.slice(0, 3)).toStrictEqual([
      "block:start",
      "block:end",
      "fetch:http://electric/v1/health",
    ]);
  });

  it("rechecks health for running containers without cached readiness", async () => {
    const portFetch = vi
      .fn<
        (request: RequestInfo | URL, init?: RequestInit) => Promise<Response>
      >()
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(new Response("ok"));
    const container = {
      get running() {
        return true;
      },
      destroy: vi.fn<() => Promise<void>>(),
      getTcpPort: vi.fn(() => ({ fetch: portFetch }) as unknown as Fetcher),
      interceptAllOutboundHttp: vi.fn<() => Promise<void>>(),
      interceptOutboundHttp: vi.fn<() => Promise<void>>(),
      monitor: vi.fn(() => Promise.resolve()),
      setInactivityTimeout: vi.fn<() => Promise<void>>(),
      signal: vi.fn(),
      snapshotDirectory: vi.fn<() => Promise<ContainerDirectorySnapshot>>(),
      start: vi.fn(),
    } as unknown as NonNullable<DurableObjectState["container"]>;
    const state = makeState(container);

    const response = await handleElectricSqlFetch(
      new Request("https://sync.example.com/v1/shape?offset=-1"),
      state
    ).pipe(Effect.runPromise);

    expect(response.status).toBe(200);
    expect(container.start).not.toHaveBeenCalled();
    expect(state.blockConcurrencyWhile).toHaveBeenCalledOnce();
    expect(portFetch).toHaveBeenCalledTimes(2);
    expect(portFetch.mock.calls[0]?.[0]).toBe("http://electric/v1/health");
  });

  it("returns a controlled 503 when the container binding is unavailable", async () => {
    const response = await handleElectricSqlFetch(
      new Request("https://sync.example.com/v1/shape?offset=-1"),
      makeState()
    ).pipe(Effect.runPromise);

    await expect(response.json()).resolves.toStrictEqual({
      error: "electric_container_unavailable",
    });
    expect(response.status).toBe(503);
  });

  it("returns a controlled 503 when the container never becomes ready", async () => {
    vi.useFakeTimers();
    try {
      const portFetch = vi
        .fn<
          (request: RequestInfo | URL, init?: RequestInit) => Promise<Response>
        >()
        .mockResolvedValue(new Response(null, { status: 503 }));
      const container = {
        get running() {
          return containerRunning;
        },
        destroy: vi.fn<() => Promise<void>>(),
        getTcpPort: vi.fn(() => ({ fetch: portFetch }) as unknown as Fetcher),
        interceptAllOutboundHttp: vi.fn<() => Promise<void>>(),
        interceptOutboundHttp: vi.fn<() => Promise<void>>(),
        monitor: vi.fn(() => Promise.resolve()),
        setInactivityTimeout: vi.fn<() => Promise<void>>(),
        signal: vi.fn(),
        snapshotDirectory: vi.fn<() => Promise<ContainerDirectorySnapshot>>(),
        start: vi.fn(() => {
          containerRunning = true;
        }),
      } as unknown as NonNullable<DurableObjectState["container"]>;
      let containerRunning = false;
      const state = makeState(container);
      const responsePromise = handleElectricSqlFetch(
        new Request("https://sync.example.com/v1/shape?offset=-1"),
        state
      ).pipe(Effect.runPromise);

      await vi.runAllTimersAsync();
      const response = await responsePromise;

      await expect(response.json()).resolves.toStrictEqual({
        error: "electric_container_unavailable",
      });
      expect(response.status).toBe(503);
      expect(response.headers.get("retry-after")).toBe("2");
      expect(portFetch).toHaveBeenCalledTimes(45);
    } finally {
      vi.useRealTimers();
    }
  });

  it("returns a controlled 502 when container forwarding fails", async () => {
    const portFetch = vi
      .fn<
        (request: RequestInfo | URL, init?: RequestInit) => Promise<Response>
      >()
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockRejectedValueOnce(new Error("forwarding failed"));
    const container = {
      get running() {
        return true;
      },
      destroy: vi.fn<() => Promise<void>>(),
      getTcpPort: vi.fn(() => ({ fetch: portFetch }) as unknown as Fetcher),
      interceptAllOutboundHttp: vi.fn<() => Promise<void>>(),
      interceptOutboundHttp: vi.fn<() => Promise<void>>(),
      monitor: vi.fn(() => Promise.resolve()),
      setInactivityTimeout: vi.fn<() => Promise<void>>(),
      signal: vi.fn(),
      snapshotDirectory: vi.fn<() => Promise<ContainerDirectorySnapshot>>(),
      start: vi.fn(),
    } as unknown as NonNullable<DurableObjectState["container"]>;
    const state = makeState(container);

    const response = await handleElectricSqlFetch(
      new Request("https://sync.example.com/v1/shape?offset=-1"),
      state
    ).pipe(Effect.runPromise);

    await expect(response.json()).resolves.toStrictEqual({
      error: "electric_container_forwarding_failed",
    });
    expect(response.status).toBe(502);
    expect(portFetch).toHaveBeenCalledTimes(2);
  });
});
