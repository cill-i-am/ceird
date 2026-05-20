"use client";
import type { OrganizationId } from "@ceird/identity-core";
import type {
  CreateRateCardInput,
  CreateRateCardResponse,
  RateCard,
  RateCardIdType,
  RateCardLineIdType,
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
import { QueryClient } from "@tanstack/query-core";
import { queryCollectionOptions } from "@tanstack/query-db-collection";
import { createCollection, createOptimisticAction } from "@tanstack/react-db";
import { Cause, Effect, Exit, Schema } from "effect";
import { use } from "react";
import * as React from "react";

import { runBrowserAppApiRequest } from "#/features/api/app-api-client";
import { normalizeAppApiError } from "#/features/api/app-api-errors";
import type { AppApiError } from "#/features/api/app-api-errors";
import { withMinimumMutationPendingDurationEffect } from "#/lib/mutation-feedback-effect";
import {
  ROUTE_SCOPED_QUERY_COLLECTION_GC_TIME_MS,
  markTanStackDbCollectionWrite,
  reconcileQueryCollectionDataAfterConcurrentWrite,
  stripTanStackDbCollectionData,
  withoutTanStackDbVirtualProps,
} from "#/lib/tanstack-db-collection";
import type {
  TanStackDbCollectionSnapshot,
  TanStackDbCollectionWriteVersionRef,
} from "#/lib/tanstack-db-collection";
import { useHydratedCollectionItems } from "#/lib/tanstack-db-react";

import type { OrganizationQueryScope } from "./organization-query-scope";
import { organizationScopedQueryKey } from "./organization-query-scope";

type ServiceAreasCollection = ReturnType<typeof makeServiceAreasCollection>;
type RateCardsCollection = ReturnType<typeof makeRateCardsCollection>;

const EMPTY_SERVICE_AREAS: readonly ServiceArea[] = [];
const EMPTY_RATE_CARDS: readonly RateCard[] = [];

export interface OrganizationAsyncResult {
  readonly error: unknown | null;
  readonly waiting: boolean;
}

interface OrganizationConfigurationStore {
  readonly organizationId: OrganizationId;
  readonly queryScope: OrganizationQueryScope;
  readonly queryClient: QueryClient;
  readonly rateCards: RateCardsCollection;
  readonly rateCardsWriteVersionRef: TanStackDbCollectionWriteVersionRef;
  readonly serviceAreas: ServiceAreasCollection;
  readonly serviceAreasWriteVersionRef: TanStackDbCollectionWriteVersionRef;
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
  queryClient: providedQueryClient,
  queryScope: providedQueryScope,
}: {
  readonly children: React.ReactNode;
  readonly organizationId: OrganizationId;
  readonly queryClient?: QueryClient | undefined;
  readonly queryScope?: OrganizationQueryScope | undefined;
}) {
  const [fallbackQueryClient] = React.useState(() => new QueryClient());
  const queryClient = providedQueryClient ?? fallbackQueryClient;
  const queryScope = React.useMemo(
    () =>
      providedQueryScope ?? {
        organizationId,
      },
    [organizationId, providedQueryScope]
  );
  const store = React.useMemo(
    () =>
      makeOrganizationConfigurationStore(
        organizationId,
        queryScope,
        queryClient
      ),
    [organizationId, queryClient, queryScope]
  );
  const [asyncState, unsafeDispatchAsyncState] = React.useReducer(
    organizationConfigurationAsyncReducer,
    initialOrganizationConfigurationAsyncState
  );
  const dispatchAsyncState = useMountedOrganizationAsyncStateDispatch(
    unsafeDispatchAsyncState
  );
  const {
    createRateCardResult,
    createServiceAreaResult,
    listRateCardsResult,
    listServiceAreasResult,
    updateRateCardResults,
    updateServiceAreaResults,
  } = asyncState;

  const loadServiceAreas = React.useCallback(
    () =>
      runOrganizationOperation(
        refetchServiceAreas(store.serviceAreas),
        (result) =>
          dispatchAsyncState({
            result,
            type: "set-list-service-areas-result",
          })
      ),
    [dispatchAsyncState, store]
  );

  const createServiceArea = React.useCallback(
    (input: CreateServiceAreaInput) =>
      runOrganizationOperation(
        withMinimumMutationPendingDurationEffect(
          persistCreateServiceArea(store, input)
        ),
        (result) =>
          dispatchAsyncState({
            result,
            type: "set-create-service-area-result",
          })
      ),
    [dispatchAsyncState, store]
  );

  const updateServiceArea = React.useCallback(
    (serviceAreaId: ServiceAreaIdType, input: UpdateServiceAreaInput) =>
      runOrganizationOperation(
        withMinimumMutationPendingDurationEffect(
          persistUpdateServiceArea(store, serviceAreaId, input)
        ),
        (result) => {
          dispatchAsyncState({
            result,
            serviceAreaId,
            type: "set-update-service-area-result",
          });
        }
      ),
    [dispatchAsyncState, store]
  );

  const loadRateCards = React.useCallback(
    () =>
      runOrganizationOperation(refetchRateCards(store.rateCards), (result) =>
        dispatchAsyncState({
          result,
          type: "set-list-rate-cards-result",
        })
      ),
    [dispatchAsyncState, store]
  );

  const createRateCard = React.useCallback(
    (input: CreateRateCardInput) =>
      runOrganizationOperation(
        withMinimumMutationPendingDurationEffect(
          persistCreateRateCard(store, input)
        ),
        (result) =>
          dispatchAsyncState({
            result,
            type: "set-create-rate-card-result",
          })
      ),
    [dispatchAsyncState, store]
  );

  const updateRateCard = React.useCallback(
    (rateCardId: RateCardIdType, input: UpdateRateCardInput) =>
      runOrganizationOperation(
        withMinimumMutationPendingDurationEffect(
          persistUpdateRateCard(store, rateCardId, input)
        ),
        (result) => {
          dispatchAsyncState({
            rateCardId,
            result,
            type: "set-update-rate-card-result",
          });
        }
      ),
    [dispatchAsyncState, store]
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
  organizationId: OrganizationId,
  queryScope: OrganizationQueryScope,
  queryClient: QueryClient
): OrganizationConfigurationStore {
  const rateCardsWriteVersionRef = { current: 0 };
  const serviceAreasWriteVersionRef = { current: 0 };

  return {
    organizationId,
    queryScope,
    queryClient,
    rateCards: makeRateCardsCollection(
      queryScope,
      queryClient,
      rateCardsWriteVersionRef
    ),
    rateCardsWriteVersionRef,
    serviceAreas: makeServiceAreasCollection(
      queryScope,
      queryClient,
      serviceAreasWriteVersionRef
    ),
    serviceAreasWriteVersionRef,
  };
}

function makeServiceAreasCollection(
  queryScope: OrganizationQueryScope,
  queryClient: QueryClient,
  writeVersionRef: TanStackDbCollectionWriteVersionRef
) {
  const collection: {
    current?: TanStackDbCollectionSnapshot<ServiceArea>;
  } = {};
  const createdCollection = createCollection(
    queryCollectionOptions({
      enabled: false,
      gcTime: ROUTE_SCOPED_QUERY_COLLECTION_GC_TIME_MS,
      id: `organization:${queryScope.organizationId}:user:${queryScope.userId ?? "unknown"}:role:${queryScope.role ?? "unknown"}:service-areas`,
      queryClient,
      queryKey: organizationServiceAreasQueryKey(queryScope),
      queryFn: async () => {
        const requestWriteVersion = writeVersionRef.current;
        const response = await Effect.runPromise(listBrowserServiceAreas());

        return reconcileQueryCollectionDataAfterConcurrentWrite({
          collection: collection.current,
          incomingItems: response.items,
          requestWriteVersion,
          writeVersionRef,
        });
      },
      getKey: (serviceArea) => serviceArea.id,
      schema: Schema.standardSchemaV1(ServiceAreaSchema),
    })
  );
  collection.current = createdCollection;
  return createdCollection;
}

function makeRateCardsCollection(
  queryScope: OrganizationQueryScope,
  queryClient: QueryClient,
  writeVersionRef: TanStackDbCollectionWriteVersionRef
) {
  const collection: {
    current?: TanStackDbCollectionSnapshot<RateCard>;
  } = {};
  const createdCollection = createCollection(
    queryCollectionOptions({
      enabled: false,
      gcTime: ROUTE_SCOPED_QUERY_COLLECTION_GC_TIME_MS,
      id: `organization:${queryScope.organizationId}:user:${queryScope.userId ?? "unknown"}:role:${queryScope.role ?? "unknown"}:rate-cards`,
      queryClient,
      queryKey: organizationRateCardsQueryKey(queryScope),
      queryFn: async () => {
        const requestWriteVersion = writeVersionRef.current;
        const response = await Effect.runPromise(listBrowserRateCards());

        return reconcileQueryCollectionDataAfterConcurrentWrite({
          collection: collection.current,
          incomingItems: response.items,
          requestWriteVersion,
          writeVersionRef,
        });
      },
      getKey: (rateCard) => rateCard.id,
      schema: Schema.standardSchemaV1(RateCardSchema),
    })
  );
  collection.current = createdCollection;
  return createdCollection;
}

function organizationServiceAreasQueryKey(scope: OrganizationQueryScope) {
  return organizationScopedQueryKey("service-areas", scope);
}

function organizationRateCardsQueryKey(scope: OrganizationQueryScope) {
  return organizationScopedQueryKey("rate-cards", scope);
}

function useMountedOrganizationAsyncStateDispatch(
  dispatch: React.Dispatch<OrganizationConfigurationAsyncAction>
) {
  const isMountedRef = React.useRef(true);

  React.useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
    };
  }, []);

  return React.useCallback(
    (action: OrganizationConfigurationAsyncAction) => {
      if (isMountedRef.current) {
        dispatch(action);
      }
    },
    [dispatch]
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
  return useHydratedCollectionItems(collection, EMPTY_SERVICE_AREAS);
}

function useRateCardCollectionItems(
  collection: RateCardsCollection
): readonly RateCard[] {
  return useHydratedCollectionItems(collection, EMPTY_RATE_CARDS);
}

async function runOrganizationOperation<Success>(
  effect: Effect.Effect<Success, AppApiError>,
  setResult: (result: OrganizationAsyncResult) => void,
  onSuccess?: (value: Success) => Promise<void>
): Promise<Exit.Exit<Success, AppApiError>> {
  setResult(waitingOrganizationAsyncResult);
  const exit = await Effect.runPromiseExit(effect);

  if (Exit.isSuccess(exit)) {
    await onSuccess?.(exit.value);
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
        path: { serviceAreaId },
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
        path: { rateCardId },
        payload: input,
      })
  );
}

function refetchServiceAreas(
  collection: ServiceAreasCollection
): Effect.Effect<ServiceAreaListResponse, AppApiError> {
  return Effect.tryPromise({
    try: async () => {
      await collection.utils.refetch({ throwOnError: true });
      return {
        items: serviceAreasFromCollection(collection),
      } satisfies ServiceAreaListResponse;
    },
    catch: normalizeAppApiError,
  });
}

function refetchRateCards(
  collection: RateCardsCollection
): Effect.Effect<RateCardListResponse, AppApiError> {
  return Effect.tryPromise({
    try: async () => {
      await collection.utils.refetch({ throwOnError: true });
      return {
        items: rateCardsFromCollection(collection),
      } satisfies RateCardListResponse;
    },
    catch: normalizeAppApiError,
  });
}

function persistCreateServiceArea(
  store: OrganizationConfigurationStore,
  input: CreateServiceAreaInput
): Effect.Effect<CreateServiceAreaResponse, AppApiError> {
  return Effect.tryPromise({
    try: async () => {
      let result: CreateServiceAreaResponse | undefined;
      const action = createOptimisticAction<CreateServiceAreaInput>({
        onMutate: (variables) => {
          markTanStackDbCollectionWrite(store.serviceAreasWriteVersionRef);
          store.serviceAreas.insert({
            description: variables.description,
            id: crypto.randomUUID() as ServiceAreaIdType,
            name: variables.name,
          });
        },
        mutationFn: async (variables) => {
          const serviceArea = await Effect.runPromise(
            createBrowserServiceArea(variables)
          );
          markTanStackDbCollectionWrite(store.serviceAreasWriteVersionRef);
          store.serviceAreas.utils.writeUpsert(serviceArea);
          result = serviceArea;
          return serviceArea;
        },
      });
      const transaction = action(input);
      await transaction.isPersisted.promise;
      return requireActionResult(result);
    },
    catch: normalizeAppApiError,
  });
}

function persistUpdateServiceArea(
  store: OrganizationConfigurationStore,
  serviceAreaId: ServiceAreaIdType,
  input: UpdateServiceAreaInput
): Effect.Effect<UpdateServiceAreaResponse, AppApiError> {
  return Effect.tryPromise({
    try: async () => {
      const existingServiceArea = store.serviceAreas.get(serviceAreaId);

      if (existingServiceArea === undefined) {
        const serviceArea = await Effect.runPromise(
          updateBrowserServiceArea(serviceAreaId, input)
        );
        markTanStackDbCollectionWrite(store.serviceAreasWriteVersionRef);
        store.serviceAreas.utils.writeUpsert(serviceArea);
        return serviceArea;
      }

      const currentServiceArea =
        withoutTanStackDbVirtualProps(existingServiceArea);

      if (isServiceAreaUpdateNoop(currentServiceArea, input)) {
        return currentServiceArea;
      }

      let result: UpdateServiceAreaResponse | undefined;
      const action = createOptimisticAction<UpdateServiceAreaInput>({
        onMutate: (variables) => {
          markTanStackDbCollectionWrite(store.serviceAreasWriteVersionRef);
          store.serviceAreas.update(serviceAreaId, (draft) => {
            if (variables.description !== undefined) {
              draft.description = variables.description ?? undefined;
            }

            if (variables.name !== undefined) {
              draft.name = variables.name;
            }
          });
        },
        mutationFn: async (variables) => {
          const serviceArea = await Effect.runPromise(
            updateBrowserServiceArea(serviceAreaId, variables)
          );
          markTanStackDbCollectionWrite(store.serviceAreasWriteVersionRef);
          store.serviceAreas.utils.writeUpsert(serviceArea);
          result = serviceArea;
          return serviceArea;
        },
      });
      const transaction = action(input);
      await transaction.isPersisted.promise;
      return requireActionResult(result);
    },
    catch: normalizeAppApiError,
  });
}

function persistCreateRateCard(
  store: OrganizationConfigurationStore,
  input: CreateRateCardInput
): Effect.Effect<CreateRateCardResponse, AppApiError> {
  return Effect.tryPromise({
    try: async () => {
      let result: CreateRateCardResponse | undefined;
      const action = createOptimisticAction<CreateRateCardInput>({
        onMutate: (variables) => {
          markTanStackDbCollectionWrite(store.rateCardsWriteVersionRef);
          const temporaryRateCardId = crypto.randomUUID() as RateCardIdType;
          const now = new Date().toISOString();

          store.rateCards.insert({
            createdAt: now,
            id: temporaryRateCardId,
            lines: variables.lines.map((line) => ({
              ...line,
              id: crypto.randomUUID() as RateCardLineIdType,
              rateCardId: temporaryRateCardId,
            })),
            name: variables.name,
            updatedAt: now,
          });
        },
        mutationFn: async (variables) => {
          const rateCard = await Effect.runPromise(
            createBrowserRateCard(variables)
          );
          markTanStackDbCollectionWrite(store.rateCardsWriteVersionRef);
          store.rateCards.utils.writeUpsert(rateCard);
          result = rateCard;
          return rateCard;
        },
      });
      const transaction = action(input);
      await transaction.isPersisted.promise;
      return requireActionResult(result);
    },
    catch: normalizeAppApiError,
  });
}

function persistUpdateRateCard(
  store: OrganizationConfigurationStore,
  rateCardId: RateCardIdType,
  input: UpdateRateCardInput
): Effect.Effect<UpdateRateCardResponse, AppApiError> {
  return Effect.tryPromise({
    try: async () => {
      const existingRateCard = store.rateCards.get(rateCardId);

      if (existingRateCard === undefined) {
        const rateCard = await Effect.runPromise(
          updateBrowserRateCard(rateCardId, input)
        );
        markTanStackDbCollectionWrite(store.rateCardsWriteVersionRef);
        store.rateCards.utils.writeUpsert(rateCard);
        return rateCard;
      }

      const currentRateCard = withoutTanStackDbVirtualProps(existingRateCard);

      if (isRateCardUpdateNoop(currentRateCard, input)) {
        return currentRateCard;
      }

      let result: UpdateRateCardResponse | undefined;
      const action = createOptimisticAction<UpdateRateCardInput>({
        onMutate: (variables) => {
          markTanStackDbCollectionWrite(store.rateCardsWriteVersionRef);
          store.rateCards.update(rateCardId, (draft) => {
            if (variables.lines !== undefined) {
              draft.lines = variables.lines.map((line) => ({
                ...line,
                id:
                  "id" in line && typeof line.id === "string"
                    ? line.id
                    : crypto.randomUUID(),
                rateCardId,
              }));
            }

            if (variables.name !== undefined) {
              draft.name = variables.name;
            }
          });
        },
        mutationFn: async (variables) => {
          const rateCard = await Effect.runPromise(
            updateBrowserRateCard(rateCardId, variables)
          );
          markTanStackDbCollectionWrite(store.rateCardsWriteVersionRef);
          store.rateCards.utils.writeUpsert(rateCard);
          result = rateCard;
          return rateCard;
        },
      });
      const transaction = action(input);
      await transaction.isPersisted.promise;
      return requireActionResult(result);
    },
    catch: normalizeAppApiError,
  });
}

function requireActionResult<Success>(result: Success | undefined): Success {
  if (result === undefined) {
    throw new Error("TanStack DB action completed without a result.");
  }

  return result;
}

function isServiceAreaUpdateNoop(
  serviceArea: ServiceArea,
  input: UpdateServiceAreaInput
) {
  return (
    (input.name === undefined || input.name === serviceArea.name) &&
    (input.description === undefined ||
      (input.description ?? undefined) === serviceArea.description)
  );
}

function isRateCardUpdateNoop(rateCard: RateCard, input: UpdateRateCardInput) {
  return (
    (input.name === undefined || input.name === rateCard.name) &&
    (input.lines === undefined ||
      areRateCardLineInputsEqual(input.lines, rateCard.lines))
  );
}

function areRateCardLineInputsEqual(
  input: NonNullable<UpdateRateCardInput["lines"]>,
  current: RateCard["lines"]
) {
  return (
    input.length === current.length &&
    input.every((line, index) => {
      const currentLine = current[index];

      return (
        currentLine !== undefined &&
        line.kind === currentLine.kind &&
        line.name === currentLine.name &&
        line.position === currentLine.position &&
        line.unit === currentLine.unit &&
        line.value === currentLine.value
      );
    })
  );
}

function serviceAreasFromCollection(
  collection: ServiceAreasCollection
): readonly ServiceArea[] {
  return stripTanStackDbCollectionData(collection.toArray);
}

function rateCardsFromCollection(
  collection: RateCardsCollection
): readonly RateCard[] {
  return stripTanStackDbCollectionData(collection.toArray);
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
