import { ProductActivityEventSchema } from "@ceird/activity-core";
import type { ProductActivityEvent } from "@ceird/activity-core";
import type { StandardSchemaV1 } from "@standard-schema/spec";
import { Schema } from "effect";

import {
  COMPLETE_TENANT_COLLECTION,
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
type ActivityEventsCollection = NonNullable<
  ReturnType<typeof createActivityEventsCollection>["collection"]
>;

const ProductActivityEventElectricStandardSchema = Schema.toStandardSchemaV1(
  ProductActivityEventSchema
) as unknown as StandardSchemaV1<unknown, ActivityEventsElectricRow>;

export interface ActivityEventsCollectionState {
  readonly collection: ActivityEventsCollection | null;
  readonly health: DataPlaneCollectionHealth;
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
    collection: result.collection,
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
      covers: COMPLETE_TENANT_COLLECTION,
      source: "electric",
      subscriptionName: "activity-events",
    }),
    getKey: (event) => String(event.id),
    id: `${activityEventsCollectionId(scope)}:electric`,
    schema: ProductActivityEventElectricStandardSchema,
    shapeName: "activity-events",
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
