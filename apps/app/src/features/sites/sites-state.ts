"use client";
import type { OrganizationId } from "@ceird/identity-core";
import type { JobListItem } from "@ceird/jobs-core";
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
import { QueryClient } from "@tanstack/query-core";
import { Cause, Effect, Exit, Option } from "effect";
import { use } from "react";
import * as React from "react";

import { executeDataPlaneCommandAction } from "#/data-plane/command-action";
import type { DataPlaneCommandAction } from "#/data-plane/command-action";
import { useHydratedCollectionItems } from "#/data-plane/hydrated-collection";
import { createDataPlaneMutationJournal } from "#/data-plane/mutation-journal";
import type { DataPlaneMutationJournal } from "#/data-plane/mutation-journal";
import { createOrganizationDataScope } from "#/data-plane/query-scope";
import type { OrganizationDataScope } from "#/data-plane/query-scope";
import { useOptionalDataPlaneSession } from "#/data-plane/session";
import type { DataPlaneSession } from "#/data-plane/session";
import { runBrowserAppApiRequest } from "#/features/api/app-api-client";
import { normalizeAppApiError } from "#/features/api/app-api-errors";
import type { AppApiError } from "#/features/api/app-api-errors";
import {
  getOrCreateLabelsCollectionState,
  upsertLabelCollectionItem,
} from "#/features/labels/labels-data-plane";
import type { LabelsCollectionState } from "#/features/labels/labels-data-plane";
import { createBrowserLabel } from "#/features/labels/labels-state";
import type { OrganizationViewer } from "#/features/organizations/organization-viewer";
import { withMinimumMutationPendingDurationEffect } from "#/lib/mutation-feedback-effect";

import {
  deleteSiteCommentsCollectionState,
  deleteSiteRelatedJobsCollectionState,
  getOrCreateSiteCommentsCollectionState,
  getOrCreateSiteRelatedJobsCollectionState,
  getOrCreateSitesCollectionState,
  replaceSiteRelatedJobsCollectionData,
  replaceSitesCollectionData,
  refetchSiteCommentsCollectionData,
  siteCommentsFromCollectionState,
  upsertSiteCollectionItem as upsertSiteCollectionItemDataPlane,
  upsertSiteCommentCollectionItem as upsertSiteCommentCollectionItemDataPlane,
} from "./sites-data-plane";
import type {
  SiteCommentsCollectionState,
  SiteRelatedJobsCollectionState,
  SitesCollectionState,
} from "./sites-data-plane";

interface SitesNotice {
  readonly kind: "created" | "updated";
  readonly name: string;
}

export interface SitesAsyncResult {
  readonly error: unknown | null;
  readonly waiting: boolean;
}

interface SitesStateStore {
  readonly commentsBySiteId: Map<SiteIdType, SiteCommentsCollectionState>;
  readonly dataPlaneSession?: DataPlaneSession | undefined;
  readonly fallbackSitesRef: React.MutableRefObject<readonly SiteOption[]>;
  readonly initialCommentsBySiteId: Map<SiteIdType, readonly SiteComment[]>;
  readonly labels: LabelsCollectionState;
  readonly mutationJournal: DataPlaneMutationJournal;
  readonly organizationIdRef: React.MutableRefObject<OrganizationId>;
  readonly queryScope: OrganizationDataScope;
  readonly queryClient: QueryClient;
  readonly relatedJobsBySiteId: Map<SiteIdType, SiteRelatedJobsCollectionState>;
  readonly initialRelatedJobsBySiteId: Map<SiteIdType, readonly JobListItem[]>;
  readonly refreshVersionsBySiteId: Map<SiteIdType, number>;
  readonly sites: SitesCollectionState;
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
  readonly registerSiteRelatedJobs: (
    siteId: SiteIdType,
    jobs: readonly JobListItem[]
  ) => void;
  readonly store: SitesStateStore;
  readonly unregisterSiteRelatedJobs: (siteId: SiteIdType) => void;
  readonly updateSite: (
    siteId: SiteIdType,
    input: UpdateSiteInput
  ) => Promise<Exit.Exit<UpdateSiteResponse, AppApiError>>;
  readonly updateSiteResults: Readonly<
    Partial<Record<SiteIdType, SitesAsyncResult>>
  >;
  readonly viewer: OrganizationViewer;
}

interface SitesState {
  readonly createSiteResult: SitesAsyncResult;
  readonly notice: SitesNotice | null;
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
  const dataPlaneSession = useOptionalDataPlaneSession();
  const [fallbackQueryClient] = React.useState(() => new QueryClient());
  const queryClient =
    providedQueryClient ?? dataPlaneSession?.queryClient ?? fallbackQueryClient;
  const [store] = React.useState(() =>
    makeSitesStateStore(
      organizationIdRef,
      activeOrganizationId,
      viewer,
      queryClient,
      options.sites,
      initialSiteComments,
      dataPlaneSession
    )
  );
  const previousOptionsRef = React.useRef<SitesOptionsResponse | null>(null);
  const [state, dispatch] = React.useReducer(sitesStateReducer, {
    createSiteResult: idleSitesAsyncResult,
    notice: null,
    updateSiteResults: {},
  } satisfies SitesState);
  const { createSiteResult, notice, updateSiteResults } = state;

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
      await Promise.all(
        response.sites
          .flatMap((site) => site.labels)
          .map((label) => upsertLabelCollectionItem(store.labels, label))
      );
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

      return runTrackedSitesCommand(
        {
          affectedCollections: ["sites"],
          execute: (commandInput: CreateSiteInput) =>
            Effect.runPromiseExit(
              withMinimumMutationPendingDurationEffect(
                createBrowserSite(commandInput)
              )
            ),
          name: "sites.create",
          optimistic: "none",
          reconcile: async (createdSite) => {
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
          },
        },
        input,
        (result) =>
          dispatch({
            result,
            type: "set-create-site-result",
          }),
        store.mutationJournal
      );
    },
    [organizationIdRef, store]
  );

  const updateSite = React.useCallback(
    (siteId: SiteIdType, input: UpdateSiteInput) => {
      const expectedOrganizationId = organizationIdRef.current;

      return runTrackedSitesCommand(
        {
          affectedCollections: ["sites"],
          execute: (commandInput: {
            readonly input: UpdateSiteInput;
            readonly siteId: SiteIdType;
          }) =>
            Effect.runPromiseExit(
              withMinimumMutationPendingDurationEffect(
                updateBrowserSite(commandInput.siteId, commandInput.input)
              )
            ),
          name: "sites.update",
          optimistic: "none",
          reconcile: async (response) => {
            await syncChangedSiteDetail(
              store,
              response,
              expectedOrganizationId
            );
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
          },
        },
        { input, siteId },
        (result) =>
          dispatch({
            result,
            siteId,
            type: "set-update-site-result",
          }),
        store.mutationJournal
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

  const registerSiteRelatedJobs = React.useCallback(
    (siteId: SiteIdType, jobs: readonly JobListItem[]) => {
      store.initialRelatedJobsBySiteId.set(siteId, jobs);
      void replaceSiteRelatedJobsCollectionData(
        getOrCreateSiteRelatedJobsState(store, siteId),
        jobs
      );
    },
    [store]
  );
  const unregisterSiteRelatedJobs = React.useCallback(
    (siteId: SiteIdType) => {
      disposeSiteRelatedJobsState(store, siteId);
    },
    [store]
  );

  const assignSiteLabel = React.useCallback(
    (siteId: SiteIdType, input: AssignSiteLabelInput) => {
      const expectedOrganizationId = organizationIdRef.current;

      return runSitesCommand(
        {
          affectedCollections: ["sites", "labels"],
          execute: (commandInput: {
            readonly input: AssignSiteLabelInput;
            readonly siteId: SiteIdType;
          }) =>
            Effect.runPromiseExit(
              withMinimumMutationPendingDurationEffect(
                assignBrowserSiteLabel(commandInput.siteId, commandInput.input)
              )
            ),
          name: "sites.assign-label",
          optimistic: "none",
          reconcile: async (site) => {
            await syncChangedSiteDetail(store, site, expectedOrganizationId);
          },
        },
        { input, siteId },
        store.mutationJournal
      );
    },
    [organizationIdRef, store]
  );

  const createAndAssignSiteLabel = React.useCallback(
    (siteId: SiteIdType, input: CreateLabelInput) => {
      const expectedOrganizationId = organizationIdRef.current;

      return runSitesCommand(
        {
          affectedCollections: ["sites", "labels"],
          execute: (commandInput: {
            readonly input: CreateLabelInput;
            readonly siteId: SiteIdType;
          }) =>
            Effect.runPromiseExit(
              withMinimumMutationPendingDurationEffect(
                createBrowserLabel(commandInput.input).pipe(
                  Effect.flatMap((label) =>
                    assignBrowserSiteLabel(commandInput.siteId, {
                      labelId: label.id,
                    })
                  )
                )
              )
            ),
          name: "sites.create-and-assign-label",
          optimistic: "none",
          reconcile: async (site) => {
            await syncChangedSiteDetail(store, site, expectedOrganizationId);
          },
        },
        { input, siteId },
        store.mutationJournal
      );
    },
    [organizationIdRef, store]
  );

  const removeSiteLabel = React.useCallback(
    (siteId: SiteIdType, labelId: LabelIdType) => {
      const expectedOrganizationId = organizationIdRef.current;

      return runSitesCommand(
        {
          affectedCollections: ["sites"],
          execute: (commandInput: {
            readonly labelId: LabelIdType;
            readonly siteId: SiteIdType;
          }) =>
            Effect.runPromiseExit(
              withMinimumMutationPendingDurationEffect(
                removeBrowserSiteLabel(
                  commandInput.siteId,
                  commandInput.labelId
                )
              )
            ),
          name: "sites.remove-label",
          optimistic: "none",
          reconcile: async (site) => {
            await syncChangedSiteDetail(store, site, expectedOrganizationId);
          },
        },
        { labelId, siteId },
        store.mutationJournal
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
      registerSiteRelatedJobs,
      store,
      unregisterSiteRelatedJobs,
      updateSite,
      updateSiteResults,
      viewer,
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
      registerSiteRelatedJobs,
      unregisterSiteRelatedJobs,
      store,
      updateSite,
      updateSiteResults,
      viewer,
    ]
  );

  return React.createElement(SitesStateContext.Provider, { value }, children);
}

export function useSitesOptions(): SitesOptionsResponse {
  const { store } = useSitesStateContext();
  const sites = useSitesCollectionItems(store);

  return React.useMemo(
    () => ({
      sites: sortSiteOptions(sites),
    }),
    [sites]
  );
}

export function useOptionalSitesViewer(): OrganizationViewer | undefined {
  return use(SitesStateContext)?.viewer;
}

export function useSitesViewer(): OrganizationViewer {
  return useSitesStateContext().viewer;
}

export function useSitesNotice() {
  const { clearNotice, notice } = useSitesStateContext();

  return [notice, clearNotice] as const;
}

export function useSiteComments(siteId: SiteIdType): readonly SiteComment[] {
  const { store } = useSitesStateContext();
  const collectionState = getOrCreateSiteCommentsState(store, siteId);
  const fallbackComments = store.initialCommentsBySiteId.get(siteId) ?? [];
  const comments = useHydratedCollectionItems(
    collectionState.collection,
    fallbackComments
  );

  React.useEffect(
    () => () => {
      disposeSiteCommentsState(store, siteId);
    },
    [siteId, store]
  );

  return React.useMemo(() => sortSiteComments(comments), [comments]);
}

export function useSiteRelatedJobs(
  siteId: SiteIdType,
  initialJobs: readonly JobListItem[] = []
): readonly JobListItem[] {
  const { registerSiteRelatedJobs, store, unregisterSiteRelatedJobs } =
    useSitesStateContext();

  React.useEffect(() => {
    registerSiteRelatedJobs(siteId, initialJobs);
    return () => {
      unregisterSiteRelatedJobs(siteId);
    };
  }, [initialJobs, registerSiteRelatedJobs, siteId, unregisterSiteRelatedJobs]);

  const collectionState = getOrCreateSiteRelatedJobsState(store, siteId);
  const fallbackJobs =
    store.initialRelatedJobsBySiteId.get(siteId) ?? initialJobs;

  return useHydratedCollectionItems(collectionState.collection, fallbackJobs);
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
  initialComments?: ReadonlyMap<SiteIdType, readonly SiteComment[]>,
  dataPlaneSession?: DataPlaneSession | undefined
): SitesStateStore {
  const queryScope =
    dataPlaneSession?.scope ??
    createOrganizationDataScope({
      organizationId,
      role: viewer.role,
      userId: viewer.userId,
    });
  const sitesState = getOrCreateSitesCollectionState({
    initialSites: sites,
    queryClient,
    scope: queryScope,
    session: dataPlaneSession,
  });
  const labels = getOrCreateLabelsCollectionState({
    initialLabels: sites.flatMap((site) => site.labels),
    queryClient,
    scope: queryScope,
    session: dataPlaneSession,
  });

  return {
    commentsBySiteId: new Map(),
    dataPlaneSession,
    fallbackSitesRef: {
      current: sites,
    },
    initialCommentsBySiteId: new Map(initialComments),
    initialRelatedJobsBySiteId: new Map(),
    labels,
    mutationJournal:
      dataPlaneSession?.mutationJournal ?? createDataPlaneMutationJournal(),
    organizationIdRef,
    queryScope,
    queryClient,
    relatedJobsBySiteId: new Map(),
    refreshVersionsBySiteId: new Map(),
    sites: sitesState,
  };
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
    store.sites.collection,
    store.fallbackSitesRef.current
  );
}

async function runTrackedSitesCommand<Input, Success>(
  action: DataPlaneCommandAction<Input, Success, AppApiError>,
  input: Input,
  setResult: (result: SitesAsyncResult) => void,
  mutationJournal: DataPlaneMutationJournal
): Promise<Exit.Exit<Success, AppApiError>> {
  setResult(waitingSitesAsyncResult);
  const exit = await executeDataPlaneCommandAction(action, input, {
    journal: mutationJournal,
  });

  if (Exit.isSuccess(exit)) {
    setResult(idleSitesAsyncResult);
    return exit;
  }

  setResult({
    error: failureFromCause(exit.cause),
    waiting: false,
  });

  return exit;
}

function runSitesCommand<Input, Success>(
  action: DataPlaneCommandAction<Input, Success, AppApiError>,
  input: Input,
  mutationJournal: DataPlaneMutationJournal
): Promise<Exit.Exit<Success, AppApiError>> {
  return executeDataPlaneCommandAction(action, input, {
    journal: mutationJournal,
  });
}

function refreshSiteCommentsState(
  store: SitesStateStore,
  siteId: SiteIdType
): Promise<Exit.Exit<readonly SiteComment[], AppApiError>> {
  return executeDataPlaneCommandAction(
    {
      affectedCollections: ["site-comments"],
      execute: (commandInput: { readonly siteId: SiteIdType }) =>
        refetchSiteCommentsState(store, commandInput.siteId),
      name: "site-comments.refresh",
      optimistic: "none",
    },
    { siteId },
    { journal: store.mutationJournal }
  );
}

function addSiteCommentState(
  store: SitesStateStore,
  siteId: SiteIdType,
  input: AddSiteCommentInput
): Promise<Exit.Exit<AddSiteCommentResponse, AppApiError>> {
  return executeDataPlaneCommandAction(
    {
      affectedCollections: ["site-comments"],
      execute: (commandInput: {
        readonly input: AddSiteCommentInput;
        readonly siteId: SiteIdType;
      }) =>
        Effect.runPromiseExit(
          withMinimumMutationPendingDurationEffect(
            addBrowserSiteComment(commandInput.siteId, commandInput.input)
          )
        ),
      name: "site-comments.add",
      optimistic: "none",
      reconcile: async (comment, commandInput) => {
        await upsertSiteCommentCollectionItem(
          store,
          commandInput.siteId,
          comment
        );
        await refreshSiteCommentsIfPossible(store, commandInput.siteId);
      },
    },
    { input, siteId },
    { journal: store.mutationJournal }
  );
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
  const collectionState = getOrCreateSiteCommentsState(store, siteId);
  const exit = await Effect.runPromiseExit(
    Effect.tryPromise({
      try: async () =>
        await refetchSiteCommentsCollectionData(
          collectionState,
          store.initialCommentsBySiteId.get(siteId) ?? []
        ),
      catch: normalizeAppApiError,
    })
  );

  if (
    Exit.isSuccess(exit) &&
    store.refreshVersionsBySiteId.get(siteId) !== refreshVersion
  ) {
    return Exit.succeed(
      siteCommentsFromCollection(
        collectionState,
        store.initialCommentsBySiteId.get(siteId) ?? []
      )
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

  return replaceSitesCollectionData(store.sites, sites);
}

async function upsertSiteCollectionItem(
  store: SitesStateStore,
  site: SiteOption
): Promise<void> {
  store.fallbackSitesRef.current = upsertSiteOption(
    store.fallbackSitesRef.current,
    site
  );
  await Promise.all([
    upsertSiteCollectionItemDataPlane(store.sites, site),
    ...site.labels.map((label) =>
      upsertLabelCollectionItem(store.labels, label)
    ),
  ]);
}

async function upsertSiteCommentCollectionItem(
  store: SitesStateStore,
  siteId: SiteIdType,
  comment: AddSiteCommentResponse
): Promise<void> {
  const collectionState = getOrCreateSiteCommentsState(store, siteId);
  await upsertSiteCommentCollectionItemDataPlane(collectionState, comment);
}

function getOrCreateSiteCommentsState(
  store: SitesStateStore,
  siteId: SiteIdType
) {
  const existing = store.commentsBySiteId.get(siteId);

  if (existing) {
    return existing;
  }

  const collectionState = getOrCreateSiteCommentsCollectionState({
    initialComments: store.initialCommentsBySiteId.get(siteId) ?? [],
    queryClient: store.queryClient,
    scope: store.queryScope,
    session: store.dataPlaneSession,
    siteId,
  });
  store.commentsBySiteId.set(siteId, collectionState);

  return collectionState;
}

function getOrCreateSiteRelatedJobsState(
  store: SitesStateStore,
  siteId: SiteIdType
) {
  const existing = store.relatedJobsBySiteId.get(siteId);

  if (existing) {
    return existing;
  }

  const collectionState = getOrCreateSiteRelatedJobsCollectionState({
    initialJobs: store.initialRelatedJobsBySiteId.get(siteId) ?? [],
    queryClient: store.queryClient,
    scope: store.queryScope,
    session: store.dataPlaneSession,
    siteId,
  });
  store.relatedJobsBySiteId.set(siteId, collectionState);

  return collectionState;
}

function disposeSiteCommentsState(store: SitesStateStore, siteId: SiteIdType) {
  queueMicrotask(() => {
    const collectionState = store.commentsBySiteId.get(siteId);

    if (!collectionState || collectionState.collection.subscriberCount > 0) {
      return;
    }

    store.commentsBySiteId.delete(siteId);
    deleteSiteCommentsCollectionState({
      scope: store.queryScope,
      session: store.dataPlaneSession,
      siteId,
    });
  });
}

function disposeSiteRelatedJobsState(
  store: SitesStateStore,
  siteId: SiteIdType
) {
  queueMicrotask(() => {
    const collectionState = store.relatedJobsBySiteId.get(siteId);

    if (!collectionState || collectionState.collection.subscriberCount > 0) {
      return;
    }

    store.relatedJobsBySiteId.delete(siteId);
    store.initialRelatedJobsBySiteId.delete(siteId);
    deleteSiteRelatedJobsCollectionState({
      scope: store.queryScope,
      session: store.dataPlaneSession,
      siteId,
    });
  });
}

function siteCommentsFromCollection(
  collectionState: SiteCommentsCollectionState,
  fallbackComments: readonly SiteComment[]
): readonly SiteComment[] {
  return siteCommentsFromCollectionState(collectionState, fallbackComments);
}

function pruneInactiveSiteCommentCollections(
  store: SitesStateStore,
  sites: readonly SiteOption[]
) {
  const activeSiteIds = new Set(sites.map((site) => site.id));
  for (const [siteId, collectionState] of store.commentsBySiteId) {
    if (
      activeSiteIds.has(siteId) ||
      collectionState.collection.subscriberCount > 0
    ) {
      continue;
    }

    store.commentsBySiteId.delete(siteId);
    deleteSiteCommentsCollectionState({
      scope: store.queryScope,
      session: store.dataPlaneSession,
      siteId,
    });
  }
}

function sortSiteOptions(sites: readonly SiteOption[]) {
  return sites.toSorted(compareSiteOptions);
}

function upsertSiteOption(
  sites: readonly SiteOption[],
  site: SiteOption
): readonly SiteOption[] {
  const existingIndex = sites.findIndex((current) => current.id === site.id);

  if (existingIndex === -1) {
    return sortSiteOptions([...sites, site]);
  }

  return sortSiteOptions(
    sites.map((current, index) => (index === existingIndex ? site : current))
  );
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
