import type {
  ActivityEventIdType,
  ProductActivityEvent,
} from "@ceird/activity-core";
import type {
  OrganizationId,
  ProductActor,
  ProductActorId,
} from "@ceird/identity-core";
import { describe, expect, it, vi } from "vitest";

import { createOrganizationDataScope } from "#/data-plane/query-scope";

import {
  activityEventsCollectionId,
  activityEventsCollectionKey,
  createActivityEventsElectricContract,
  createProductActivityActorsElectricContract,
  deriveActivityFeedRows,
  getOrCreateActivityEventsCollectionState,
  getOrCreateProductActivityActorsCollectionState,
  productActivityActorsCollectionId,
  productActivityActorsCollectionKey,
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

  it("uses scoped product activity actor collection identity", () => {
    expect(productActivityActorsCollectionKey(scope)).toStrictEqual([
      "product-activity-actors",
      "organization",
      "org_123",
      "user",
      "user_123",
      "role",
      "owner",
    ]);
    expect(productActivityActorsCollectionId(scope)).toBe(
      "organization:org_123:user:user_123:role:owner:product-activity-actors"
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
              value: "retained_until > domain current time",
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

  it("defines the named Electric contract for product-safe activity actors", () => {
    expect(createProductActivityActorsElectricContract(scope)).toMatchObject({
      collection: "product-activity-actors",
      completeness: {
        covers: {
          mode: "complete-tenant",
        },
        mode: "sync-backed",
        source: "electric",
        subscriptionName: "product-activity-actors",
      },
      shapeName: "product-activity-actors",
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

  it("reuses product activity actor state through the data-plane registry", () => {
    vi.stubEnv("VITE_SYNC_ORIGIN", "https://sync.codex.ceird.localhost");
    const session = {
      mutationJournal: { entries: [] },
      queryClient: {},
      registry: new Map<string, unknown>(),
      scope,
    };

    const first = getOrCreateProductActivityActorsCollectionState({
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
    const second = getOrCreateProductActivityActorsCollectionState({
      scope,
      session: session as never,
    });

    expect(second).toBe(first);
    expect(
      session.registry.has(productActivityActorsCollectionId(scope))
    ).toBeTruthy();
  });

  it("derives locally filtered feed rows with product-safe actor display", () => {
    const actorId = "77777777-7777-4777-8777-777777777777" as ProductActorId;
    const actors = [
      {
        displayName: "Taylor Owner",
        id: actorId,
        kind: "member",
      },
    ] satisfies readonly ProductActor[];
    const events = [
      makeActivityEvent({
        actorId,
        createdAt: "2026-04-28T10:15:00.000Z",
        eventType: "job.created",
        id: "11111111-1111-4111-8111-111111111111" as ActivityEventIdType,
        targetType: "job",
      }),
      makeActivityEvent({
        actorId,
        createdAt: "2026-04-29T10:15:00.000Z",
        eventType: "site.updated",
        id: "22222222-2222-4222-8222-222222222222" as ActivityEventIdType,
        targetType: "site",
      }),
    ] satisfies readonly ProductActivityEvent[];

    expect(
      deriveActivityFeedRows({
        actors,
        events,
        filters: {
          eventType: "site.updated",
          targetType: "site",
        },
      })
    ).toStrictEqual([
      {
        actor: actors[0],
        event: events[1],
      },
    ]);
    expect(
      deriveActivityFeedRows({
        actors,
        events,
        filters: {},
      }).map((row) => row.event.id)
    ).toStrictEqual([
      "22222222-2222-4222-8222-222222222222",
      "11111111-1111-4111-8111-111111111111",
    ]);
  });
});

function makeActivityEvent(
  overrides: Pick<
    ProductActivityEvent,
    "actorId" | "createdAt" | "eventType" | "id" | "targetType"
  >
): ProductActivityEvent {
  return {
    actorId: overrides.actorId,
    createdAt: overrides.createdAt,
    display: {
      summary: "Activity summary",
    },
    eventType: overrides.eventType,
    id: overrides.id,
    organizationId: "org_123" as OrganizationId,
    retainedUntil: "2026-05-28T10:15:00.000Z",
    sourceId: overrides.id,
    sourceType: overrides.targetType === "site" ? "site" : "job_activity",
    status: "synced",
    targetId: overrides.id,
    targetType: overrides.targetType,
  };
}
