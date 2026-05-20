"use client";
import type { OrganizationId } from "@ceird/identity-core";
import type {
  CreateRateCardInput,
  CreateRateCardResponse,
  RateCard,
  RateCardIdType,
  RateCardListResponse,
  UpdateRateCardInput,
  UpdateRateCardResponse,
} from "@ceird/jobs-core";
import { RateCardSchema } from "@ceird/jobs-core";
import type {
  CreateServiceAreaInput,
  CreateServiceAreaResponse,
  ServiceArea,
  ServiceAreaIdType,
  ServiceAreaListResponse,
  UpdateServiceAreaInput,
  UpdateServiceAreaResponse,
} from "@ceird/sites-core";
import { ServiceAreaSchema } from "@ceird/sites-core";
import {
  createCollection,
  localOnlyCollectionOptions,
} from "@tanstack/react-db";
import { Cause, Effect, Exit, Schema } from "effect";
import { use } from "react";
import * as React from "react";

import { runBrowserAppApiRequest } from "#/features/api/app-api-client";
import type { AppApiError } from "#/features/api/app-api-errors";
import { withMinimumMutationPendingDurationEffect } from "#/lib/mutation-feedback-effect";

type ServiceAreasCollection = ReturnType<typeof makeServiceAreasCollection>;
type RateCardsCollection = ReturnType<typeof makeRateCardsCollection>;

export interface OrganizationAsyncResult {
  readonly error: unknown | null;
  readonly waiting: boolean;
}

interface OrganizationConfigurationStore {
  readonly organizationId: OrganizationId;
  readonly rateCards: RateCardsCollection;
  readonly serviceAreas: ServiceAreasCollection;
}

interface OrganizationConfigurationContextValue {
  readonly createRateCard: (
    input: CreateRateCardInput
  ) => Promise<Exit.Exit<CreateRateCardResponse, AppApiError>>;
  readonly createRateCardResult: OrganizationAsyncResult;
  readonly createServiceArea: (
    input: CreateServiceAreaInput
  ) => Promise<Exit.Exit<CreateServiceAreaResponse, AppApiError>>;
  readonly createServiceAreaResult: OrganizationAsyncResult;
  readonly listRateCardsResult: OrganizationAsyncResult;
  readonly listServiceAreasResult: OrganizationAsyncResult;
  readonly loadRateCards: () => Promise<
    Exit.Exit<RateCardListResponse, AppApiError>
  >;
  readonly loadServiceAreas: () => Promise<
    Exit.Exit<ServiceAreaListResponse, AppApiError>
  >;
  readonly store: OrganizationConfigurationStore;
  readonly updateRateCard: (
    rateCardId: RateCardIdType,
    input: UpdateRateCardInput
  ) => Promise<Exit.Exit<UpdateRateCardResponse, AppApiError>>;
  readonly updateRateCardResults: Readonly<
    Partial<Record<RateCardIdType, OrganizationAsyncResult>>
  >;
  readonly updateServiceArea: (
    serviceAreaId: ServiceAreaIdType,
    input: UpdateServiceAreaInput
  ) => Promise<Exit.Exit<UpdateServiceAreaResponse, AppApiError>>;
  readonly updateServiceAreaResults: Readonly<
    Partial<Record<ServiceAreaIdType, OrganizationAsyncResult>>
  >;
}

const OrganizationConfigurationContext =
  React.createContext<OrganizationConfigurationContextValue | null>(null);

const idleOrganizationAsyncResult: OrganizationAsyncResult = {
  error: null,
  waiting: false,
};

const waitingOrganizationAsyncResult: OrganizationAsyncResult = {
  error: null,
  waiting: true,
};

interface OrganizationConfigurationAsyncState {
  readonly createRateCardResult: OrganizationAsyncResult;
  readonly createServiceAreaResult: OrganizationAsyncResult;
  readonly listRateCardsResult: OrganizationAsyncResult;
  readonly listServiceAreasResult: OrganizationAsyncResult;
  readonly updateRateCardResults: Readonly<
    Partial<Record<RateCardIdType, OrganizationAsyncResult>>
  >;
  readonly updateServiceAreaResults: Readonly<
    Partial<Record<ServiceAreaIdType, OrganizationAsyncResult>>
  >;
}

type OrganizationConfigurationAsyncAction =
  | {
      readonly result: OrganizationAsyncResult;
      readonly type: "set-create-rate-card-result";
    }
  | {
      readonly result: OrganizationAsyncResult;
      readonly type: "set-create-service-area-result";
    }
  | {
      readonly result: OrganizationAsyncResult;
      readonly type: "set-list-rate-cards-result";
    }
  | {
      readonly result: OrganizationAsyncResult;
      readonly type: "set-list-service-areas-result";
    }
  | {
      readonly rateCardId: RateCardIdType;
      readonly result: OrganizationAsyncResult;
      readonly type: "set-update-rate-card-result";
    }
  | {
      readonly result: OrganizationAsyncResult;
      readonly serviceAreaId: ServiceAreaIdType;
      readonly type: "set-update-service-area-result";
    };

const initialOrganizationConfigurationAsyncState: OrganizationConfigurationAsyncState =
  {
    createRateCardResult: idleOrganizationAsyncResult,
    createServiceAreaResult: idleOrganizationAsyncResult,
    listRateCardsResult: idleOrganizationAsyncResult,
    listServiceAreasResult: idleOrganizationAsyncResult,
    updateRateCardResults: {},
    updateServiceAreaResults: {},
  };

export function OrganizationConfigurationProvider({
  children,
  organizationId,
}: {
  readonly children: React.ReactNode;
  readonly organizationId: OrganizationId;
}) {
  const store = React.useMemo(
    () => makeOrganizationConfigurationStore(organizationId),
    [organizationId]
  );
  const [asyncState, dispatchAsyncState] = React.useReducer(
    organizationConfigurationAsyncReducer,
    initialOrganizationConfigurationAsyncState
  );
  const {
    createRateCardResult,
    createServiceAreaResult,
    listRateCardsResult,
    listServiceAreasResult,
    updateRateCardResults,
    updateServiceAreaResults,
  } = asyncState;

  React.useEffect(
    () => () => {
      void store.serviceAreas.cleanup();
      void store.rateCards.cleanup();
    },
    [store]
  );

  const loadServiceAreas = React.useCallback(
    () =>
      runOrganizationOperation(
        listBrowserServiceAreas(),
        (result) =>
          dispatchAsyncState({
            result,
            type: "set-list-service-areas-result",
          }),
        async (response) => {
          const current = serviceAreasFromCollection(store.serviceAreas);
          await replaceServiceAreas(
            store.serviceAreas,
            mergeServiceAreaList(response, { items: current }).items
          );
        }
      ),
    [store]
  );

  const createServiceArea = React.useCallback(
    (input: CreateServiceAreaInput) =>
      runOrganizationOperation(
        withMinimumMutationPendingDurationEffect(
          createBrowserServiceArea(input)
        ),
        (result) =>
          dispatchAsyncState({
            result,
            type: "set-create-service-area-result",
          }),
        async (serviceArea) => {
          await upsertServiceAreaCollectionItem(
            store.serviceAreas,
            serviceArea
          );
        }
      ),
    [store]
  );

  const updateServiceArea = React.useCallback(
    (serviceAreaId: ServiceAreaIdType, input: UpdateServiceAreaInput) =>
      runOrganizationOperation(
        withMinimumMutationPendingDurationEffect(
          updateBrowserServiceArea(serviceAreaId, input)
        ),
        (result) => {
          dispatchAsyncState({
            result,
            serviceAreaId,
            type: "set-update-service-area-result",
          });
        },
        async (serviceArea) => {
          await upsertServiceAreaCollectionItem(
            store.serviceAreas,
            serviceArea
          );
        }
      ),
    [store]
  );

  const loadRateCards = React.useCallback(
    () =>
      runOrganizationOperation(
        listBrowserRateCards(),
        (result) =>
          dispatchAsyncState({
            result,
            type: "set-list-rate-cards-result",
          }),
        async (response) => {
          const current = rateCardsFromCollection(store.rateCards);
          await replaceRateCards(
            store.rateCards,
            mergeRateCardList(response, { items: current }).items
          );
        }
      ),
    [store]
  );

  const createRateCard = React.useCallback(
    (input: CreateRateCardInput) =>
      runOrganizationOperation(
        withMinimumMutationPendingDurationEffect(createBrowserRateCard(input)),
        (result) =>
          dispatchAsyncState({
            result,
            type: "set-create-rate-card-result",
          }),
        async (rateCard) => {
          await upsertRateCardCollectionItem(store.rateCards, rateCard);
        }
      ),
    [store]
  );

  const updateRateCard = React.useCallback(
    (rateCardId: RateCardIdType, input: UpdateRateCardInput) =>
      runOrganizationOperation(
        withMinimumMutationPendingDurationEffect(
          updateBrowserRateCard(rateCardId, input)
        ),
        (result) => {
          dispatchAsyncState({
            rateCardId,
            result,
            type: "set-update-rate-card-result",
          });
        },
        async (rateCard) => {
          await upsertRateCardCollectionItem(store.rateCards, rateCard);
        }
      ),
    [store]
  );

  const value = React.useMemo<OrganizationConfigurationContextValue>(
    () => ({
      createRateCard,
      createRateCardResult,
      createServiceArea,
      createServiceAreaResult,
      listRateCardsResult,
      listServiceAreasResult,
      loadRateCards,
      loadServiceAreas,
      store,
      updateRateCard,
      updateRateCardResults,
      updateServiceArea,
      updateServiceAreaResults,
    }),
    [
      createRateCard,
      createRateCardResult,
      createServiceArea,
      createServiceAreaResult,
      listRateCardsResult,
      listServiceAreasResult,
      loadRateCards,
      loadServiceAreas,
      store,
      updateRateCard,
      updateRateCardResults,
      updateServiceArea,
      updateServiceAreaResults,
    ]
  );

  return (
    <OrganizationConfigurationContext.Provider value={value}>
      {children}
    </OrganizationConfigurationContext.Provider>
  );
}

export function useOrganizationServiceAreas() {
  const { store } = useOrganizationConfigurationContext();
  const serviceAreas = useServiceAreaCollectionItems(store.serviceAreas);

  return React.useMemo(() => sortServiceAreas(serviceAreas), [serviceAreas]);
}

export function useOrganizationRateCards() {
  const { store } = useOrganizationConfigurationContext();
  const rateCards = useRateCardCollectionItems(store.rateCards);

  return React.useMemo(() => sortRateCards(rateCards), [rateCards]);
}

export function useListServiceAreasMutation() {
  const { listServiceAreasResult, loadServiceAreas } =
    useOrganizationConfigurationContext();

  return [listServiceAreasResult, loadServiceAreas] as const;
}

export function useCreateServiceAreaMutation() {
  const { createServiceArea, createServiceAreaResult } =
    useOrganizationConfigurationContext();

  return [createServiceAreaResult, createServiceArea] as const;
}

export function useUpdateServiceAreaMutation(serviceAreaId: ServiceAreaIdType) {
  const { updateServiceArea, updateServiceAreaResults } =
    useOrganizationConfigurationContext();

  return [
    updateServiceAreaResults[serviceAreaId] ?? idleOrganizationAsyncResult,
    React.useCallback(
      (input: UpdateServiceAreaInput) =>
        updateServiceArea(serviceAreaId, input),
      [serviceAreaId, updateServiceArea]
    ),
  ] as const;
}

export function useListRateCardsMutation() {
  const { listRateCardsResult, loadRateCards } =
    useOrganizationConfigurationContext();

  return [listRateCardsResult, loadRateCards] as const;
}

export function useCreateRateCardMutation() {
  const { createRateCard, createRateCardResult } =
    useOrganizationConfigurationContext();

  return [createRateCardResult, createRateCard] as const;
}

export function useUpdateRateCardMutation(rateCardId: RateCardIdType) {
  const { updateRateCard, updateRateCardResults } =
    useOrganizationConfigurationContext();

  return [
    updateRateCardResults[rateCardId] ?? idleOrganizationAsyncResult,
    React.useCallback(
      (input: UpdateRateCardInput) => updateRateCard(rateCardId, input),
      [rateCardId, updateRateCard]
    ),
  ] as const;
}

export function isOrganizationAsyncFailure(
  result: OrganizationAsyncResult
): boolean {
  return result.error !== null;
}

function makeOrganizationConfigurationStore(
  organizationId: OrganizationId
): OrganizationConfigurationStore {
  return {
    organizationId,
    rateCards: makeRateCardsCollection(organizationId),
    serviceAreas: makeServiceAreasCollection(organizationId),
  };
}

function makeServiceAreasCollection(organizationId: OrganizationId) {
  return createCollection(
    localOnlyCollectionOptions({
      id: `organization:${organizationId}:service-areas`,
      getKey: (serviceArea) => serviceArea.id,
      schema: Schema.toStandardSchemaV1(ServiceAreaSchema),
    })
  );
}

function makeRateCardsCollection(organizationId: OrganizationId) {
  return createCollection(
    localOnlyCollectionOptions({
      id: `organization:${organizationId}:rate-cards`,
      getKey: (rateCard) => rateCard.id,
      schema: Schema.toStandardSchemaV1(RateCardSchema),
    })
  );
}

function useOrganizationConfigurationContext() {
  const context = use(OrganizationConfigurationContext);

  if (!context) {
    throw new Error(
      "Organization configuration state must be used inside OrganizationConfigurationProvider."
    );
  }

  return context;
}

function organizationConfigurationAsyncReducer(
  state: OrganizationConfigurationAsyncState,
  action: OrganizationConfigurationAsyncAction
): OrganizationConfigurationAsyncState {
  switch (action.type) {
    case "set-create-rate-card-result": {
      return {
        ...state,
        createRateCardResult: action.result,
      };
    }

    case "set-create-service-area-result": {
      return {
        ...state,
        createServiceAreaResult: action.result,
      };
    }

    case "set-list-rate-cards-result": {
      return {
        ...state,
        listRateCardsResult: action.result,
      };
    }

    case "set-list-service-areas-result": {
      return {
        ...state,
        listServiceAreasResult: action.result,
      };
    }

    case "set-update-rate-card-result": {
      return {
        ...state,
        updateRateCardResults: {
          ...state.updateRateCardResults,
          [action.rateCardId]: action.result,
        },
      };
    }

    case "set-update-service-area-result": {
      return {
        ...state,
        updateServiceAreaResults: {
          ...state.updateServiceAreaResults,
          [action.serviceAreaId]: action.result,
        },
      };
    }

    default: {
      const exhaustiveAction: never = action;
      return exhaustiveAction;
    }
  }
}

function useServiceAreaCollectionItems(
  collection: ServiceAreasCollection
): readonly ServiceArea[] {
  const [items, setItems] = React.useState(() =>
    serviceAreasFromCollection(collection)
  );

  React.useEffect(() => {
    let active = true;
    const refresh = () => {
      if (active) {
        setItems(serviceAreasFromCollection(collection));
      }
    };
    const subscription = collection.subscribeChanges(refresh);

    refresh();
    void (async () => {
      try {
        await collection.preload();
      } catch (error) {
        void error;
      } finally {
        refresh();
      }
    })();

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [collection]);

  return items;
}

function useRateCardCollectionItems(
  collection: RateCardsCollection
): readonly RateCard[] {
  const [items, setItems] = React.useState(() =>
    rateCardsFromCollection(collection)
  );

  React.useEffect(() => {
    let active = true;
    const refresh = () => {
      if (active) {
        setItems(rateCardsFromCollection(collection));
      }
    };
    const subscription = collection.subscribeChanges(refresh);

    refresh();
    void (async () => {
      try {
        await collection.preload();
      } catch (error) {
        void error;
      } finally {
        refresh();
      }
    })();

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [collection]);

  return items;
}

async function runOrganizationOperation<Success>(
  effect: Effect.Effect<Success, AppApiError>,
  setResult: (result: OrganizationAsyncResult) => void,
  onSuccess: (value: Success) => Promise<void>
): Promise<Exit.Exit<Success, AppApiError>> {
  setResult(waitingOrganizationAsyncResult);
  const exit = await Effect.runPromiseExit(effect);

  if (Exit.isSuccess(exit)) {
    await onSuccess(exit.value);
    setResult(idleOrganizationAsyncResult);
    return exit;
  }

  setResult({
    error: Cause.squash(exit.cause),
    waiting: false,
  });

  return exit;
}

function listBrowserServiceAreas() {
  return runBrowserAppApiRequest(
    "OrganizationConfigurationBrowser.listServiceAreas",
    (client) => client.serviceAreas.listServiceAreas()
  );
}

function createBrowserServiceArea(input: CreateServiceAreaInput) {
  return runBrowserAppApiRequest(
    "OrganizationConfigurationBrowser.createServiceArea",
    (client) =>
      client.serviceAreas.createServiceArea({
        payload: input,
      })
  );
}

function updateBrowserServiceArea(
  serviceAreaId: ServiceAreaIdType,
  input: UpdateServiceAreaInput
) {
  return runBrowserAppApiRequest(
    "OrganizationConfigurationBrowser.updateServiceArea",
    (client) =>
      client.serviceAreas.updateServiceArea({
        params: { serviceAreaId },
        payload: input,
      })
  );
}

function listBrowserRateCards() {
  return runBrowserAppApiRequest(
    "OrganizationConfigurationBrowser.listRateCards",
    (client) => client.rateCards.listRateCards()
  );
}

function createBrowserRateCard(input: CreateRateCardInput) {
  return runBrowserAppApiRequest(
    "OrganizationConfigurationBrowser.createRateCard",
    (client) =>
      client.rateCards.createRateCard({
        payload: input,
      })
  );
}

function updateBrowserRateCard(
  rateCardId: RateCardIdType,
  input: UpdateRateCardInput
) {
  return runBrowserAppApiRequest(
    "OrganizationConfigurationBrowser.updateRateCard",
    (client) =>
      client.rateCards.updateRateCard({
        params: { rateCardId },
        payload: input,
      })
  );
}

async function replaceServiceAreas(
  collection: ServiceAreasCollection,
  serviceAreas: readonly ServiceArea[]
) {
  const existingKeys = [...collection.keys()];

  if (existingKeys.length > 0) {
    await collection.delete(existingKeys).isPersisted.promise;
  }

  if (serviceAreas.length > 0) {
    await collection.insert([...serviceAreas]).isPersisted.promise;
  }
}

async function replaceRateCards(
  collection: RateCardsCollection,
  rateCards: readonly RateCard[]
) {
  const existingKeys = [...collection.keys()];

  if (existingKeys.length > 0) {
    await collection.delete(existingKeys).isPersisted.promise;
  }

  if (rateCards.length > 0) {
    await collection.insert([...rateCards]).isPersisted.promise;
  }
}

async function upsertServiceAreaCollectionItem(
  collection: ServiceAreasCollection,
  serviceArea: ServiceArea
) {
  if (collection.has(serviceArea.id)) {
    await collection.update(serviceArea.id, (draft) => {
      draft.description = serviceArea.description;
      draft.name = serviceArea.name;
    }).isPersisted.promise;
    return;
  }

  await collection.insert(serviceArea).isPersisted.promise;
}

async function upsertRateCardCollectionItem(
  collection: RateCardsCollection,
  rateCard: RateCard
) {
  if (collection.has(rateCard.id)) {
    await collection.update(rateCard.id, (draft) => {
      draft.createdAt = rateCard.createdAt;
      draft.lines = [...rateCard.lines];
      draft.name = rateCard.name;
      draft.updatedAt = rateCard.updatedAt;
    }).isPersisted.promise;
    return;
  }

  await collection.insert(rateCard).isPersisted.promise;
}

function serviceAreasFromCollection(
  collection: ServiceAreasCollection
): readonly ServiceArea[] {
  return collection.toArray.map(withoutVirtualProps);
}

function rateCardsFromCollection(
  collection: RateCardsCollection
): readonly RateCard[] {
  return collection.toArray.map(withoutVirtualProps);
}

function mergeServiceAreaList(
  response: ServiceAreaListResponse,
  current: ServiceAreaListResponse
): ServiceAreaListResponse {
  return {
    items: mergeByIdSortedByName(response.items, current.items),
  };
}

function mergeRateCardList(
  response: RateCardListResponse,
  current: RateCardListResponse
): RateCardListResponse {
  return {
    items: mergeByIdSortedByName(response.items, current.items),
  };
}

function mergeByIdSortedByName<
  Item extends { readonly id: string; readonly name: string },
>(responseItems: readonly Item[], currentItems: readonly Item[]) {
  const itemsById = new Map<string, Item>();

  for (const item of responseItems) {
    itemsById.set(item.id, item);
  }

  for (const item of currentItems) {
    if (!itemsById.has(item.id)) {
      itemsById.set(item.id, item);
    }
  }

  return [...itemsById.values()].toSorted(compareByNameThenId);
}

function sortServiceAreas(items: readonly ServiceArea[]) {
  return items.toSorted(compareByNameThenId);
}

function sortRateCards(items: readonly RateCard[]) {
  return items.toSorted(compareByNameThenId);
}

function compareByNameThenId(
  left: { readonly id: string; readonly name: string },
  right: { readonly id: string; readonly name: string }
) {
  const nameComparison = left.name.localeCompare(right.name);

  return nameComparison === 0
    ? left.id.localeCompare(right.id)
    : nameComparison;
}

function withoutVirtualProps<Item extends object>(item: Item): Item {
  const {
    $collectionId: _collectionId,
    $key: _key,
    $origin: _origin,
    $synced: _synced,
    ...data
  } = item as Item & {
    readonly $collectionId?: unknown;
    readonly $key?: unknown;
    readonly $origin?: unknown;
    readonly $synced?: unknown;
  };

  void _collectionId;
  void _key;
  void _origin;
  void _synced;

  return data as Item;
}
