"use client";
import type { OrganizationId } from "@ceird/identity-core";
import type { CreateLabelInput, LabelIdType } from "@ceird/labels-core";
import type {
  AddSiteCommentInput,
  AddSiteCommentResponse,
  AssignSiteLabelInput,
  CreateSiteInput,
  CreateSiteResponse,
  SiteComment,
  SiteDetail,
  SiteIdType,
  SiteOption,
  SitesOptionsResponse,
  UpdateSiteInput,
  UpdateSiteResponse,
} from "@ceird/sites-core";
import { SiteCommentSchema, SiteOptionSchema } from "@ceird/sites-core";
import { QueryClient } from "@tanstack/query-core";
import { queryCollectionOptions } from "@tanstack/query-db-collection";
import { createCollection } from "@tanstack/react-db";
import { Cause, Effect, Exit, Option, Schema } from "effect";
import { use } from "react";
import * as React from "react";

import { runBrowserAppApiRequest } from "#/features/api/app-api-client";
import { normalizeAppApiError } from "#/features/api/app-api-errors";
import type { AppApiError } from "#/features/api/app-api-errors";
import { listAllCurrentServerSites } from "#/features/api/app-api-server";
import { createBrowserLabel } from "#/features/labels/labels-state";
import type { OrganizationQueryScope } from "#/features/organizations/organization-query-scope";
import type { OrganizationViewer } from "#/features/organizations/organization-viewer";
import { useIsHydrated } from "#/hooks/use-is-hydrated";
import { withMinimumMutationPendingDurationEffect } from "#/lib/mutation-feedback-effect";
import {
  ROUTE_SCOPED_QUERY_COLLECTION_GC_TIME_MS,
  markTanStackDbCollectionWrite,
  reconcileQueryCollectionDataAfterConcurrentWrite,
  replaceSyncedCollectionData,
  stripTanStackDbCollectionData,
} from "#/lib/tanstack-db-collection";
import type {
  TanStackDbCollectionSnapshot,
  TanStackDbCollectionWriteVersionRef,
} from "#/lib/tanstack-db-collection";
import { seedQueryCollectionInitialData } from "#/lib/tanstack-db-query";
import { useHydratedCollectionItems } from "#/lib/tanstack-db-react";

import {
  organizationSitesQueryKey,
  siteCommentsQueryKey,
} from "./sites-query-keys";

type SitesCollection = ReturnType<typeof makeSitesCollection>;
type SiteCommentsCollection = ReturnType<typeof makeSiteCommentsCollection>;

const EMPTY_SITE_COMMENTS: readonly SiteComment[] = [];

interface SitesNotice {
  readonly kind: "created" | "updated";
  readonly name: string;
}

export interface SitesAsyncResult {
  readonly error: unknown | null;
  readonly waiting: boolean;
}

interface SitesStateStore {
  readonly commentsBySiteId: Map<SiteIdType, SiteCommentsCollection>;
  readonly commentWriteVersionsBySiteId: Map<
    SiteIdType,
    TanStackDbCollectionWriteVersionRef
  >;
  readonly fallbackSitesRef: React.MutableRefObject<readonly SiteOption[]>;
  readonly initialCommentsBySiteId: Map<SiteIdType, readonly SiteComment[]>;
  readonly organizationIdRef: React.MutableRefObject<OrganizationId>;
  readonly queryScope: OrganizationQueryScope;
  readonly queryClient: QueryClient;
  readonly refreshVersionsBySiteId: Map<SiteIdType, number>;
  readonly sites: SitesCollection;
  readonly sitesWriteVersionRef: TanStackDbCollectionWriteVersionRef;
}

interface SitesStateContextValue {
  readonly addSiteComment: (
    siteId: SiteIdType,
    input: AddSiteCommentInput
  ) => Promise<Exit.Exit<AddSiteCommentResponse, AppApiError>>;
  readonly assignSiteLabel: (
    siteId: SiteIdType,
    input: AssignSiteLabelInput
  ) => Promise<Exit.Exit<SiteDetail, AppApiError>>;
  readonly clearNotice: () => void;
  readonly createAndAssignSiteLabel: (
    siteId: SiteIdType,
    input: CreateLabelInput
  ) => Promise<Exit.Exit<SiteDetail, AppApiError>>;
  readonly createSite: (
    input: CreateSiteInput
  ) => Promise<Exit.Exit<CreateSiteResponse, AppApiError>>;
  readonly createSiteResult: SitesAsyncResult;
  readonly notice: SitesNotice | null;
  readonly refreshSiteComments: (
    siteId: SiteIdType
  ) => Promise<Exit.Exit<readonly SiteComment[], AppApiError>>;
  readonly removeSiteLabel: (
    siteId: SiteIdType,
    labelId: LabelIdType
  ) => Promise<Exit.Exit<SiteDetail, AppApiError>>;
  readonly replaceSitesOptionsState: (
    organizationId: OrganizationId,
    response: SitesOptionsResponse
  ) => Promise<void>;
  readonly serviceAreas: SitesOptionsResponse["serviceAreas"];
  readonly store: SitesStateStore;
  readonly updateSite: (
    siteId: SiteIdType,
    input: UpdateSiteInput
  ) => Promise<Exit.Exit<UpdateSiteResponse, AppApiError>>;
  readonly updateSiteResults: Readonly<
    Partial<Record<SiteIdType, SitesAsyncResult>>
  >;
}

interface SitesState {
  readonly createSiteResult: SitesAsyncResult;
  readonly notice: SitesNotice | null;
  readonly serviceAreas: SitesOptionsResponse["serviceAreas"];
  readonly updateSiteResults: Readonly<
    Partial<Record<SiteIdType, SitesAsyncResult>>
  >;
}

type SitesStateAction =
  | {
      readonly notice: SitesNotice | null;
      readonly type: "set-notice";
    }
  | {
      readonly result: SitesAsyncResult;
      readonly type: "set-create-site-result";
    }
  | {
      readonly result: SitesAsyncResult;
      readonly siteId: SiteIdType;
      readonly type: "set-update-site-result";
    }
  | {
      readonly serviceAreas: SitesOptionsResponse["serviceAreas"];
      readonly type: "replace-options-state";
    };

const SitesStateContext = React.createContext<SitesStateContextValue | null>(
  null
);

const idleSitesAsyncResult: SitesAsyncResult = {
  error: null,
  waiting: false,
};

const waitingSitesAsyncResult: SitesAsyncResult = {
  error: null,
  waiting: true,
};

export function SitesStateProvider({
  activeOrganizationId,
  children,
  initialSiteComments,
  options,
  queryClient: providedQueryClient,
  viewer,
}: {
  readonly activeOrganizationId: OrganizationId;
  readonly children: React.ReactNode;
  readonly initialSiteComments?: ReadonlyMap<
    SiteIdType,
    readonly SiteComment[]
  >;
  readonly options: SitesOptionsResponse;
  readonly queryClient?: QueryClient | undefined;
  readonly viewer: OrganizationViewer;
}) {
  const organizationIdRef = React.useRef(activeOrganizationId);
  const [fallbackQueryClient] = React.useState(() => new QueryClient());
  const queryClient = providedQueryClient ?? fallbackQueryClient;
  const [store] = React.useState(() =>
    makeSitesStateStore(
      organizationIdRef,
      activeOrganizationId,
      viewer,
      queryClient,
      options.sites,
      initialSiteComments
    )
  );
  const previousOptionsRef = React.useRef(options);
  const [state, dispatch] = React.useReducer(sitesStateReducer, {
    createSiteResult: idleSitesAsyncResult,
    notice: null,
    serviceAreas: options.serviceAreas,
    updateSiteResults: {},
  } satisfies SitesState);
  const { createSiteResult, notice, serviceAreas, updateSiteResults } = state;

  React.useEffect(() => {
    organizationIdRef.current = activeOrganizationId;
  }, [activeOrganizationId, organizationIdRef]);

  const replaceSitesOptionsState = React.useCallback(
    async (organizationId: OrganizationId, response: SitesOptionsResponse) => {
      organizationIdRef.current = organizationId;
      store.refreshVersionsBySiteId.clear();

      pruneInactiveSiteCommentCollections(store, response.sites);
      store.initialCommentsBySiteId.clear();
      await replaceSites(store, response.sites);
      dispatch({
        serviceAreas: response.serviceAreas,
        type: "replace-options-state",
      });
    },
    [organizationIdRef, store]
  );

  React.useEffect(() => {
    if (previousOptionsRef.current === options) {
      return;
    }

    previousOptionsRef.current = options;
    void replaceSitesOptionsState(activeOrganizationId, options);
  }, [activeOrganizationId, options, replaceSitesOptionsState]);

  const createSite = React.useCallback(
    (input: CreateSiteInput) => {
      const expectedOrganizationId = organizationIdRef.current;

      return runTrackedSitesOperation(
        withMinimumMutationPendingDurationEffect(createBrowserSite(input)),
        (result) =>
          dispatch({
            result,
            type: "set-create-site-result",
          }),
        async (createdSite) => {
          await syncChangedSiteDetail(
            store,
            createdSite,
            expectedOrganizationId
          );
          if (organizationIdRef.current !== expectedOrganizationId) {
            return;
          }

          dispatch({
            notice: {
              kind: "created",
              name: createdSite.name,
            },
            type: "set-notice",
          });
        }
      );
    },
    [organizationIdRef, store]
  );

  const updateSite = React.useCallback(
    (siteId: SiteIdType, input: UpdateSiteInput) => {
      const expectedOrganizationId = organizationIdRef.current;

      return runTrackedSitesOperation(
        withMinimumMutationPendingDurationEffect(
          updateBrowserSite(siteId, input)
        ),
        (result) =>
          dispatch({
            result,
            siteId,
            type: "set-update-site-result",
          }),
        async (response) => {
          await syncChangedSiteDetail(store, response, expectedOrganizationId);
          if (organizationIdRef.current !== expectedOrganizationId) {
            return;
          }

          dispatch({
            notice: {
              kind: "updated",
              name: response.name,
            },
            type: "set-notice",
          });
        }
      );
    },
    [organizationIdRef, store]
  );

  const refreshSiteComments = React.useCallback(
    (siteId: SiteIdType) => refreshSiteCommentsState(store, siteId),
    [store]
  );

  const addSiteComment = React.useCallback(
    (siteId: SiteIdType, input: AddSiteCommentInput) =>
      addSiteCommentState(store, siteId, input),
    [store]
  );

  const assignSiteLabel = React.useCallback(
    (siteId: SiteIdType, input: AssignSiteLabelInput) => {
      const expectedOrganizationId = organizationIdRef.current;

      return runSitesOperation(
        withMinimumMutationPendingDurationEffect(
          assignBrowserSiteLabel(siteId, input)
        ),
        async (site) => {
          await syncChangedSiteDetail(store, site, expectedOrganizationId);
        }
      );
    },
    [organizationIdRef, store]
  );

  const createAndAssignSiteLabel = React.useCallback(
    (siteId: SiteIdType, input: CreateLabelInput) => {
      const expectedOrganizationId = organizationIdRef.current;

      return runSitesOperation(
        withMinimumMutationPendingDurationEffect(
          createBrowserLabel(input).pipe(
            Effect.flatMap((label) =>
              assignBrowserSiteLabel(siteId, { labelId: label.id })
            )
          )
        ),
        async (site) => {
          await syncChangedSiteDetail(store, site, expectedOrganizationId);
        }
      );
    },
    [organizationIdRef, store]
  );

  const removeSiteLabel = React.useCallback(
    (siteId: SiteIdType, labelId: LabelIdType) => {
      const expectedOrganizationId = organizationIdRef.current;

      return runSitesOperation(
        withMinimumMutationPendingDurationEffect(
          removeBrowserSiteLabel(siteId, labelId)
        ),
        async (site) => {
          await syncChangedSiteDetail(store, site, expectedOrganizationId);
        }
      );
    },
    [organizationIdRef, store]
  );

  const clearNotice = React.useCallback(() => {
    dispatch({
      notice: null,
      type: "set-notice",
    });
  }, []);

  const value = React.useMemo<SitesStateContextValue>(
    () => ({
      addSiteComment,
      assignSiteLabel,
      clearNotice,
      createAndAssignSiteLabel,
      createSite,
      createSiteResult,
      notice,
      refreshSiteComments,
      removeSiteLabel,
      replaceSitesOptionsState,
      serviceAreas,
      store,
      updateSite,
      updateSiteResults,
    }),
    [
      addSiteComment,
      assignSiteLabel,
      clearNotice,
      createAndAssignSiteLabel,
      createSite,
      createSiteResult,
      notice,
      refreshSiteComments,
      removeSiteLabel,
      replaceSitesOptionsState,
      serviceAreas,
      store,
      updateSite,
      updateSiteResults,
    ]
  );

  return React.createElement(SitesStateContext.Provider, { value }, children);
}

export function useSitesOptions(): SitesOptionsResponse {
  const { serviceAreas, store } = useSitesStateContext();
  const sites = useSitesCollectionItems(store);

  return React.useMemo(
    () => ({
      serviceAreas,
      sites: sortSiteOptions(sites),
    }),
    [serviceAreas, sites]
  );
}

export function useSitesNotice() {
  const { clearNotice, notice } = useSitesStateContext();

  return [notice, clearNotice] as const;
}

export function useCreateSiteMutation() {
  const { createSite, createSiteResult } = useSitesStateContext();

  return [createSiteResult, createSite] as const;
}

export function useUpdateSiteMutation(siteId: SiteIdType) {
  const { updateSite, updateSiteResults } = useSitesStateContext();

  return [
    updateSiteResults[siteId] ?? idleSitesAsyncResult,
    React.useCallback(
      (input: UpdateSiteInput) => updateSite(siteId, input),
      [siteId, updateSite]
    ),
  ] as const;
}

export function useSiteComments(siteId: SiteIdType) {
  const { store } = useSitesStateContext();
  const comments = useSiteCommentCollectionItems(store, siteId);

  return React.useMemo(() => sortSiteComments(comments), [comments]);
}

export function useRefreshSiteCommentsMutation(siteId: SiteIdType) {
  const { refreshSiteComments } = useSitesStateContext();

  return React.useCallback(
    () => refreshSiteComments(siteId),
    [refreshSiteComments, siteId]
  );
}

export function useAddSiteCommentMutation(siteId: SiteIdType) {
  const { addSiteComment } = useSitesStateContext();

  return React.useCallback(
    (input: AddSiteCommentInput) => addSiteComment(siteId, input),
    [addSiteComment, siteId]
  );
}

export function useAssignSiteLabelMutation(siteId: SiteIdType) {
  const { assignSiteLabel } = useSitesStateContext();

  return React.useCallback(
    (input: AssignSiteLabelInput) => assignSiteLabel(siteId, input),
    [assignSiteLabel, siteId]
  );
}

export function useCreateAndAssignSiteLabelMutation(siteId: SiteIdType) {
  const { createAndAssignSiteLabel } = useSitesStateContext();

  return React.useCallback(
    (input: CreateLabelInput) => createAndAssignSiteLabel(siteId, input),
    [createAndAssignSiteLabel, siteId]
  );
}

export function useRemoveSiteLabelMutation(siteId: SiteIdType) {
  const { removeSiteLabel } = useSitesStateContext();

  return React.useCallback(
    (labelId: LabelIdType) => removeSiteLabel(siteId, labelId),
    [removeSiteLabel, siteId]
  );
}

export function useReplaceSitesOptionsState() {
  const { replaceSitesOptionsState } = useSitesStateContext();

  return replaceSitesOptionsState;
}

export function isSitesAsyncFailure(result: SitesAsyncResult): boolean {
  return result.error !== null;
}

export function getSitesAsyncErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong.";
}

function makeSitesStateStore(
  organizationIdRef: React.MutableRefObject<OrganizationId>,
  organizationId: OrganizationId,
  viewer: OrganizationViewer,
  queryClient: QueryClient,
  sites: readonly SiteOption[],
  initialComments?: ReadonlyMap<SiteIdType, readonly SiteComment[]>
): SitesStateStore {
  const sitesWriteVersionRef = { current: 0 };
  const queryScope = {
    organizationId,
    role: viewer.role,
    userId: viewer.userId,
  } satisfies OrganizationQueryScope;

  return {
    commentsBySiteId: new Map(),
    commentWriteVersionsBySiteId: new Map(),
    fallbackSitesRef: {
      current: sites,
    },
    initialCommentsBySiteId: new Map(initialComments),
    organizationIdRef,
    queryScope,
    queryClient,
    refreshVersionsBySiteId: new Map(),
    sites: makeSitesCollection(
      queryScope,
      queryClient,
      sites,
      sitesWriteVersionRef
    ),
    sitesWriteVersionRef,
  };
}

function makeSitesCollection(
  queryScope: OrganizationQueryScope,
  queryClient: QueryClient,
  sites: readonly SiteOption[],
  writeVersionRef: TanStackDbCollectionWriteVersionRef
) {
  const queryKey = organizationSitesQueryKey(queryScope);
  seedQueryCollectionInitialData(queryClient, queryKey, [...sites]);

  const collection: {
    current?: TanStackDbCollectionSnapshot<SiteOption>;
  } = {};
  const createdCollection = createCollection(
    queryCollectionOptions({
      getKey: (site) => site.id,
      gcTime: ROUTE_SCOPED_QUERY_COLLECTION_GC_TIME_MS,
      id: `organization:${queryScope.organizationId}:user:${queryScope.userId ?? "unknown"}:role:${queryScope.role ?? "unknown"}:sites`,
      queryClient,
      queryFn: async () => {
        const requestWriteVersion = writeVersionRef.current;
        const response = await listAllCurrentServerSites();

        return reconcileQueryCollectionDataAfterConcurrentWrite({
          collection: collection.current,
          incomingItems: response.items,
          requestWriteVersion,
          writeVersionRef,
        });
      },
      queryKey,
      retry: false,
      schema: Schema.toStandardSchemaV1(SiteOptionSchema),
      staleTime: 30_000,
    })
  );
  collection.current = createdCollection;
  return createdCollection;
}

function makeSiteCommentsCollection(
  queryScope: OrganizationQueryScope,
  queryClient: QueryClient,
  siteId: SiteIdType,
  comments: readonly SiteComment[],
  writeVersionRef: TanStackDbCollectionWriteVersionRef
) {
  const queryKey = siteCommentsQueryKey(queryScope, siteId);
  seedQueryCollectionInitialData(
    queryClient,
    queryKey,
    sortSiteComments(comments)
  );

  const collection: {
    current?: TanStackDbCollectionSnapshot<SiteComment>;
  } = {};
  const createdCollection = createCollection(
    queryCollectionOptions({
      getKey: (comment) => comment.id,
      gcTime: ROUTE_SCOPED_QUERY_COLLECTION_GC_TIME_MS,
      id: `organization:${queryScope.organizationId}:user:${queryScope.userId ?? "unknown"}:role:${queryScope.role ?? "unknown"}:site:${siteId}:comments`,
      queryClient,
      queryFn: async () => {
        const requestWriteVersion = writeVersionRef.current;
        const response = await Effect.runPromise(
          listBrowserSiteComments(siteId)
        );

        return reconcileQueryCollectionDataAfterConcurrentWrite({
          collection: collection.current,
          incomingItems: sortSiteComments(response.comments),
          requestWriteVersion,
          writeVersionRef,
        });
      },
      queryKey,
      retry: false,
      schema: Schema.toStandardSchemaV1(SiteCommentSchema),
      staleTime: 30_000,
    })
  );
  collection.current = createdCollection;
  return createdCollection;
}

function useSitesStateContext() {
  const context = use(SitesStateContext);

  if (!context) {
    throw new Error("Sites state must be used inside SitesStateProvider.");
  }

  return context;
}

function sitesStateReducer(
  state: SitesState,
  action: SitesStateAction
): SitesState {
  switch (action.type) {
    case "replace-options-state": {
      return {
        ...state,
        serviceAreas: action.serviceAreas,
      };
    }

    case "set-create-site-result": {
      return {
        ...state,
        createSiteResult: action.result,
      };
    }

    case "set-notice": {
      return {
        ...state,
        notice: action.notice,
      };
    }

    case "set-update-site-result": {
      return {
        ...state,
        updateSiteResults: {
          ...state.updateSiteResults,
          [action.siteId]: action.result,
        },
      };
    }

    default: {
      const exhaustiveAction: never = action;
      return exhaustiveAction;
    }
  }
}

function useSitesCollectionItems(
  store: SitesStateStore
): readonly SiteOption[] {
  return useHydratedCollectionItems(
    store.sites,
    store.fallbackSitesRef.current
  );
}

function useSiteCommentCollectionItems(
  store: SitesStateStore,
  siteId: SiteIdType
): readonly SiteComment[] {
  const isHydrated = useIsHydrated();
  const collection = React.useMemo(
    () =>
      isHydrated ? getOrCreateSiteCommentsCollection(store, siteId) : null,
    [isHydrated, siteId, store]
  );

  return useHydratedCollectionItems(
    collection,
    store.initialCommentsBySiteId.get(siteId) ?? EMPTY_SITE_COMMENTS
  );
}

async function runTrackedSitesOperation<Success>(
  effect: Effect.Effect<Success, AppApiError>,
  setResult: (result: SitesAsyncResult) => void,
  onSuccess: (value: Success) => Promise<void>
): Promise<Exit.Exit<Success, AppApiError>> {
  setResult(waitingSitesAsyncResult);
  const exit = await Effect.runPromiseExit(effect);

  if (Exit.isSuccess(exit)) {
    await onSuccess(exit.value);
    setResult(idleSitesAsyncResult);
    return exit;
  }

  setResult({
    error: failureFromCause(exit.cause),
    waiting: false,
  });

  return exit;
}

async function runSitesOperation<Success>(
  effect: Effect.Effect<Success, AppApiError>,
  onSuccess: (value: Success) => Promise<void>
): Promise<Exit.Exit<Success, AppApiError>> {
  const exit = await Effect.runPromiseExit(effect);

  if (Exit.isSuccess(exit)) {
    await onSuccess(exit.value);
  }

  return exit;
}

function refreshSiteCommentsState(
  store: SitesStateStore,
  siteId: SiteIdType
): Promise<Exit.Exit<readonly SiteComment[], AppApiError>> {
  return refetchSiteCommentsState(store, siteId);
}

async function addSiteCommentState(
  store: SitesStateStore,
  siteId: SiteIdType,
  input: AddSiteCommentInput
): Promise<Exit.Exit<AddSiteCommentResponse, AppApiError>> {
  const exit = await Effect.runPromiseExit(
    withMinimumMutationPendingDurationEffect(
      addBrowserSiteComment(siteId, input)
    )
  );

  if (Exit.isSuccess(exit)) {
    await upsertSiteCommentCollectionItem(store, siteId, exit.value);
    await refreshSiteCommentsIfPossible(store, siteId);
  }

  return exit;
}

async function refreshSiteCommentsIfPossible(
  store: SitesStateStore,
  siteId: SiteIdType
) {
  const exit = await refetchSiteCommentsState(store, siteId);

  if (Exit.isSuccess(exit)) {
    return;
  }

  await Effect.runPromise(
    Effect.logWarning(
      "Site comments refresh failed; keeping optimistic state",
      {
        error: getSitesAsyncErrorMessage(failureFromCause(exit.cause)),
        siteId,
      }
    )
  );
}

async function refetchSiteCommentsState(
  store: SitesStateStore,
  siteId: SiteIdType
): Promise<Exit.Exit<readonly SiteComment[], AppApiError>> {
  const refreshVersion = beginSiteCommentsRefresh(store, siteId);
  const collection = getOrCreateSiteCommentsCollection(store, siteId);
  const exit = await Effect.runPromiseExit(
    Effect.tryPromise({
      try: async () => {
        await collection.utils.refetch({ throwOnError: true });
        return sortSiteComments(siteCommentsFromCollection(collection));
      },
      catch: normalizeAppApiError,
    })
  );

  if (
    Exit.isSuccess(exit) &&
    store.refreshVersionsBySiteId.get(siteId) !== refreshVersion
  ) {
    return Exit.succeed(
      sortSiteComments(siteCommentsFromCollection(collection))
    );
  }

  return exit;
}

function beginSiteCommentsRefresh(store: SitesStateStore, siteId: SiteIdType) {
  const nextVersion = (store.refreshVersionsBySiteId.get(siteId) ?? 0) + 1;
  store.refreshVersionsBySiteId.set(siteId, nextVersion);

  return nextVersion;
}

function createBrowserSite(input: CreateSiteInput) {
  return runBrowserAppApiRequest("SitesBrowser.createSite", (client) =>
    client.sites.createSite({ payload: input })
  );
}

function updateBrowserSite(siteId: SiteIdType, input: UpdateSiteInput) {
  return runBrowserAppApiRequest("SitesBrowser.updateSite", (client) =>
    client.sites.updateSite({
      params: { siteId },
      payload: input,
    })
  );
}

function listBrowserSiteComments(siteId: SiteIdType) {
  return runBrowserAppApiRequest("SitesBrowser.listSiteComments", (client) =>
    client.sites.listSiteComments({
      params: { siteId },
    })
  );
}

function addBrowserSiteComment(siteId: SiteIdType, input: AddSiteCommentInput) {
  return runBrowserAppApiRequest("SitesBrowser.addSiteComment", (client) =>
    client.sites.addSiteComment({
      params: { siteId },
      payload: input,
    })
  );
}

function assignBrowserSiteLabel(
  siteId: SiteIdType,
  input: AssignSiteLabelInput
) {
  return runBrowserAppApiRequest("SitesBrowser.assignSiteLabel", (client) =>
    client.sites.assignSiteLabel({
      params: { siteId },
      payload: input,
    })
  );
}

function removeBrowserSiteLabel(siteId: SiteIdType, labelId: LabelIdType) {
  return runBrowserAppApiRequest("SitesBrowser.removeSiteLabel", (client) =>
    client.sites.removeSiteLabel({
      params: { labelId, siteId },
    })
  );
}

async function syncChangedSiteDetail(
  store: SitesStateStore,
  site: SiteDetail,
  expectedOrganizationId: OrganizationId
) {
  if (store.organizationIdRef.current !== expectedOrganizationId) {
    return;
  }

  await upsertSiteCollectionItem(store, site);
}

function replaceSites(
  store: SitesStateStore,
  sites: readonly SiteOption[]
): Promise<void> {
  store.fallbackSitesRef.current = sites;
  markTanStackDbCollectionWrite(store.sitesWriteVersionRef);
  replaceSyncedCollectionData(store.sites, sites);
  return Promise.resolve();
}

function upsertSiteCollectionItem(
  store: SitesStateStore,
  site: SiteOption
): Promise<void> {
  markTanStackDbCollectionWrite(store.sitesWriteVersionRef);
  store.sites.utils.writeUpsert(site);
  return Promise.resolve();
}

function upsertSiteCommentCollectionItem(
  store: SitesStateStore,
  siteId: SiteIdType,
  comment: AddSiteCommentResponse
): Promise<void> {
  const collection = getOrCreateSiteCommentsCollection(store, siteId);
  markTanStackDbCollectionWrite(
    getOrCreateSiteCommentsWriteVersionRef(store, siteId)
  );
  collection.utils.writeUpsert(comment);
  return Promise.resolve();
}

function getOrCreateSiteCommentsCollection(
  store: SitesStateStore,
  siteId: SiteIdType
) {
  const existing = store.commentsBySiteId.get(siteId);

  if (existing) {
    return existing;
  }

  const collection = makeSiteCommentsCollection(
    store.queryScope,
    store.queryClient,
    siteId,
    store.initialCommentsBySiteId.get(siteId) ?? [],
    getOrCreateSiteCommentsWriteVersionRef(store, siteId)
  );
  store.commentsBySiteId.set(siteId, collection);

  return collection;
}

function getOrCreateSiteCommentsWriteVersionRef(
  store: SitesStateStore,
  siteId: SiteIdType
) {
  const existing = store.commentWriteVersionsBySiteId.get(siteId);

  if (existing) {
    return existing;
  }

  const created = { current: 0 };
  store.commentWriteVersionsBySiteId.set(siteId, created);
  return created;
}

function siteCommentsFromCollection(
  collection: SiteCommentsCollection
): readonly SiteComment[] {
  return stripTanStackDbCollectionData(collection.toArray);
}

function pruneInactiveSiteCommentCollections(
  store: SitesStateStore,
  sites: readonly SiteOption[]
) {
  const activeSiteIds = new Set(sites.map((site) => site.id));
  for (const [siteId, collection] of store.commentsBySiteId) {
    if (activeSiteIds.has(siteId) || collection.subscriberCount > 0) {
      continue;
    }

    store.commentsBySiteId.delete(siteId);
    store.commentWriteVersionsBySiteId.delete(siteId);
  }
}

function sortSiteOptions(sites: readonly SiteOption[]) {
  return sites.toSorted(compareSiteOptions);
}

function compareSiteOptions(left: SiteOption, right: SiteOption) {
  const nameComparison = left.name.localeCompare(right.name);

  return nameComparison === 0
    ? left.id.localeCompare(right.id)
    : nameComparison;
}

function sortSiteComments(comments: readonly SiteComment[]) {
  return comments.toSorted(compareSiteComments);
}

function compareSiteComments(left: SiteComment, right: SiteComment) {
  const createdAtComparison = left.createdAt.localeCompare(right.createdAt);

  return createdAtComparison === 0
    ? left.id.localeCompare(right.id)
    : createdAtComparison;
}

function failureFromCause(cause: Cause.Cause<AppApiError>): unknown {
  const failure = Cause.findErrorOption(cause);

  return Option.isSome(failure) ? failure.value : Cause.squash(cause);
}
