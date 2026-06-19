import type { OrganizationId } from "@ceird/identity-core";
import type {
  CreateLabelInput,
  Label,
  LabelWriteResponse,
  UpdateLabelInput,
} from "@ceird/labels-core";
import { DEFAULT_LABEL_COLOR } from "@ceird/labels-core";
import { QueryClient } from "@tanstack/react-query";
import { Effect } from "effect";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createOrganizationDataScope } from "#/data-plane/query-scope";

import {
  createLabelElectricMutationHandlers,
  deriveLabelUsageCounts,
  getOrCreateLabelsCollectionState,
  getOrCreateSettingsLabelUsageCollectionState,
  getOrCreateSettingsLabelsCollectionState,
  searchSettingsLabels,
  toLabelElectricRow,
  toLabelUsageJobAssignmentElectricRow,
  toLabelUsageSiteAssignmentElectricRow,
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
    archivedAt: null,
    color: DEFAULT_LABEL_COLOR,
    createdAt: "2026-06-14T00:00:00.000Z",
    description: null,
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

  it("exposes a Settings labels Electric collection without Query fallback", () => {
    vi.stubEnv("VITE_SYNC_ORIGIN", "https://sync.codex.ceird.localhost");

    const state = getOrCreateSettingsLabelsCollectionState({
      scope,
      sync: {
        runtime: {
          fetch: makeTestFetch(new Response("ok")),
          isBrowser: true,
        },
      },
    });

    expect(state.collection?.id).toBe(
      "organization:org_123:user:user_123:role:owner:labels:settings:electric"
    );
    expect(state.health.current).toMatchObject({
      collection: "labels",
      collectionId:
        "organization:org_123:user:user_123:role:owner:labels:settings:electric",
      source: "electric",
      status: "connecting",
      subscriptionName: "labels",
    });
  });

  it("reports Settings labels sync disabled state without silently falling back", () => {
    const state = getOrCreateSettingsLabelsCollectionState({
      scope,
      sync: {
        runtime: {
          isBrowser: true,
        },
      },
    });

    expect(state.collection).toBeNull();
    expect(state.health.current).toMatchObject({
      collection: "labels",
      collectionId:
        "organization:org_123:user:user_123:role:owner:labels:settings:electric",
      disabledReason: "missing-sync-origin",
      source: "electric",
      status: "disabled",
      subscriptionName: "labels",
    });
    expect(state.health.current).not.toHaveProperty("fallbackReason");
  });

  it("scopes Settings labels collections by organization, viewer, and role", () => {
    vi.stubEnv("VITE_SYNC_ORIGIN", "https://sync.codex.ceird.localhost");

    const ownerState = getOrCreateSettingsLabelsCollectionState({
      scope,
      sync: {
        runtime: {
          fetch: makeTestFetch(new Response("ok")),
          isBrowser: true,
        },
      },
    });
    const memberState = getOrCreateSettingsLabelsCollectionState({
      scope: createOrganizationDataScope({
        organizationId: "org_456" as OrganizationId,
        role: "member",
        userId: "user_456",
      }),
      sync: {
        runtime: {
          fetch: makeTestFetch(new Response("ok")),
          isBrowser: true,
        },
      },
    });

    expect(ownerState.health.current.collectionId).toBe(
      "organization:org_123:user:user_123:role:owner:labels:settings:electric"
    );
    expect(memberState.health.current.collectionId).toBe(
      "organization:org_456:user:user_456:role:member:labels:settings:electric"
    );
  });

  it("creates Settings label usage collections from assignment-only Electric shapes", () => {
    vi.stubEnv("VITE_SYNC_ORIGIN", "https://sync.codex.ceird.localhost");

    const state = getOrCreateSettingsLabelUsageCollectionState({
      scope,
      sync: {
        runtime: {
          fetch: makeTestFetch(new Response("ok")),
          isBrowser: true,
        },
      },
    });

    expect(state.jobLabelAssignments.health.current).toMatchObject({
      collection: "job-label-assignments",
      source: "electric",
      status: "connecting",
      subscriptionName: "work-item-labels",
    });
    expect(state.siteLabelAssignments.health.current).toMatchObject({
      collection: "site-label-assignments",
      source: "electric",
      status: "connecting",
      subscriptionName: "site-labels",
    });
  });

  it("normalizes deployed Electric assignment rows for label usage counts", () => {
    expect(
      toLabelUsageJobAssignmentElectricRow({
        created_at: "2026-06-14 00:00:00+00",
        label_id: label.id,
        work_item_id: "job_123",
      })
    ).toStrictEqual({
      createdAt: "2026-06-14T00:00:00.000Z",
      labelId: label.id,
      workItemId: "job_123",
    });
    expect(
      toLabelUsageSiteAssignmentElectricRow({
        created_at: "2026-06-15 00:00:00+00",
        label_id: label.id,
        site_id: "site_123",
      })
    ).toStrictEqual({
      createdAt: "2026-06-15T00:00:00.000Z",
      labelId: label.id,
      siteId: "site_123",
    });
  });

  it("filters Settings labels from the local synced label set", () => {
    const urgentLabel = {
      ...label,
      id: "22222222-2222-4222-8222-222222222222" as Label["id"],
      name: "Urgent",
    } satisfies Label;
    const electricalLabel = {
      ...label,
      description: "Panels and lighting",
      id: "33333333-3333-4333-8333-333333333333" as Label["id"],
      name: "Electrical",
    } satisfies Label;

    expect(
      searchSettingsLabels([label, urgentLabel, electricalLabel], "ur")
    ).toStrictEqual([urgentLabel]);
    expect(
      searchSettingsLabels([electricalLabel, label, urgentLabel], "")
    ).toStrictEqual([electricalLabel, label, urgentLabel]);
    expect(
      searchSettingsLabels([label, urgentLabel, electricalLabel], "lighting")
    ).toStrictEqual([electricalLabel]);
  });

  it("derives job and site usage counts for active and archived labels", () => {
    const archivedLabel = {
      ...label,
      archivedAt: "2026-06-18T10:00:00.000Z",
      id: "22222222-2222-4222-8222-222222222222" as Label["id"],
      name: "Archived Plumbing",
    } satisfies Label;

    const counts = deriveLabelUsageCounts({
      jobAssignments: [
        { labelId: label.id, targetId: "job_1" },
        { labelId: label.id, targetId: "job_1" },
        { labelId: archivedLabel.id, targetId: "job_2" },
      ],
      labels: [label, archivedLabel],
      siteAssignments: [
        { labelId: label.id, targetId: "site_1" },
        { labelId: archivedLabel.id, targetId: "site_2" },
        { labelId: archivedLabel.id, targetId: "site_3" },
      ],
    });

    expect(counts.get(label.id)).toStrictEqual({ jobs: 1, sites: 1 });
    expect(counts.get(archivedLabel.id)).toStrictEqual({
      jobs: 1,
      sites: 2,
    });
  });

  it("normalizes deployed Electric label rows before decoding the label contract", () => {
    expect(
      toLabelElectricRow({
        archived_at: null,
        color: label.color,
        created_at: "2026-06-14 00:00:00+00",
        description: null,
        id: label.id,
        name: label.name,
        updated_at: "2026-06-14 00:00:00+00",
      })
    ).toStrictEqual(label);
  });

  it("returns txid matching strategies for label Electric observation", async () => {
    const updatedLabel = {
      ...label,
      color: "oklch(63% 0.18 255)",
      description: "Updated description",
      name: "Electrical",
    } satisfies Label;
    const createLabel = vi.fn<(input: CreateLabelInput) => LabelWriteEffect>(
      (input) =>
        Effect.succeed(makeLabelWriteResponse({ ...label, ...input }, 101))
    );
    const updateLabel = vi.fn<
      (labelId: Label["id"], input: UpdateLabelInput) => LabelWriteEffect
    >((_labelId, input) =>
      Effect.succeed(makeLabelWriteResponse({ ...label, ...input }, 102))
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
      responses: [makeLabelWriteResponse(label, 101)],
      timeout: 10_000,
      txid: 101,
    });
    expect(createLabel).toHaveBeenCalledExactlyOnceWith({
      color: DEFAULT_LABEL_COLOR,
      description: null,
      name: "Plumbing",
    });

    await expect(
      onUpdate({
        collection: {},
        transaction: {
          mutations: [{ modified: updatedLabel, original: label }],
        },
      } as unknown as Parameters<typeof onUpdate>[0])
    ).resolves.toStrictEqual({
      responses: [makeLabelWriteResponse(updatedLabel, 102)],
      timeout: 10_000,
      txid: 102,
    });
    expect(updateLabel).toHaveBeenCalledExactlyOnceWith(label.id, {
      color: "oklch(63% 0.18 255)",
      description: "Updated description",
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
      responses: [makeLabelWriteResponse(label, 103)],
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
