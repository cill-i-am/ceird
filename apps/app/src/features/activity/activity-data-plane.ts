import { ProductActivityEventSchema } from "@ceird/activity-core";
import type {
  ActivityEventStatus,
  ActivityEventTargetType,
  ActivityEventType,
  ProductActivityEvent,
} from "@ceird/activity-core";
import { ProductActorSchema } from "@ceird/identity-core";
import type { ProductActor, ProductActorId } from "@ceird/identity-core";
import type { StandardSchemaV1 } from "@standard-schema/spec";
import { Schema } from "effect";

import {
  filteredQueryCollectionCompleteness,
  syncBackedCollectionCompleteness,
} from "#/data-plane/collection-contract";
import type { DataPlaneCollectionHealth } from "#/data-plane/collection-health";
import {
  createElectricCollectionFromContract,
  defineElectricCollectionContract,
} from "#/data-plane/electric-collection";
import type { CreateDataPlaneElectricCollectionOptions } from "#/data-plane/electric-collection";
import { organizationDataQueryKey } from "#/data-plane/query-scope";
import type { OrganizationDataScope } from "#/data-plane/query-scope";
import type { DataPlaneSession } from "#/data-plane/session";

type ActivityEventsElectricRowValue =
  | bigint
  | boolean
  | null
  | number
  | string
  | ActivityEventsElectricRowValue[]
  | { readonly [key: string]: ActivityEventsElectricRowValue };
type ActivityEventsElectricRow = Record<string, ActivityEventsElectricRowValue>;

interface ActivityCollection<Item extends object> {
  readonly status: string;
  entries: () => Iterable<[string | number, Item]>;
  subscribeChanges: (callback: () => void) => {
    requestSnapshot?: (options?: { readonly optimizedOnly?: boolean }) => void;
    unsubscribe: () => void;
  };
}

type ActivityEventsCollection = ActivityCollection<ProductActivityEvent>;
type ProductActivityActorsCollection = ActivityCollection<ProductActor>;

const ProductActivityEventElectricStandardSchema = Schema.toStandardSchemaV1(
  ProductActivityEventSchema
) as unknown as StandardSchemaV1<unknown, ActivityEventsElectricRow>;
const ProductActorElectricStandardSchema = Schema.toStandardSchemaV1(
  ProductActorSchema
) as unknown as StandardSchemaV1<unknown, ActivityEventsElectricRow>;

export interface ActivityEventsCollectionState {
  readonly collection: ActivityEventsCollection | null;
  readonly health: DataPlaneCollectionHealth;
}

export interface ProductActivityActorsCollectionState {
  readonly collection: ProductActivityActorsCollection | null;
  readonly health: DataPlaneCollectionHealth;
}

export interface ActivityFeedFilters {
  readonly eventType?: ActivityEventType | undefined;
  readonly status?: ActivityEventStatus | undefined;
  readonly targetType?: ActivityEventTargetType | undefined;
}

export interface ActivityFeedRow {
  readonly actor?: ProductActor | undefined;
  readonly event: ProductActivityEvent;
}

export function activityEventsCollectionKey(scope: OrganizationDataScope) {
  return organizationDataQueryKey("activity-events", scope);
}

export function activityEventsCollectionId(scope: OrganizationDataScope) {
  return `organization:${scope.organizationId}:user:${scope.userId ?? "unknown"}:role:${scope.role ?? "unknown"}:activity-events`;
}

export function getOrCreateActivityEventsCollectionState({
  scope,
  session,
  sync,
}: {
  readonly scope: OrganizationDataScope;
  readonly session?: DataPlaneSession | undefined;
  readonly sync?: CreateDataPlaneElectricCollectionOptions | undefined;
}): ActivityEventsCollectionState {
  const registryKey = activityEventsCollectionId(scope);
  const existing = session?.registry.get(registryKey);

  if (existing) {
    return existing as ActivityEventsCollectionState;
  }

  const result = createActivityEventsCollection(scope, sync);
  const created = {
    collection: result.collection as ActivityEventsCollection | null,
    health: result.health,
  } satisfies ActivityEventsCollectionState;

  session?.registry.set(registryKey, created);

  return created;
}

export function createActivityEventsElectricContract(
  scope: OrganizationDataScope
) {
  return defineElectricCollectionContract({
    collection: "activity-events",
    completeness: syncBackedCollectionCompleteness({
      covers: filteredQueryCollectionCompleteness({
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
        queryName: "activity-events.recent-retained",
      }),
      source: "electric",
      subscriptionName: "activity-events",
    }),
    getKey: (event) => String(event.id),
    id: `${activityEventsCollectionId(scope)}:electric`,
    schema: ProductActivityEventElectricStandardSchema,
    shapeName: "activity-events",
    shapeOptions: {
      transformer: toProductActivityEventElectricRow,
    },
  });
}

function createActivityEventsCollection(
  scope: OrganizationDataScope,
  sync?: CreateDataPlaneElectricCollectionOptions | undefined
) {
  return createElectricCollectionFromContract(
    createActivityEventsElectricContract(scope),
    sync
  ) as ReturnType<
    typeof createElectricCollectionFromContract<
      typeof ProductActivityEventElectricStandardSchema,
      ProductActivityEvent["id"]
    >
  >;
}

export function productActivityActorsCollectionKey(
  scope: OrganizationDataScope
) {
  return organizationDataQueryKey("product-activity-actors", scope);
}

export function productActivityActorsCollectionId(
  scope: OrganizationDataScope
) {
  return `organization:${scope.organizationId}:user:${scope.userId ?? "unknown"}:role:${scope.role ?? "unknown"}:product-activity-actors`;
}

export function getOrCreateProductActivityActorsCollectionState({
  scope,
  session,
  sync,
}: {
  readonly scope: OrganizationDataScope;
  readonly session?: DataPlaneSession | undefined;
  readonly sync?: CreateDataPlaneElectricCollectionOptions | undefined;
}): ProductActivityActorsCollectionState {
  const registryKey = productActivityActorsCollectionId(scope);
  const existing = session?.registry.get(registryKey);

  if (existing) {
    return existing as ProductActivityActorsCollectionState;
  }

  const result = createProductActivityActorsCollection(scope, sync);
  const created = {
    collection: result.collection as ProductActivityActorsCollection | null,
    health: result.health,
  } satisfies ProductActivityActorsCollectionState;

  session?.registry.set(registryKey, created);

  return created;
}

export function createProductActivityActorsElectricContract(
  scope: OrganizationDataScope
) {
  return defineElectricCollectionContract({
    collection: "product-activity-actors",
    completeness: syncBackedCollectionCompleteness({
      covers: {
        mode: "complete-tenant",
      },
      source: "electric",
      subscriptionName: "product-activity-actors",
    }),
    getKey: (actor) => String(actor.id),
    id: `${productActivityActorsCollectionId(scope)}:electric`,
    schema: ProductActorElectricStandardSchema,
    shapeName: "product-activity-actors",
    shapeOptions: {
      transformer: toProductActivityActorElectricRow,
    },
  });
}

function createProductActivityActorsCollection(
  scope: OrganizationDataScope,
  sync?: CreateDataPlaneElectricCollectionOptions | undefined
) {
  return createElectricCollectionFromContract(
    createProductActivityActorsElectricContract(scope),
    sync
  ) as ReturnType<
    typeof createElectricCollectionFromContract<
      typeof ProductActorElectricStandardSchema,
      ProductActor["id"]
    >
  >;
}

export function toProductActivityEventElectricRow(
  row: Record<string, unknown>
): ActivityEventsElectricRow {
  return {
    actorId: stringElectricValue(row, "actorId"),
    createdAt: normalizeActivityElectricDateTime(
      electricValue(row, "createdAt")
    ),
    display: parseActivityDisplay(electricValue(row, "display")),
    eventType: stringElectricValue(row, "eventType"),
    id: stringElectricValue(row, "id"),
    organizationId: stringElectricValue(row, "organizationId"),
    retainedUntil: normalizeActivityElectricDateTime(
      electricValue(row, "retainedUntil")
    ),
    sourceId: stringElectricValue(row, "sourceId"),
    sourceType: stringElectricValue(row, "sourceType"),
    status: stringElectricValue(row, "status"),
    targetId: stringElectricValue(row, "targetId"),
    targetType: stringElectricValue(row, "targetType"),
  };
}

export function toProductActivityActorElectricRow(
  row: Record<string, unknown>
): ActivityEventsElectricRow {
  const actor: ActivityEventsElectricRow = {
    displayDetail: stringElectricValue(row, "displayDetail"),
    displayName: stringElectricValue(row, "displayName"),
    id: stringElectricValue(row, "id"),
    kind: stringElectricValue(row, "kind"),
  };
  const routeHref = electricValue(row, "routeHref");
  const routeLabel = electricValue(row, "routeLabel");

  if (routeHref !== null && routeHref !== undefined) {
    actor.route = {
      href: String(routeHref),
      label:
        routeLabel === null || routeLabel === undefined
          ? String(routeHref)
          : String(routeLabel),
    };
  }

  return actor;
}

function electricValue(row: Record<string, unknown>, key: string) {
  if (key in row) {
    return row[key];
  }

  return row[toSnakeCase(key)];
}

function stringElectricValue(row: Record<string, unknown>, key: string) {
  return String(electricValue(row, key));
}

function toSnakeCase(key: string) {
  return key.replaceAll(/[A-Z]/g, (match) => `_${match.toLowerCase()}`);
}

function parseActivityDisplay(value: unknown) {
  if (typeof value !== "string") {
    return value as ActivityEventsElectricRowValue;
  }

  try {
    return JSON.parse(value) as ActivityEventsElectricRowValue;
  } catch {
    return value;
  }
}

function normalizeActivityElectricDateTime(value: unknown) {
  const raw = String(value);

  if (raw.includes("T")) {
    return raw;
  }

  const normalized = raw.replace(" ", "T").replace(/([+-]\d{2})$/, "$1:00");
  const date = new Date(normalized);

  return Number.isNaN(date.getTime()) ? raw : date.toISOString();
}

export function deriveActivityFeedRows({
  actors,
  events,
  filters,
}: {
  readonly actors: readonly ProductActor[];
  readonly events: readonly ProductActivityEvent[];
  readonly filters: ActivityFeedFilters;
}): readonly ActivityFeedRow[] {
  const actorsById = new Map<ProductActorId, ProductActor>(
    actors.map((actor) => [actor.id, actor])
  );

  return events
    .filter((event) => activityEventMatchesFilters(event, filters))
    .toSorted(compareActivityEventsByNewestFirst)
    .map((event) => ({
      actor: actorsById.get(event.actorId),
      event,
    }));
}

export function activityEventMatchesFilters(
  event: ProductActivityEvent,
  filters: ActivityFeedFilters
) {
  return (
    (filters.eventType === undefined ||
      event.eventType === filters.eventType) &&
    (filters.targetType === undefined ||
      event.targetType === filters.targetType) &&
    (filters.status === undefined || event.status === filters.status)
  );
}

function compareActivityEventsByNewestFirst(
  left: ProductActivityEvent,
  right: ProductActivityEvent
) {
  const createdAtComparison = right.createdAt.localeCompare(left.createdAt);

  return createdAtComparison === 0
    ? String(right.id).localeCompare(String(left.id))
    : createdAtComparison;
}
