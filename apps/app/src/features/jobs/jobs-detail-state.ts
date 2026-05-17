"use client";
import type {
  AddJobCommentInput,
  AddJobCommentResponse,
  AddJobCostLineInput,
  AddJobCostLineResponse,
  AddJobVisitInput,
  AddJobVisitResponse,
  AssignJobLabelInput,
  AttachJobCollaboratorInput,
  Job,
  JobCollaborator,
  JobCollaboratorIdType,
  JobDetailResponse,
  PatchJobInput,
  PatchJobResponse,
  TransitionJobInput,
  TransitionJobResponse,
  UpdateJobCollaboratorInput,
  WorkItemIdType,
} from "@ceird/jobs-core";
import type { CreateLabelInput, LabelIdType } from "@ceird/labels-core";
/* oxlint-disable unicorn/no-array-sort */
import { Cause, Effect, Exit, Option } from "effect";
import { use } from "react";
import * as React from "react";

import { runBrowserAppApiRequest } from "#/features/api/app-api-client";
import type { AppApiError } from "#/features/api/app-api-errors";
import { createBrowserLabel } from "#/features/labels/labels-state";
import { withMinimumMutationPendingDurationEffect } from "#/lib/mutation-feedback-effect";

import {
  getJobsAsyncErrorMessage,
  useUpsertJobOptionLabel,
  useUpsertJobsListItem,
} from "./jobs-state";
import type { JobsAsyncResult } from "./jobs-state";

type JobsDetailMutationKey =
  | "addCostLine"
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
  readonly collaborators: readonly JobCollaborator[];
  readonly detail: JobDetailResponse;
  readonly results: JobsDetailMutationResults;
}

type JobsDetailStateAction =
  | {
      readonly detail: JobDetailResponse;
      readonly type: "set-detail";
    }
  | {
      readonly job: Job;
      readonly type: "set-detail-job";
    }
  | {
      readonly collaborator: JobCollaborator;
      readonly type: "upsert-collaborator";
    }
  | {
      readonly collaboratorId: JobCollaboratorIdType;
      readonly type: "remove-collaborator";
    }
  | {
      readonly collaborators: readonly JobCollaborator[];
      readonly type: "set-collaborators";
    }
  | {
      readonly comment: AddJobCommentResponse;
      readonly type: "append-comment";
    }
  | {
      readonly type: "insert-visit";
      readonly visit: AddJobVisitResponse;
    }
  | {
      readonly costLine: AddJobCostLineResponse;
      readonly type: "insert-cost-line";
    }
  | {
      readonly key: JobsDetailMutationKey;
      readonly result: JobsAsyncResult;
      readonly type: "set-result";
    };

export interface JobsDetailStateContextValue {
  readonly addJobComment: (
    input: AddJobCommentInput
  ) => Promise<Exit.Exit<AddJobCommentResponse, AppApiError>>;
  readonly addJobCostLine: (
    input: AddJobCostLineInput
  ) => Promise<Exit.Exit<AddJobCostLineResponse, AppApiError>>;
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
  ) => Promise<Exit.Exit<PatchJobResponse, AppApiError>>;
  readonly refreshCollaborators: () => Promise<
    Exit.Exit<readonly JobCollaborator[], AppApiError>
  >;
  readonly removeJobLabel: (
    labelId: LabelIdType
  ) => Promise<Exit.Exit<JobDetailResponse, AppApiError>>;
  readonly reopenJob: () => Promise<
    Exit.Exit<JobDetailResponse["job"], AppApiError>
  >;
  readonly results: JobsDetailMutationResults;
  readonly transitionJob: (
    input: TransitionJobInput
  ) => Promise<Exit.Exit<TransitionJobResponse, AppApiError>>;
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
  addCostLine: idleJobsDetailAsyncResult,
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
  const [state, dispatch] = React.useReducer(jobsDetailStateReducer, {
    collaborators: [],
    detail: initialDetail,
    results: initialJobsDetailMutationResults,
  } satisfies JobsDetailState);
  const detailRef = React.useRef(state.detail);

  React.useEffect(() => {
    detailRef.current = state.detail;
  }, [state.detail]);

  React.useEffect(() => {
    dispatch({
      detail: initialDetail,
      type: "set-detail",
    });
  }, [initialDetail]);

  const refreshDetailIfPossible = React.useCallback(async () => {
    const exit = await Effect.runPromiseExit(getBrowserJobDetail(workItemId));

    if (Exit.isSuccess(exit)) {
      detailRef.current = exit.value;
      dispatch({
        detail: exit.value,
        type: "set-detail",
      });
      return;
    }

    await Effect.runPromise(
      Effect.logWarning("Job detail refresh failed; keeping optimistic state", {
        error: getJobsAsyncErrorMessage(failureFromCause(exit.cause)),
        workItemId,
      })
    );
  }, [workItemId]);

  const syncChangedJob = React.useCallback(
    async (job: Job) => {
      detailRef.current = updateJobDetailJob(detailRef.current, job);
      dispatch({
        job,
        type: "set-detail-job",
      });
      await upsertJobsListItem(job);
      await refreshDetailIfPossible();
    },
    [refreshDetailIfPossible, upsertJobsListItem]
  );

  const syncChangedJobDetail = React.useCallback(
    async (detail: JobDetailResponse) => {
      detailRef.current = detail;
      dispatch({
        detail,
        type: "set-detail",
      });
      await upsertJobsListItem(detail.job);
    },
    [upsertJobsListItem]
  );

  const runMutation = React.useCallback(
    <Success>(
      key: JobsDetailMutationKey,
      effect: Effect.Effect<Success, AppApiError>,
      onSuccess: (value: Success) => Promise<void> | void
    ) =>
      runTrackedJobsDetailOperation(
        effect,
        (result) =>
          dispatch({
            key,
            result,
            type: "set-result",
          }),
        onSuccess
      ),
    []
  );

  const refreshCollaborators = React.useCallback(
    () =>
      runMutation(
        "refreshCollaborators",
        listBrowserJobCollaborators(workItemId).pipe(
          Effect.map((response) => response.collaborators)
        ),
        (collaborators) => {
          dispatch({
            collaborators,
            type: "set-collaborators",
          });
        }
      ),
    [runMutation, workItemId]
  );

  const transitionJob = React.useCallback(
    (input: TransitionJobInput) =>
      runMutation(
        "transition",
        withMinimumMutationPendingDurationEffect(
          transitionBrowserJob(workItemId, input)
        ),
        syncChangedJob
      ),
    [runMutation, syncChangedJob, workItemId]
  );

  const reopenJob = React.useCallback(
    () =>
      runMutation(
        "reopen",
        withMinimumMutationPendingDurationEffect(reopenBrowserJob(workItemId)),
        syncChangedJob
      ),
    [runMutation, syncChangedJob, workItemId]
  );

  const patchJob = React.useCallback(
    (input: PatchJobInput) =>
      runMutation(
        "patch",
        withMinimumMutationPendingDurationEffect(
          patchBrowserJob(workItemId, input)
        ),
        syncChangedJob
      ),
    [runMutation, syncChangedJob, workItemId]
  );

  const addJobComment = React.useCallback(
    (input: AddJobCommentInput) =>
      runMutation(
        "addComment",
        withMinimumMutationPendingDurationEffect(
          addBrowserJobComment(workItemId, input)
        ),
        async (comment) => {
          detailRef.current = appendJobComment(detailRef.current, comment);
          dispatch({
            comment,
            type: "append-comment",
          });
          await refreshDetailIfPossible();
        }
      ),
    [refreshDetailIfPossible, runMutation, workItemId]
  );

  const addJobVisit = React.useCallback(
    (input: AddJobVisitInput) =>
      runMutation(
        "addVisit",
        withMinimumMutationPendingDurationEffect(
          addBrowserJobVisit(workItemId, input)
        ),
        async (visit) => {
          detailRef.current = insertJobVisit(detailRef.current, visit);
          dispatch({
            type: "insert-visit",
            visit,
          });
          await refreshDetailIfPossible();
        }
      ),
    [refreshDetailIfPossible, runMutation, workItemId]
  );

  const addJobCostLine = React.useCallback(
    (input: AddJobCostLineInput) =>
      runMutation(
        "addCostLine",
        withMinimumMutationPendingDurationEffect(
          addBrowserJobCostLine(workItemId, input)
        ),
        async (costLine) => {
          detailRef.current = insertJobCostLine(detailRef.current, costLine);
          dispatch({
            costLine,
            type: "insert-cost-line",
          });
          await refreshDetailIfPossible();
        }
      ),
    [refreshDetailIfPossible, runMutation, workItemId]
  );

  const assignJobLabel = React.useCallback(
    (input: AssignJobLabelInput) =>
      runMutation(
        "assignLabel",
        withMinimumMutationPendingDurationEffect(
          assignBrowserJobLabel(workItemId, input)
        ),
        syncChangedJobDetail
      ),
    [runMutation, syncChangedJobDetail, workItemId]
  );

  const createAndAssignJobLabel = React.useCallback(
    (input: CreateLabelInput) =>
      runMutation(
        "createAndAssignLabel",
        withMinimumMutationPendingDurationEffect(
          createBrowserLabel(input).pipe(
            Effect.tap((label) =>
              Effect.sync(() => {
                upsertJobOptionLabel(label);
              })
            ),
            Effect.flatMap((label) =>
              assignBrowserJobLabel(workItemId, { labelId: label.id })
            )
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
        withMinimumMutationPendingDurationEffect(
          removeBrowserJobLabel(workItemId, labelId)
        ),
        syncChangedJobDetail
      ),
    [runMutation, syncChangedJobDetail, workItemId]
  );

  const attachCollaborator = React.useCallback(
    (input: AttachJobCollaboratorInput) =>
      runMutation(
        "attachCollaborator",
        withMinimumMutationPendingDurationEffect(
          attachBrowserJobCollaborator(workItemId, input)
        ),
        (collaborator) => {
          dispatch({
            collaborator,
            type: "upsert-collaborator",
          });
        }
      ),
    [runMutation, workItemId]
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
        withMinimumMutationPendingDurationEffect(
          updateBrowserJobCollaborator(workItemId, collaboratorId, input)
        ),
        (collaborator) => {
          dispatch({
            collaborator,
            type: "upsert-collaborator",
          });
        }
      ),
    [runMutation, workItemId]
  );

  const detachCollaborator = React.useCallback(
    (collaboratorId: JobCollaboratorIdType) =>
      runMutation(
        "detachCollaborator",
        withMinimumMutationPendingDurationEffect(
          detachBrowserJobCollaborator(workItemId, collaboratorId)
        ),
        (collaborator) => {
          dispatch({
            collaboratorId: collaborator.id,
            type: "remove-collaborator",
          });
        }
      ),
    [runMutation, workItemId]
  );

  const value = React.useMemo<JobsDetailStateContextValue>(
    () => ({
      addJobComment,
      addJobCostLine,
      addJobVisit,
      assignJobLabel,
      attachCollaborator,
      collaborators: state.collaborators,
      createAndAssignJobLabel,
      detachCollaborator,
      detail: state.detail,
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
      addJobCostLine,
      addJobVisit,
      assignJobLabel,
      attachCollaborator,
      createAndAssignJobLabel,
      detachCollaborator,
      patchJob,
      refreshCollaborators,
      removeJobLabel,
      reopenJob,
      state.collaborators,
      state.detail,
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
    case "set-detail": {
      return {
        ...state,
        detail: action.detail,
      };
    }

    case "set-detail-job": {
      return {
        ...state,
        detail: updateJobDetailJob(state.detail, action.job),
      };
    }

    case "set-collaborators": {
      return {
        ...state,
        collaborators: action.collaborators,
      };
    }

    case "upsert-collaborator": {
      return {
        ...state,
        collaborators: upsertJobCollaborator(
          state.collaborators,
          action.collaborator
        ),
      };
    }

    case "remove-collaborator": {
      return {
        ...state,
        collaborators: state.collaborators.filter(
          (collaborator) => collaborator.id !== action.collaboratorId
        ),
      };
    }

    case "append-comment": {
      return {
        ...state,
        detail: appendJobComment(state.detail, action.comment),
      };
    }

    case "insert-visit": {
      return {
        ...state,
        detail: insertJobVisit(state.detail, action.visit),
      };
    }

    case "insert-cost-line": {
      return {
        ...state,
        detail: insertJobCostLine(state.detail, action.costLine),
      };
    }

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
      const exhaustiveAction: never = action;
      return exhaustiveAction;
    }
  }
}

async function runTrackedJobsDetailOperation<Success>(
  effect: Effect.Effect<Success, AppApiError>,
  setResult: (result: JobsAsyncResult) => void,
  onSuccess: (value: Success) => Promise<void> | void
): Promise<Exit.Exit<Success, AppApiError>> {
  setResult(waitingJobsDetailAsyncResult);
  const exit = await Effect.runPromiseExit(effect);

  if (Exit.isSuccess(exit)) {
    await onSuccess(exit.value);
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
      path: { workItemId },
    })
  );
}

function transitionBrowserJob(
  workItemId: WorkItemIdType,
  input: TransitionJobInput
) {
  return runBrowserAppApiRequest("JobsBrowser.transitionJob", (client) =>
    client.jobs.transitionJob({
      path: { workItemId },
      payload: input,
    })
  );
}

function reopenBrowserJob(workItemId: WorkItemIdType) {
  return runBrowserAppApiRequest("JobsBrowser.reopenJob", (client) =>
    client.jobs.reopenJob({
      path: { workItemId },
    })
  );
}

function patchBrowserJob(workItemId: WorkItemIdType, input: PatchJobInput) {
  return runBrowserAppApiRequest("JobsBrowser.patchJob", (client) =>
    client.jobs.patchJob({
      path: { workItemId },
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
      path: { workItemId },
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
      path: { workItemId },
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
      path: { workItemId },
      payload: input,
    })
  );
}

function addBrowserJobCostLine(
  workItemId: WorkItemIdType,
  input: AddJobCostLineInput
) {
  return runBrowserAppApiRequest("JobsBrowser.addJobCostLine", (client) =>
    client.jobs.addJobCostLine({
      path: { workItemId },
      payload: input,
    })
  );
}

function listBrowserJobCollaborators(workItemId: WorkItemIdType) {
  return runBrowserAppApiRequest("JobsBrowser.listJobCollaborators", (client) =>
    client.jobs.listJobCollaborators({
      path: { workItemId },
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
        path: { workItemId },
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
        path: { collaboratorId, workItemId },
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
        path: { collaboratorId, workItemId },
      })
  );
}

function removeBrowserJobLabel(
  workItemId: WorkItemIdType,
  labelId: LabelIdType
) {
  return runBrowserAppApiRequest("JobsBrowser.removeJobLabel", (client) =>
    client.jobs.removeJobLabel({
      path: { labelId, workItemId },
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

function insertJobCostLine(
  currentDetail: JobDetailResponse,
  costLine: AddJobCostLineResponse
): JobDetailResponse {
  const currentCostLines = currentDetail.costs?.lines ?? [];
  const costLines = [
    costLine,
    ...currentCostLines.filter((current) => current.id !== costLine.id),
  ].sort((left, right) => {
    const createdAtOrder = right.createdAt.localeCompare(left.createdAt);

    return createdAtOrder === 0
      ? String(right.id).localeCompare(String(left.id))
      : createdAtOrder;
  });

  return {
    ...currentDetail,
    costs: {
      lines: costLines,
      summary: {
        subtotalMinor: costLines.reduce(
          (subtotal, current) => subtotal + current.lineTotalMinor,
          0
        ),
      },
    },
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

function failureFromCause<Failure>(cause: Cause.Cause<Failure>): unknown {
  const failure = Cause.failureOption(cause);

  return Option.isSome(failure) ? failure.value : Cause.squash(cause);
}
