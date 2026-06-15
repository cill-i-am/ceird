import type { OrganizationId } from "@ceird/identity-core";
import type {
  CreateLabelInput,
  Label,
  LabelWriteResponse,
  UpdateLabelInput,
} from "@ceird/labels-core";
import { QueryClient } from "@tanstack/react-query";
import { Effect } from "effect";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createOrganizationDataScope } from "#/data-plane/query-scope";

import {
  createLabelElectricMutationHandlers,
  getOrCreateLabelsCollectionState,
} from "./labels-data-plane";

type LabelWriteEffect = Effect.Effect<LabelWriteResponse, unknown>;

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

  it("returns txid matching strategies from label Electric mutation handlers", async () => {
    const updatedLabel = {
      ...label,
      name: "Electrical",
    } satisfies Label;
    const createLabel = vi.fn<(input: CreateLabelInput) => LabelWriteEffect>(
      (input) =>
        Effect.succeed(
          makeLabelWriteResponse({ ...label, name: input.name }, 101)
        )
    );
    const updateLabel = vi.fn<
      (labelId: Label["id"], input: UpdateLabelInput) => LabelWriteEffect
    >((_labelId, input) =>
      Effect.succeed(
        makeLabelWriteResponse({ ...label, name: input.name }, 102)
      )
    );
    const archiveLabel = vi.fn<(labelId: Label["id"]) => LabelWriteEffect>(
      (_labelId) => Effect.succeed(makeLabelWriteResponse(label, 103))
    );
    const handlers = createLabelElectricMutationHandlers({
      archiveLabel,
      createLabel,
      updateLabel,
    });
    const onInsert = requireMutationHandler(handlers.onInsert, "onInsert");
    const onUpdate = requireMutationHandler(handlers.onUpdate, "onUpdate");
    const onDelete = requireMutationHandler(handlers.onDelete, "onDelete");

    await expect(
      onInsert({
        collection: {},
        transaction: {
          mutations: [{ modified: label }],
        },
      } as unknown as Parameters<typeof onInsert>[0])
    ).resolves.toStrictEqual({
      timeout: 10_000,
      txid: 101,
    });
    expect(createLabel).toHaveBeenCalledExactlyOnceWith({ name: "Plumbing" });

    await expect(
      onUpdate({
        collection: {},
        transaction: {
          mutations: [{ modified: updatedLabel, original: label }],
        },
      } as unknown as Parameters<typeof onUpdate>[0])
    ).resolves.toStrictEqual({
      timeout: 10_000,
      txid: 102,
    });
    expect(updateLabel).toHaveBeenCalledExactlyOnceWith(label.id, {
      name: "Electrical",
    });

    await expect(
      onDelete({
        collection: {},
        transaction: {
          mutations: [{ original: label }],
        },
      } as unknown as Parameters<typeof onDelete>[0])
    ).resolves.toStrictEqual({
      timeout: 10_000,
      txid: 103,
    });
    expect(archiveLabel).toHaveBeenCalledExactlyOnceWith(label.id);
  });

  it("rejects label Electric mutation handlers when the server command fails", async () => {
    const handlers = createLabelElectricMutationHandlers({
      archiveLabel: () => Effect.die("archiveLabel was not expected"),
      createLabel: () => Effect.fail(new Error("Label API unavailable")),
      updateLabel: () => Effect.die("updateLabel was not expected"),
    });
    const onInsert = requireMutationHandler(handlers.onInsert, "onInsert");

    await expect(
      onInsert({
        collection: {},
        transaction: {
          mutations: [{ modified: label }],
        },
      } as unknown as Parameters<typeof onInsert>[0])
    ).rejects.toThrow("Label API unavailable");
  });
});

function makeLabelWriteResponse(
  responseLabel: Label,
  txid: number
): LabelWriteResponse {
  return {
    label: responseLabel,
    mutation: { txid },
  };
}

function requireMutationHandler<Handler>(
  handler: Handler | undefined,
  name: string
): Handler {
  if (handler === undefined) {
    throw new Error(`Expected ${name} to be defined`);
  }

  return handler;
}

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
