import type {
  ActivityEventIdType,
  ProductActivityEvent,
} from "@ceird/activity-core";
import { ProductActivityEventSchema } from "@ceird/activity-core";
import type {
  OrganizationId,
  ProductActor,
  ProductActorId,
} from "@ceird/identity-core";
import { ProductActorSchema } from "@ceird/identity-core";
import { Schema } from "effect";
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
  toProductActivityActorElectricRow,
  toProductActivityEventElectricRow,
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

  it("normalizes Postgres Electric rows for global activity events", () => {
    const transformed = toProductActivityEventElectricRow({
      actor_id: "019ed88e-a47d-77c9-8195-504c126e8402",
      created_at: "2026-06-18 02:28:07.428+00",
      display: JSON.stringify({
        detail: 'Label "TSK229 Label 34afa68c" was created.',
        route: {
          href: "/organization/settings/labels",
          label: "TSK229 Label 34afa68c",
        },
        summary: "Label created",
      }),
      event_type: "label.created",
      id: "019ed88e-a484-73ca-8715-1823df6cdf83",
      organization_id: "AUPMmj65MuRnk94UJExUIemBLhTq6HRY",
      retained_until: "2026-07-18 02:28:07.428+00",
      source_id: "label.created:019ed88e-a46d-7049-887b-dc7b163797be",
      source_type: "label",
      status: "synced",
      target_id: "019ed88e-a46d-7049-887b-dc7b163797be",
      target_type: "label",
    });

    expect(
      Schema.decodeUnknownSync(ProductActivityEventSchema)(transformed)
    ).toMatchObject({
      createdAt: "2026-06-18T02:28:07.428Z",
      display: {
        summary: "Label created",
      },
      eventType: "label.created",
      retainedUntil: "2026-07-18T02:28:07.428Z",
    });
  });

  it("normalizes product-safe actor Electric rows", () => {
    const transformed = toProductActivityActorElectricRow({
      created_at: "2026-06-18 02:28:07.442397+00",
      display_detail: "Team member",
      display_name: "TSK229 Owner 34afa68c",
      id: "019ed88e-a47d-77c9-8195-504c126e8402",
      kind: "member",
      organization_id: "AUPMmj65MuRnk94UJExUIemBLhTq6HRY",
      route_href: "/members/owner",
      route_label: "Owner",
      updated_at: "2026-06-18 02:28:07.442397+00",
    });

    expect(
      Schema.decodeUnknownSync(ProductActorSchema)(transformed)
    ).toStrictEqual({
      displayDetail: "Team member",
      displayName: "TSK229 Owner 34afa68c",
      id: "019ed88e-a47d-77c9-8195-504c126e8402",
      kind: "member",
      route: {
        href: "/members/owner",
        label: "Owner",
      },
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
