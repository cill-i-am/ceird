import type { OrganizationId } from "@ceird/identity-core";
import { describe, expect, it, vi } from "vitest";

import { createOrganizationDataScope } from "#/data-plane/query-scope";

import {
  activityEventsCollectionId,
  activityEventsCollectionKey,
  createActivityEventsElectricContract,
  getOrCreateActivityEventsCollectionState,
} from "./activity-data-plane";

describe("activity data plane", () => {
  const scope = createOrganizationDataScope({
    organizationId: "org_123" as OrganizationId,
    role: "owner",
    userId: "user_123",
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("uses scoped activity collection identity", () => {
    expect(activityEventsCollectionKey(scope)).toStrictEqual([
      "activity-events",
      "organization",
      "org_123",
      "user",
      "user_123",
      "role",
      "owner",
    ]);
    expect(activityEventsCollectionId(scope)).toBe(
      "organization:org_123:user:user_123:role:owner:activity-events"
    );
  });

  it("defines the named Electric contract for global activity events", () => {
    expect(createActivityEventsElectricContract(scope)).toMatchObject({
      collection: "activity-events",
      completeness: {
        covers: {
          filters: [
            {
              field: "retainedUntil",
              operator: "custom",
              value: "retained_until > domain retention cutoff",
            },
            {
              field: "organizationRecentLimit",
              operator: "custom",
              value: "latest 5000 retained rows per organization",
            },
          ],
          mode: "filtered-query",
          queryName: "activity-events.recent-retained",
        },
        mode: "sync-backed",
        source: "electric",
        subscriptionName: "activity-events",
      },
      shapeName: "activity-events",
    });
  });

  it("exposes shared disabled health when sync origin is unavailable", () => {
    const state = getOrCreateActivityEventsCollectionState({
      scope,
      sync: {
        runtime: {
          isBrowser: true,
        },
      },
    });

    expect(state.collection).toBeNull();
    expect(state.health.current).toMatchObject({
      collection: "activity-events",
      collectionId:
        "organization:org_123:user:user_123:role:owner:activity-events:electric",
      disabledReason: "missing-sync-origin",
      source: "electric",
      status: "disabled",
      subscriptionName: "activity-events",
    });
  });

  it("reuses collection state through the data-plane registry", () => {
    vi.stubEnv("VITE_SYNC_ORIGIN", "https://sync.codex.ceird.localhost");
    const session = {
      mutationJournal: { entries: [] },
      queryClient: {},
      registry: new Map<string, unknown>(),
      scope,
    };

    const first = getOrCreateActivityEventsCollectionState({
      scope,
      session: session as never,
      sync: {
        runtime: {
          fetch: (() =>
            Promise.resolve(new Response("ok"))) as unknown as typeof fetch,
          isBrowser: true,
        },
      },
    });
    const second = getOrCreateActivityEventsCollectionState({
      scope,
      session: session as never,
    });

    expect(second).toBe(first);
    expect(
      session.registry.has(activityEventsCollectionId(scope))
    ).toBeTruthy();
  });
});
