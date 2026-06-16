"use client";
import type {
  AddJobCommentInput,
  AddJobCommentResponse,
  AddJobVisitInput,
  AddJobVisitResponse,
  AssignJobLabelInput,
  AttachJobCollaboratorInput,
  Job,
  JobCollaborator,
  JobCollaboratorIdType,
  JobDetailResponse,
  PatchJobInput,
  TransitionJobInput,
  UpdateJobCollaboratorInput,
  WorkItemIdType,
} from "@ceird/jobs-core";
import type { CreateLabelInput, LabelIdType } from "@ceird/labels-core";
import { QueryClient } from "@tanstack/query-core";
/* oxlint-disable unicorn/no-array-sort */
import { Cause, Effect, Exit, Option } from "effect";
import { use } from "react";
import * as React from "react";

import { executeDataPlaneCommandAction } from "#/data-plane/command-action";
import type { DataPlaneCommandAction } from "#/data-plane/command-action";
import { useHydratedCollectionItems } from "#/data-plane/hydrated-collection";
import { createDataPlaneMutationJournal } from "#/data-plane/mutation-journal";
import type { DataPlaneMutationJournal } from "#/data-plane/mutation-journal";
import { useOptionalDataPlaneSession } from "#/data-plane/session";
import type { DataPlaneSession } from "#/data-plane/session";
import { runBrowserAppApiRequest } from "#/features/api/app-api-client";
import type { AppApiError } from "#/features/api/app-api-errors";
import { createBrowserLabel } from "#/features/labels/labels-state";
import {
  deleteSiteRelatedJobCollectionItem,
  getSiteRelatedJobsCollectionState,
  upsertSiteRelatedJobCollectionItem,
} from "#/features/sites/sites-data-plane";
import { withMinimumMutationPendingDurationEffect } from "#/lib/mutation-feedback-effect";

import {
  deleteJobCollaboratorsCollectionState,
  deleteJobDetailCollectionState,
  deleteJobCollaboratorCollectionItem,
  getOrCreateJobCollaboratorsCollectionState,
  getOrCreateJobDetailCollectionState,
  replaceJobCollaboratorsCollectionData,
  replaceJobDetailCollectionData,
  toJobDetailCollectionItem,
  upsertJobCollaboratorCollectionItem,
} from "./jobs-data-plane";
import type {
  JobCollaboratorsCollectionState,
  JobDetailCollectionState,
} from "./jobs-data-plane";
import {
  getJobsAsyncErrorMessage,
  toJobListItem,
  useUpsertJobOptionLabel,
  useUpsertJobsListItem,
} from "./jobs-state";
import type { JobsAsyncResult } from "./jobs-state";

type JobsDetailMutationKey =
  | "addComment"
  | "addVisit"
  | "assignLabel"
  | "attachCollaborator"
  | "createAndAssignLabel"
  | "detachCollaborator"
  | "patch"
  | "refreshCollaborators"
  | "removeLabel"
  | "reopen"
  | "transition"
  | "updateCollaborator";

type JobsDetailMutationResults = Readonly<
  Record<JobsDetailMutationKey, JobsAsyncResult>
>;

interface JobsDetailState {
  readonly results: JobsDetailMutationResults;
}

interface JobsDetailStateAction {
  readonly key: JobsDetailMutationKey;
  readonly result: JobsAsyncResult;
  readonly type: "set-result";
}

interface JobsDetailStateStore {
  readonly collaborators: JobCollaboratorsCollectionState;
  readonly dataPlaneSession?: DataPlaneSession | undefined;
  readonly detail: JobDetailCollectionState;
  readonly fallbackCollaboratorsRef: React.MutableRefObject<
    readonly JobCollaborator[]
  >;
  readonly fallbackDetailRef: React.MutableRefObject<JobDetailResponse>;
  readonly mutationJournal: DataPlaneMutationJournal;
  readonly queryClient: QueryClient;
}

export interface JobsDetailStateContextValue {
  readonly addJobComment: (
    input: AddJobCommentInput
  ) => Promise<Exit.Exit<AddJobCommentResponse, AppApiError>>;
  readonly addJobVisit: (
    input: AddJobVisitInput
  ) => Promise<Exit.Exit<AddJobVisitResponse, AppApiError>>;
  readonly assignJobLabel: (
    input: AssignJobLabelInput
  ) => Promise<Exit.Exit<JobDetailResponse, AppApiError>>;
  readonly attachCollaborator: (
    input: AttachJobCollaboratorInput
  ) => Promise<Exit.Exit<JobCollaborator, AppApiError>>;
  readonly collaborators: readonly JobCollaborator[];
  readonly createAndAssignJobLabel: (
    input: CreateLabelInput
  ) => Promise<Exit.Exit<JobDetailResponse, AppApiError>>;
  readonly detachCollaborator: (
    collaboratorId: JobCollaboratorIdType
  ) => Promise<Exit.Exit<JobCollaborator, AppApiError>>;
  readonly detail: JobDetailResponse;
  readonly patchJob: (
    input: PatchJobInput
  ) => Promise<Exit.Exit<Job, AppApiError>>;
  readonly refreshCollaborators: () => Promise<
    Exit.Exit<readonly JobCollaborator[], AppApiError>
  >;
  readonly removeJobLabel: (
    labelId: LabelIdType
  ) => Promise<Exit.Exit<JobDetailResponse, AppApiError>>;
  readonly reopenJob: () => Promise<Exit.Exit<Job, AppApiError>>;
  readonly results: JobsDetailMutationResults;
  readonly transitionJob: (
    input: TransitionJobInput
  ) => Promise<Exit.Exit<Job, AppApiError>>;
  readonly updateCollaborator: (input: {
    readonly collaboratorId: JobCollaboratorIdType;
    readonly input: UpdateJobCollaboratorInput;
  }) => Promise<Exit.Exit<JobCollaborator, AppApiError>>;
}

const JobsDetailStateContext =
  React.createContext<JobsDetailStateContextValue | null>(null);

const idleJobsDetailAsyncResult: JobsAsyncResult = {
  error: null,
  waiting: false,
};

const waitingJobsDetailAsyncResult: JobsAsyncResult = {
  error: null,
  waiting: true,
};

const initialJobsDetailMutationResults: JobsDetailMutationResults = {
  addComment: idleJobsDetailAsyncResult,
  addVisit: idleJobsDetailAsyncResult,
  assignLabel: idleJobsDetailAsyncResult,
  attachCollaborator: idleJobsDetailAsyncResult,
  createAndAssignLabel: idleJobsDetailAsyncResult,
  detachCollaborator: idleJobsDetailAsyncResult,
  patch: idleJobsDetailAsyncResult,
  refreshCollaborators: idleJobsDetailAsyncResult,
  removeLabel: idleJobsDetailAsyncResult,
  reopen: idleJobsDetailAsyncResult,
  transition: idleJobsDetailAsyncResult,
  updateCollaborator: idleJobsDetailAsyncResult,
};

export function JobsDetailStateProvider({
  children,
  initialDetail,
}: {
  readonly children: React.ReactNode;
  readonly initialDetail: JobDetailResponse;
}) {
  const workItemId = initialDetail.job.id;
  const upsertJobsListItem = useUpsertJobsListItem();
  const upsertJobOptionLabel = useUpsertJobOptionLabel();
  const dataPlaneSession = useOptionalDataPlaneSession();
  const [fallbackQueryClient] = React.useState(() => new QueryClient());
  const [store] = React.useState(() =>
    makeJobsDetailStateStore(
      initialDetail,
      dataPlaneSession,
      fallbackQueryClient
    )
  );
  const [state, dispatch] = React.useReducer(jobsDetailStateReducer, {
    results: initialJobsDetailMutationResults,
  } satisfies JobsDetailState);
  const fallbackDetailItems = React.useMemo(
    () => [toJobDetailCollectionItem(store.fallbackDetailRef.current)],
    [store]
  );
  const detailItems = useHydratedCollectionItems(
    store.detail.collection,
    fallbackDetailItems
  );
  const currentDetail = React.useMemo(
    () => detailItems[0]?.detail ?? store.fallbackDetailRef.current,
    [detailItems, store.fallbackDetailRef]
  );
  const currentCollaborators = useHydratedCollectionItems(
    store.collaborators.collection,
    store.fallbackCollaboratorsRef.current
  );
  const detailRef = React.useRef(currentDetail);

  React.useEffect(
    () => () => {
      if (!store.dataPlaneSession) {
        return;
      }

      deleteJobDetailCollectionState({
        scope: store.dataPlaneSession.scope,
        session: store.dataPlaneSession,
        workItemId,
      });
      deleteJobCollaboratorsCollectionState({
        scope: store.dataPlaneSession.scope,
        session: store.dataPlaneSession,
        workItemId,
      });
    },
    [store, workItemId]
  );

  React.useEffect(() => {
    detailRef.current = currentDetail;
  }, [currentDetail]);

  React.useEffect(() => {
    store.fallbackDetailRef.current = initialDetail;
    void replaceJobDetailCollectionData(store.detail, initialDetail);
  }, [initialDetail, store]);

  const refreshDetailIfPossible = React.useCallback(async () => {
    const exit = await Effect.runPromiseExit(getBrowserJobDetail(workItemId));

    if (Exit.isSuccess(exit)) {
      detailRef.current = exit.value;
      store.fallbackDetailRef.current = exit.value;
      await replaceJobDetailCollectionData(store.detail, exit.value);
      return;
    }

    await Effect.runPromise(
      Effect.logWarning("Job detail refresh failed; keeping optimistic state", {
        error: getJobsAsyncErrorMessage(failureFromCause(exit.cause)),
        workItemId,
      })
    );
  }, [store, workItemId]);

  const syncChangedJob = React.useCallback(
    async (job: Job) => {
      const previousSiteId = detailRef.current.job.siteId;
      const nextDetail = updateJobDetailJob(detailRef.current, job);
      detailRef.current = nextDetail;
      store.fallbackDetailRef.current = nextDetail;
      await replaceJobDetailCollectionData(store.detail, nextDetail);
      await upsertJobsListItem(job);
      await reconcileLoadedSiteRelatedJobsForJob(store, previousSiteId, job);
      await refreshDetailIfPossible();
    },
    [refreshDetailIfPossible, store, upsertJobsListItem]
  );

  const syncChangedJobDetail = React.useCallback(
    async (nextDetail: JobDetailResponse) => {
      const previousSiteId = detailRef.current.job.siteId;
      detailRef.current = nextDetail;
      store.fallbackDetailRef.current = nextDetail;
      await replaceJobDetailCollectionData(store.detail, nextDetail);
      await upsertJobsListItem(nextDetail.job);
      await reconcileLoadedSiteRelatedJobsForJob(
        store,
        previousSiteId,
        nextDetail.job
      );
    },
    [store, upsertJobsListItem]
  );

  const runMutation = React.useCallback(
    <Success>(
      key: JobsDetailMutationKey,
      affectedCollections: DataPlaneCommandAction<
        void,
        Success,
        AppApiError
      >["affectedCollections"],
      effect: Effect.Effect<Success, AppApiError>,
      onSuccess: (value: Success) => Promise<void> | void
    ) =>
      runTrackedJobsDetailCommand(
        {
          affectedCollections,
          execute: () => Effect.runPromiseExit(effect),
          name: `job-detail.${key}`,
          optimistic: "none",
          reconcile: onSuccess,
        },
        undefined,
        (result) =>
          dispatch({
            key,
            result,
            type: "set-result",
          }),
        store.mutationJournal
      ),
    [store.mutationJournal]
  );

  const refreshCollaborators = React.useCallback(
    () =>
      runMutation(
        "refreshCollaborators",
        ["job-collaborators"],
        listBrowserJobCollaborators(workItemId).pipe(
          Effect.map((response) => response.collaborators)
        ),
        async (nextCollaborators) => {
          store.fallbackCollaboratorsRef.current = nextCollaborators;
          await replaceJobCollaboratorsCollectionData(
            store.collaborators,
            nextCollaborators
          );
        }
      ),
    [runMutation, store, workItemId]
  );

  const transitionJob = React.useCallback(
    (input: TransitionJobInput) =>
      runMutation(
        "transition",
        ["job-details", "jobs", "site-related-jobs"],
        withMinimumMutationPendingDurationEffect(
          transitionBrowserJob(workItemId, input).pipe(
            Effect.map((response) => response.job)
          )
        ),
        syncChangedJob
      ),
    [runMutation, syncChangedJob, workItemId]
  );

  const reopenJob = React.useCallback(
    () =>
      runMutation(
        "reopen",
        ["job-details", "jobs", "site-related-jobs"],
        withMinimumMutationPendingDurationEffect(
          reopenBrowserJob(workItemId).pipe(
            Effect.map((response) => response.job)
          )
        ),
        syncChangedJob
      ),
    [runMutation, syncChangedJob, workItemId]
  );

  const patchJob = React.useCallback(
    (input: PatchJobInput) =>
      runMutation(
        "patch",
        ["job-details", "jobs", "site-related-jobs"],
        withMinimumMutationPendingDurationEffect(
          patchBrowserJob(workItemId, input).pipe(
            Effect.map((response) => response.job)
          )
        ),
        syncChangedJob
      ),
    [runMutation, syncChangedJob, workItemId]
  );

  const addJobComment = React.useCallback(
    (input: AddJobCommentInput) =>
      runMutation(
        "addComment",
        ["job-details"],
        withMinimumMutationPendingDurationEffect(
          addBrowserJobComment(workItemId, input)
        ),
        async (comment) => {
          const nextDetail = appendJobComment(detailRef.current, comment);
          detailRef.current = nextDetail;
          store.fallbackDetailRef.current = nextDetail;
          await replaceJobDetailCollectionData(store.detail, nextDetail);
          await refreshDetailIfPossible();
        }
      ),
    [refreshDetailIfPossible, runMutation, store, workItemId]
  );

  const addJobVisit = React.useCallback(
    (input: AddJobVisitInput) =>
      runMutation(
        "addVisit",
        ["job-details"],
        withMinimumMutationPendingDurationEffect(
          addBrowserJobVisit(workItemId, input)
        ),
        async (visit) => {
          const nextDetail = insertJobVisit(detailRef.current, visit);
          detailRef.current = nextDetail;
          store.fallbackDetailRef.current = nextDetail;
          await replaceJobDetailCollectionData(store.detail, nextDetail);
          await refreshDetailIfPossible();
        }
      ),
    [refreshDetailIfPossible, runMutation, store, workItemId]
  );

  const assignJobLabel = React.useCallback(
    (input: AssignJobLabelInput) =>
      runMutation(
        "assignLabel",
        ["job-details", "jobs", "site-related-jobs"],
        withMinimumMutationPendingDurationEffect(
          assignBrowserJobLabel(workItemId, input).pipe(
            Effect.map((response) => response.detail)
          )
        ),
        syncChangedJobDetail
      ),
    [runMutation, syncChangedJobDetail, workItemId]
  );

  const createAndAssignJobLabel = React.useCallback(
    (input: CreateLabelInput) =>
      runMutation(
        "createAndAssignLabel",
        ["job-details", "jobs", "labels", "job-options", "site-related-jobs"],
        withMinimumMutationPendingDurationEffect(
          createBrowserLabel(input).pipe(
            Effect.tap((label) =>
              Effect.sync(() => {
                upsertJobOptionLabel(label);
              })
            ),
            Effect.flatMap((label) =>
              assignBrowserJobLabel(workItemId, { labelId: label.id })
            ),
            Effect.map((response) => response.detail)
          )
        ),
        syncChangedJobDetail
      ),
    [runMutation, syncChangedJobDetail, upsertJobOptionLabel, workItemId]
  );

  const removeJobLabel = React.useCallback(
    (labelId: LabelIdType) =>
      runMutation(
        "removeLabel",
        ["job-details", "jobs", "site-related-jobs"],
        withMinimumMutationPendingDurationEffect(
          removeBrowserJobLabel(workItemId, labelId).pipe(
            Effect.map((response) => response.detail)
          )
        ),
        syncChangedJobDetail
      ),
    [runMutation, syncChangedJobDetail, workItemId]
  );

  const attachCollaborator = React.useCallback(
    (input: AttachJobCollaboratorInput) =>
      runMutation(
        "attachCollaborator",
        ["job-collaborators"],
        withMinimumMutationPendingDurationEffect(
          attachBrowserJobCollaborator(workItemId, input)
        ),
        async (collaborator) => {
          store.fallbackCollaboratorsRef.current = upsertJobCollaborator(
            store.fallbackCollaboratorsRef.current,
            collaborator
          );
          await upsertJobCollaboratorCollectionItem(
            store.collaborators,
            collaborator
          );
        }
      ),
    [runMutation, store, workItemId]
  );

  const updateCollaborator = React.useCallback(
    ({
      collaboratorId,
      input,
    }: {
      readonly collaboratorId: JobCollaboratorIdType;
      readonly input: UpdateJobCollaboratorInput;
    }) =>
      runMutation(
        "updateCollaborator",
        ["job-collaborators"],
        withMinimumMutationPendingDurationEffect(
          updateBrowserJobCollaborator(workItemId, collaboratorId, input)
        ),
        async (collaborator) => {
          store.fallbackCollaboratorsRef.current = upsertJobCollaborator(
            store.fallbackCollaboratorsRef.current,
            collaborator
          );
          await upsertJobCollaboratorCollectionItem(
            store.collaborators,
            collaborator
          );
        }
      ),
    [runMutation, store, workItemId]
  );

  const detachCollaborator = React.useCallback(
    (collaboratorId: JobCollaboratorIdType) =>
      runMutation(
        "detachCollaborator",
        ["job-collaborators"],
        withMinimumMutationPendingDurationEffect(
          detachBrowserJobCollaborator(workItemId, collaboratorId)
        ),
        async (collaborator) => {
          store.fallbackCollaboratorsRef.current =
            store.fallbackCollaboratorsRef.current.filter(
              (current) => current.id !== collaborator.id
            );
          await deleteJobCollaboratorCollectionItem(
            store.collaborators,
            collaborator.id
          );
        }
      ),
    [runMutation, store, workItemId]
  );

  const value = React.useMemo<JobsDetailStateContextValue>(
    () => ({
      addJobComment,
      addJobVisit,
      assignJobLabel,
      attachCollaborator,
      collaborators: currentCollaborators,
      createAndAssignJobLabel,
      detachCollaborator,
      detail: currentDetail,
      patchJob,
      refreshCollaborators,
      removeJobLabel,
      reopenJob,
      results: state.results,
      transitionJob,
      updateCollaborator,
    }),
    [
      addJobComment,
      addJobVisit,
      assignJobLabel,
      attachCollaborator,
      createAndAssignJobLabel,
      currentCollaborators,
      detachCollaborator,
      currentDetail,
      patchJob,
      refreshCollaborators,
      removeJobLabel,
      reopenJob,
      state.results,
      transitionJob,
      updateCollaborator,
    ]
  );

  return React.createElement(
    JobsDetailStateContext.Provider,
    { value },
    children
  );
}

export function useJobsDetailState() {
  const context = use(JobsDetailStateContext);

  if (!context) {
    throw new Error(
      "Jobs detail state must be used inside JobsDetailStateProvider."
    );
  }

  return context;
}

function jobsDetailStateReducer(
  state: JobsDetailState,
  action: JobsDetailStateAction
): JobsDetailState {
  switch (action.type) {
    case "set-result": {
      return {
        ...state,
        results: {
          ...state.results,
          [action.key]: action.result,
        },
      };
    }
    default: {
      return state;
    }
  }
}

function makeJobsDetailStateStore(
  initialDetail: JobDetailResponse,
  dataPlaneSession: DataPlaneSession | undefined,
  fallbackQueryClient: QueryClient
): JobsDetailStateStore {
  if (!dataPlaneSession) {
    throw new Error("Jobs detail state requires a data-plane session.");
  }

  const queryClient = dataPlaneSession.queryClient ?? fallbackQueryClient;
  const detail = getOrCreateJobDetailCollectionState({
    initialDetail,
    queryClient,
    scope: dataPlaneSession.scope,
    session: dataPlaneSession,
  });
  const collaborators = getOrCreateJobCollaboratorsCollectionState({
    initialCollaborators: [],
    queryClient,
    scope: dataPlaneSession.scope,
    session: dataPlaneSession,
    workItemId: initialDetail.job.id,
  });

  return {
    collaborators,
    dataPlaneSession,
    detail,
    fallbackCollaboratorsRef: {
      current: [],
    },
    fallbackDetailRef: {
      current: initialDetail,
    },
    mutationJournal:
      dataPlaneSession.mutationJournal ?? createDataPlaneMutationJournal(),
    queryClient,
  };
}

async function runTrackedJobsDetailCommand<Input, Success>(
  action: DataPlaneCommandAction<Input, Success, AppApiError>,
  input: Input,
  setResult: (result: JobsAsyncResult) => void,
  mutationJournal: DataPlaneMutationJournal
): Promise<Exit.Exit<Success, AppApiError>> {
  setResult(waitingJobsDetailAsyncResult);
  const exit = await executeDataPlaneCommandAction(action, input, {
    journal: mutationJournal,
  });

  if (Exit.isSuccess(exit)) {
    setResult(idleJobsDetailAsyncResult);
    return exit;
  }

  setResult({
    error: failureFromCause(exit.cause),
    waiting: false,
  });

  return exit;
}

function getBrowserJobDetail(workItemId: WorkItemIdType) {
  return runBrowserAppApiRequest("JobsBrowser.getJobDetail", (client) =>
    client.jobs.getJobDetail({
      params: { workItemId },
    })
  );
}

function transitionBrowserJob(
  workItemId: WorkItemIdType,
  input: TransitionJobInput
) {
  return runBrowserAppApiRequest("JobsBrowser.transitionJob", (client) =>
    client.jobs.transitionJob({
      params: { workItemId },
      payload: input,
    })
  );
}

function reopenBrowserJob(workItemId: WorkItemIdType) {
  return runBrowserAppApiRequest("JobsBrowser.reopenJob", (client) =>
    client.jobs.reopenJob({
      params: { workItemId },
    })
  );
}

function patchBrowserJob(workItemId: WorkItemIdType, input: PatchJobInput) {
  return runBrowserAppApiRequest("JobsBrowser.patchJob", (client) =>
    client.jobs.patchJob({
      params: { workItemId },
      payload: input,
    })
  );
}

function addBrowserJobComment(
  workItemId: WorkItemIdType,
  input: AddJobCommentInput
) {
  return runBrowserAppApiRequest("JobsBrowser.addJobComment", (client) =>
    client.jobs.addJobComment({
      params: { workItemId },
      payload: input,
    })
  );
}

function addBrowserJobVisit(
  workItemId: WorkItemIdType,
  input: AddJobVisitInput
) {
  return runBrowserAppApiRequest("JobsBrowser.addJobVisit", (client) =>
    client.jobs.addJobVisit({
      params: { workItemId },
      payload: input,
    })
  );
}

function assignBrowserJobLabel(
  workItemId: WorkItemIdType,
  input: AssignJobLabelInput
) {
  return runBrowserAppApiRequest("JobsBrowser.assignJobLabel", (client) =>
    client.jobs.assignJobLabel({
      params: { workItemId },
      payload: input,
    })
  );
}

function listBrowserJobCollaborators(workItemId: WorkItemIdType) {
  return runBrowserAppApiRequest("JobsBrowser.listJobCollaborators", (client) =>
    client.jobs.listJobCollaborators({
      params: { workItemId },
    })
  );
}

function attachBrowserJobCollaborator(
  workItemId: WorkItemIdType,
  input: AttachJobCollaboratorInput
) {
  return runBrowserAppApiRequest(
    "JobsBrowser.attachJobCollaborator",
    (client) =>
      client.jobs.attachJobCollaborator({
        params: { workItemId },
        payload: input,
      })
  );
}

function updateBrowserJobCollaborator(
  workItemId: WorkItemIdType,
  collaboratorId: JobCollaboratorIdType,
  input: UpdateJobCollaboratorInput
) {
  return runBrowserAppApiRequest(
    "JobsBrowser.updateJobCollaborator",
    (client) =>
      client.jobs.updateJobCollaborator({
        params: { collaboratorId, workItemId },
        payload: input,
      })
  );
}

function detachBrowserJobCollaborator(
  workItemId: WorkItemIdType,
  collaboratorId: JobCollaboratorIdType
) {
  return runBrowserAppApiRequest(
    "JobsBrowser.detachJobCollaborator",
    (client) =>
      client.jobs.detachJobCollaborator({
        params: { collaboratorId, workItemId },
      })
  );
}

function removeBrowserJobLabel(
  workItemId: WorkItemIdType,
  labelId: LabelIdType
) {
  return runBrowserAppApiRequest("JobsBrowser.removeJobLabel", (client) =>
    client.jobs.removeJobLabel({
      params: { labelId, workItemId },
    })
  );
}

function updateJobDetailJob(
  currentDetail: JobDetailResponse,
  job: Job
): JobDetailResponse {
  const { contact, site, ...detailWithoutContactAndSite } = currentDetail;
  const matchingContact = contact?.id === job.contactId ? { contact } : {};
  const matchingSite = site?.id === job.siteId ? { site } : {};

  return {
    ...detailWithoutContactAndSite,
    ...matchingContact,
    ...matchingSite,
    job,
  };
}

function appendJobComment(
  currentDetail: JobDetailResponse,
  comment: AddJobCommentResponse
): JobDetailResponse {
  return {
    ...currentDetail,
    comments: [
      ...currentDetail.comments.filter((current) => current.id !== comment.id),
      comment,
    ],
  };
}

function insertJobVisit(
  currentDetail: JobDetailResponse,
  visit: AddJobVisitResponse
): JobDetailResponse {
  return {
    ...currentDetail,
    visits: [
      visit,
      ...currentDetail.visits.filter((current) => current.id !== visit.id),
    ].sort((left, right) => {
      const dateOrder = right.visitDate.localeCompare(left.visitDate);

      return dateOrder === 0
        ? String(right.id).localeCompare(String(left.id))
        : dateOrder;
    }),
  };
}

function upsertJobCollaborator(
  collaborators: readonly JobCollaborator[],
  collaborator: JobCollaborator
) {
  return [
    collaborator,
    ...collaborators.filter((item) => item.id !== collaborator.id),
  ].sort((left, right) => left.roleLabel.localeCompare(right.roleLabel));
}

async function reconcileLoadedSiteRelatedJobsForJob(
  store: JobsDetailStateStore,
  previousSiteId: Job["siteId"],
  job: Job
) {
  if (!store.dataPlaneSession) {
    return;
  }

  const nextSiteId = job.siteId;
  const operations: Promise<void>[] = [];

  if (previousSiteId !== undefined && previousSiteId !== nextSiteId) {
    const previousState = getSiteRelatedJobsCollectionState({
      scope: store.dataPlaneSession.scope,
      session: store.dataPlaneSession,
      siteId: previousSiteId,
    });

    if (previousState) {
      operations.push(
        deleteSiteRelatedJobCollectionItem(previousState, job.id)
      );
    }
  }

  if (nextSiteId !== undefined) {
    const nextState = getSiteRelatedJobsCollectionState({
      scope: store.dataPlaneSession.scope,
      session: store.dataPlaneSession,
      siteId: nextSiteId,
    });

    if (nextState) {
      operations.push(
        upsertSiteRelatedJobCollectionItem(nextState, toJobListItem(job))
      );
    }
  }

  await Promise.all(operations);
}

function failureFromCause<Failure>(cause: Cause.Cause<Failure>): unknown {
  const failure = Cause.findErrorOption(cause);

  return Option.isSome(failure) ? failure.value : Cause.squash(cause);
}
