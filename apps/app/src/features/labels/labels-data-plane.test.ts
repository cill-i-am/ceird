import type { OrganizationId } from "@ceird/identity-core";
import type { Label } from "@ceird/labels-core";
import { QueryClient } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createOrganizationDataScope } from "#/data-plane/query-scope";

import { getOrCreateLabelsCollectionState } from "./labels-data-plane";

describe("labels data plane", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  const scope = createOrganizationDataScope({
    organizationId: "org_123" as OrganizationId,
    role: "owner",
    userId: "user_123",
  });
  const label = {
    createdAt: "2026-06-14T00:00:00.000Z",
    id: "11111111-1111-4111-8111-111111111111" as Label["id"],
    name: "Plumbing",
    updatedAt: "2026-06-14T00:00:00.000Z",
  } satisfies Label;

  it("keeps labels on Query Collection when sync is explicitly disabled", () => {
    const queryClient = new QueryClient();

    const state = getOrCreateLabelsCollectionState({
      initialLabels: [label],
      queryClient,
      scope,
      sync: { electricEnabled: false, runtime: { isBrowser: true } },
    });

    expect(state.collection.id).toBe(
      "organization:org_123:user:user_123:role:owner:labels"
    );
    expect(state.health.current).toMatchObject({
      collection: "labels",
      collectionId: "organization:org_123:user:user_123:role:owner:labels",
      fallbackReason: "sync-disabled",
      source: "query",
      status: "fallback-active",
    });
  });

  it("keeps labels on Query Collection by default even when sync origin is configured", () => {
    vi.stubEnv("VITE_SYNC_ORIGIN", "https://sync.codex.ceird.localhost");

    const queryClient = new QueryClient();
    const state = getOrCreateLabelsCollectionState({
      initialLabels: [label],
      queryClient,
      scope,
      sync: {
        runtime: {
          fetch: makeTestFetch(new Response("ok")),
          isBrowser: true,
        },
      },
    });

    expect(state.collection.id).toBe(
      "organization:org_123:user:user_123:role:owner:labels"
    );
    expect(state.health.current).toMatchObject({
      fallbackReason: "sync-disabled",
      source: "query",
      status: "fallback-active",
    });
  });

  it("can opt the labels contract into Electric while sharing the collection health surface", () => {
    vi.stubEnv("VITE_SYNC_ORIGIN", "https://sync.codex.ceird.localhost");

    const queryClient = new QueryClient();
    const state = getOrCreateLabelsCollectionState({
      initialLabels: [label],
      queryClient,
      scope,
      sync: {
        electricEnabled: true,
        runtime: {
          fetch: makeTestFetch(new Response("ok")),
          isBrowser: true,
        },
      },
    });

    expect(state.collection.id).toBe(
      "organization:org_123:user:user_123:role:owner:labels:electric"
    );
    expect(state.health.current).toMatchObject({
      collection: "labels",
      collectionId:
        "organization:org_123:user:user_123:role:owner:labels:electric",
      source: "electric",
      status: "connecting",
    });
  });
});

function makeTestFetch(response: Response) {
  return Object.assign(
    vi.fn<(...args: Parameters<typeof fetch>) => ReturnType<typeof fetch>>(
      () => Promise.resolve(response) as ReturnType<typeof fetch>
    ),
    {
      preconnect: vi.fn<typeof fetch.preconnect>(),
    }
  ) satisfies typeof fetch;
}
