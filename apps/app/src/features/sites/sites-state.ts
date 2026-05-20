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
import {
  createCollection,
  localOnlyCollectionOptions,
} from "@tanstack/react-db";
import { Cause, Effect, Exit, Option, Schema } from "effect";
import { use } from "react";
import * as React from "react";

import { runBrowserAppApiRequest } from "#/features/api/app-api-client";
import type { AppApiError } from "#/features/api/app-api-errors";
import { createBrowserLabel } from "#/features/labels/labels-state";
import { withMinimumMutationPendingDurationEffect } from "#/lib/mutation-feedback-effect";

type SitesCollection = ReturnType<typeof makeSitesCollection>;
type SiteCommentsCollection = ReturnType<typeof makeSiteCommentsCollection>;

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
  readonly initialCommentsBySiteId: Map<SiteIdType, readonly SiteComment[]>;
  readonly organizationIdRef: React.MutableRefObject<OrganizationId>;
  readonly refreshVersionsBySiteId: Map<SiteIdType, number>;
  readonly sites: SitesCollection;
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
}: {
  readonly activeOrganizationId: OrganizationId;
  readonly children: React.ReactNode;
  readonly initialSiteComments?: ReadonlyMap<
    SiteIdType,
    readonly SiteComment[]
  >;
  readonly options: SitesOptionsResponse;
}) {
  const organizationIdRef = React.useRef(activeOrganizationId);
  const [store] = React.useState(() =>
    makeSitesStateStore(
      organizationIdRef,
      activeOrganizationId,
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

  React.useEffect(
    () => () => {
      void store.sites.cleanup();

      for (const collection of store.commentsBySiteId.values()) {
        void collection.cleanup();
      }
    },
    [store]
  );

  const replaceSitesOptionsState = React.useCallback(
    async (organizationId: OrganizationId, response: SitesOptionsResponse) => {
      organizationIdRef.current = organizationId;
      store.refreshVersionsBySiteId.clear();

      for (const collection of store.commentsBySiteId.values()) {
        await collection.cleanup();
      }

      store.commentsBySiteId.clear();
      store.initialCommentsBySiteId.clear();
      await replaceSites(store.sites, response.sites);
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
  const sites = useSitesCollectionItems(store.sites);

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
  const collection = React.useMemo(
    () => getOrCreateSiteCommentsCollection(store, siteId),
    [siteId, store]
  );
  const comments = useSiteCommentCollectionItems(collection);

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
  sites: readonly SiteOption[],
  initialComments?: ReadonlyMap<SiteIdType, readonly SiteComment[]>
): SitesStateStore {
  return {
    commentsBySiteId: new Map(),
    initialCommentsBySiteId: new Map(initialComments),
    organizationIdRef,
    refreshVersionsBySiteId: new Map(),
    sites: makeSitesCollection(organizationId, sites),
  };
}

function makeSitesCollection(
  organizationId: OrganizationId,
  sites: readonly SiteOption[]
) {
  return createCollection(
    localOnlyCollectionOptions({
      getKey: (site) => site.id,
      id: `organization:${organizationId}:sites`,
      initialData: [...sites],
      schema: Schema.toStandardSchemaV1(SiteOptionSchema),
    })
  );
}

function makeSiteCommentsCollection(
  organizationId: OrganizationId,
  siteId: SiteIdType,
  comments: readonly SiteComment[]
) {
  return createCollection(
    localOnlyCollectionOptions({
      getKey: (comment) => comment.id,
      id: `organization:${organizationId}:site:${siteId}:comments`,
      initialData: [...comments],
      schema: Schema.toStandardSchemaV1(SiteCommentSchema),
    })
  );
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
  collection: SitesCollection
): readonly SiteOption[] {
  const [items, setItems] = React.useState(() =>
    sitesFromCollection(collection)
  );

  React.useEffect(() => {
    let active = true;
    const refresh = () => {
      if (active) {
        setItems(sitesFromCollection(collection));
      }
    };
    const subscription = collection.subscribeChanges(refresh);

    refresh();

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [collection]);

  return items;
}

function useSiteCommentCollectionItems(
  collection: SiteCommentsCollection
): readonly SiteComment[] {
  const [items, setItems] = React.useState(() =>
    siteCommentsFromCollection(collection)
  );

  React.useEffect(() => {
    let active = true;
    const refresh = () => {
      if (active) {
        setItems(siteCommentsFromCollection(collection));
      }
    };
    const subscription = collection.subscribeChanges(refresh);

    refresh();

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [collection]);

  return items;
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

async function refreshSiteCommentsState(
  store: SitesStateStore,
  siteId: SiteIdType
): Promise<Exit.Exit<readonly SiteComment[], AppApiError>> {
  const refreshVersion = beginSiteCommentsRefresh(store, siteId);
  const exit = await Effect.runPromiseExit(
    listBrowserSiteComments(siteId).pipe(
      Effect.map((response) => sortSiteComments(response.comments))
    )
  );

  if (Exit.isSuccess(exit)) {
    await replaceSiteCommentsIfCurrent(
      store,
      siteId,
      refreshVersion,
      exit.value
    );
  }

  return exit;
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
  const refreshVersion = beginSiteCommentsRefresh(store, siteId);
  const exit = await Effect.runPromiseExit(listBrowserSiteComments(siteId));

  if (Exit.isSuccess(exit)) {
    await replaceSiteCommentsIfCurrent(
      store,
      siteId,
      refreshVersion,
      exit.value.comments
    );
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

function beginSiteCommentsRefresh(store: SitesStateStore, siteId: SiteIdType) {
  const nextVersion = (store.refreshVersionsBySiteId.get(siteId) ?? 0) + 1;
  store.refreshVersionsBySiteId.set(siteId, nextVersion);

  return nextVersion;
}

async function replaceSiteCommentsIfCurrent(
  store: SitesStateStore,
  siteId: SiteIdType,
  refreshVersion: number,
  comments: readonly SiteComment[]
) {
  if (store.refreshVersionsBySiteId.get(siteId) !== refreshVersion) {
    return;
  }

  await replaceSiteComments(
    getOrCreateSiteCommentsCollection(store, siteId),
    sortSiteComments(comments)
  );
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

  await upsertSiteCollectionItem(store.sites, site);
}

async function replaceSites(
  collection: SitesCollection,
  sites: readonly SiteOption[]
) {
  const existingKeys = [...collection.keys()];

  if (existingKeys.length > 0) {
    await collection.delete(existingKeys).isPersisted.promise;
  }

  if (sites.length > 0) {
    await collection.insert([...sites]).isPersisted.promise;
  }
}

async function replaceSiteComments(
  collection: SiteCommentsCollection,
  comments: readonly SiteComment[]
) {
  const existingKeys = [...collection.keys()];

  if (existingKeys.length > 0) {
    await collection.delete(existingKeys).isPersisted.promise;
  }

  if (comments.length > 0) {
    await collection.insert([...comments]).isPersisted.promise;
  }
}

async function upsertSiteCollectionItem(
  collection: SitesCollection,
  site: SiteOption
) {
  if (collection.has(site.id)) {
    await collection.update(site.id, (draft) => {
      draft.accessNotes = site.accessNotes;
      draft.addressLine1 = site.addressLine1;
      draft.addressLine2 = site.addressLine2;
      draft.country = site.country;
      draft.county = site.county;
      draft.eircode = site.eircode;
      draft.labels = [...site.labels];
      draft.latitude = site.latitude;
      draft.longitude = site.longitude;
      draft.name = site.name;
      draft.serviceAreaId = site.serviceAreaId;
      draft.serviceAreaName = site.serviceAreaName;
    }).isPersisted.promise;
    return;
  }

  await collection.insert(site).isPersisted.promise;
}

async function upsertSiteCommentCollectionItem(
  store: SitesStateStore,
  siteId: SiteIdType,
  comment: AddSiteCommentResponse
) {
  const collection = getOrCreateSiteCommentsCollection(store, siteId);

  if (collection.has(comment.id)) {
    await collection.update(comment.id, (draft) => {
      draft.authorName = comment.authorName;
      draft.body = comment.body;
      draft.createdAt = comment.createdAt;
      draft.siteId = comment.siteId;
    }).isPersisted.promise;
    return;
  }

  await collection.insert(comment).isPersisted.promise;
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
    store.organizationIdRef.current,
    siteId,
    store.initialCommentsBySiteId.get(siteId) ?? []
  );
  store.commentsBySiteId.set(siteId, collection);

  return collection;
}

function sitesFromCollection(
  collection: SitesCollection
): readonly SiteOption[] {
  return collection.toArray.map(withoutVirtualProps);
}

function siteCommentsFromCollection(
  collection: SiteCommentsCollection
): readonly SiteComment[] {
  return collection.toArray.map(withoutVirtualProps);
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
