/* oxlint-disable unicorn/no-array-sort */
"use client";

import { Atom } from "@effect-atom/atom-react";
import type {
  AddJobCostLineInput,
  AddJobCostLineResponse,
  AddJobCommentInput,
  AddJobCommentResponse,
  AddJobVisitInput,
  AddJobVisitResponse,
  AssignJobLabelInput,
  CreateJobLabelInput,
  Job,
  JobDetailResponse,
  JobLabel,
  JobLabelIdType,
  PatchJobInput,
  PatchJobResponse,
  TransitionJobInput,
  TransitionJobResponse,
  WorkItemIdType,
} from "@task-tracker/jobs-core";
import { Effect, Option } from "effect";

import { runBrowserJobsRequest } from "./jobs-client";
import type { AppJobsError } from "./jobs-errors";
import {
  jobsListStateAtom,
  jobsOptionsStateAtom,
  upsertJobListItem,
} from "./jobs-state";

export const jobDetailStateAtomFamily = Atom.family(
  (workItemId: WorkItemIdType) => {
    void workItemId;

    return Atom.make<JobDetailResponse | null>(null);
  }
);

export const refreshJobDetailAtomFamily = Atom.family(
  (workItemId: WorkItemIdType) =>
    Atom.fn<AppJobsError, JobDetailResponse>((_, get) =>
      getBrowserJobDetail(workItemId).pipe(
        Effect.tap((detail) =>
          Effect.sync(() => {
            get.set(jobDetailStateAtomFamily(workItemId), detail);
          })
        )
      )
    )
);

export const transitionJobMutationAtomFamily = Atom.family(
  (workItemId: WorkItemIdType) =>
    Atom.fn<AppJobsError, TransitionJobResponse, TransitionJobInput>(
      (input, get) =>
        transitionBrowserJob(workItemId, input).pipe(
          Effect.tap((job) => syncChangedJob(get, workItemId, job))
        )
    )
);

export const reopenJobMutationAtomFamily = Atom.family(
  (workItemId: WorkItemIdType) =>
    Atom.fn<AppJobsError, JobDetailResponse["job"]>((_, get) =>
      reopenBrowserJob(workItemId).pipe(
        Effect.tap((job) => syncChangedJob(get, workItemId, job))
      )
    )
);

export const patchJobMutationAtomFamily = Atom.family(
  (workItemId: WorkItemIdType) =>
    Atom.fn<AppJobsError, PatchJobResponse, PatchJobInput>((input, get) =>
      patchBrowserJob(workItemId, input).pipe(
        Effect.tap((job) => syncChangedJob(get, workItemId, job))
      )
    )
);

export const addJobCommentMutationAtomFamily = Atom.family(
  (workItemId: WorkItemIdType) =>
    Atom.fn<AppJobsError, AddJobCommentResponse, AddJobCommentInput>(
      (input, get) =>
        addBrowserJobComment(workItemId, input).pipe(
          Effect.tap((comment) =>
            Effect.gen(function* () {
              yield* Effect.sync(() => {
                appendJobComment(get, workItemId, comment);
              });

              yield* refreshJobDetailIfPossible(get, workItemId);
            })
          )
        )
    )
);

export const addJobVisitMutationAtomFamily = Atom.family(
  (workItemId: WorkItemIdType) =>
    Atom.fn<AppJobsError, AddJobVisitResponse, AddJobVisitInput>((input, get) =>
      addBrowserJobVisit(workItemId, input).pipe(
        Effect.tap((visit) =>
          Effect.gen(function* () {
            yield* Effect.sync(() => {
              insertJobVisit(get, workItemId, visit);
            });

            yield* refreshJobDetailIfPossible(get, workItemId);
          })
        )
      )
    )
);

export const assignJobLabelMutationAtomFamily = Atom.family(
  (workItemId: WorkItemIdType) =>
    Atom.fn<AppJobsError, JobDetailResponse, AssignJobLabelInput>(
      (input, get) =>
        assignBrowserJobLabel(workItemId, input).pipe(
          Effect.tap((detail) =>
            Effect.sync(() => syncChangedJobDetail(get, workItemId, detail))
          )
        )
    )
);

export const addJobCostLineMutationAtomFamily = Atom.family(
  (workItemId: WorkItemIdType) =>
    Atom.fn<AppJobsError, AddJobCostLineResponse, AddJobCostLineInput>(
      (input, get) =>
        addBrowserJobCostLine(workItemId, input).pipe(
          Effect.tap((costLine) =>
            Effect.gen(function* () {
              yield* Effect.sync(() => {
                insertJobCostLine(get, workItemId, costLine);
              });

              yield* refreshJobDetailIfPossible(get, workItemId);
            })
          )
        )
    )
);

export const createAndAssignJobLabelMutationAtomFamily = Atom.family(
  (workItemId: WorkItemIdType) =>
    Atom.fn<AppJobsError, JobDetailResponse, CreateJobLabelInput>(
      (input, get) =>
        createBrowserJobLabel(input).pipe(
          Effect.tap((label) =>
            Effect.sync(() => upsertJobOptionLabel(get, label))
          ),
          Effect.flatMap((label) =>
            assignBrowserJobLabel(workItemId, { labelId: label.id })
          ),
          Effect.tap((detail) =>
            Effect.sync(() => syncChangedJobDetail(get, workItemId, detail))
          )
        )
    )
);

export const removeJobLabelMutationAtomFamily = Atom.family(
  (workItemId: WorkItemIdType) =>
    Atom.fn<AppJobsError, JobDetailResponse, JobLabelIdType>((labelId, get) =>
      removeBrowserJobLabel(workItemId, labelId).pipe(
        Effect.tap((detail) =>
          Effect.sync(() => syncChangedJobDetail(get, workItemId, detail))
        )
      )
    )
);

function getBrowserJobDetail(workItemId: WorkItemIdType) {
  return runBrowserJobsRequest("JobsBrowser.getJobDetail", (client) =>
    client.jobs.getJobDetail({
      path: { workItemId },
    })
  );
}

function transitionBrowserJob(
  workItemId: WorkItemIdType,
  input: TransitionJobInput
) {
  return runBrowserJobsRequest("JobsBrowser.transitionJob", (client) =>
    client.jobs.transitionJob({
      path: { workItemId },
      payload: input,
    })
  );
}

function reopenBrowserJob(workItemId: WorkItemIdType) {
  return runBrowserJobsRequest("JobsBrowser.reopenJob", (client) =>
    client.jobs.reopenJob({
      path: { workItemId },
    })
  );
}

function patchBrowserJob(workItemId: WorkItemIdType, input: PatchJobInput) {
  return runBrowserJobsRequest("JobsBrowser.patchJob", (client) =>
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
  return runBrowserJobsRequest("JobsBrowser.addJobComment", (client) =>
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
  return runBrowserJobsRequest("JobsBrowser.addJobVisit", (client) =>
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
  return runBrowserJobsRequest("JobsBrowser.assignJobLabel", (client) =>
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
  return runBrowserJobsRequest("JobsBrowser.addJobCostLine", (client) =>
    client.jobs.addJobCostLine({
      path: { workItemId },
      payload: input,
    })
  );
}

function createBrowserJobLabel(input: CreateJobLabelInput) {
  return runBrowserJobsRequest("JobsBrowser.createJobLabel", (client) =>
    client.jobs.createJobLabel({
      payload: input,
    })
  );
}

function removeBrowserJobLabel(
  workItemId: WorkItemIdType,
  labelId: JobLabelIdType
) {
  return runBrowserJobsRequest("JobsBrowser.removeJobLabel", (client) =>
    client.jobs.removeJobLabel({
      path: { labelId, workItemId },
    })
  );
}

function syncChangedJob(
  get: Atom.FnContext,
  workItemId: WorkItemIdType,
  job: Job
) {
  return Effect.gen(function* () {
    yield* Effect.sync(() => {
      updateJobDetailJob(get, workItemId, job);
      updateJobsListJob(get, job);
    });

    yield* refreshJobDetailIfPossible(get, workItemId);
  });
}

function updateJobDetailJob(
  get: Atom.FnContext,
  workItemId: WorkItemIdType,
  job: Job
) {
  const currentDetail = get(jobDetailStateAtomFamily(workItemId));

  if (currentDetail === null) {
    return;
  }

  const { contact, ...detailWithoutContact } = currentDetail;
  const matchingContact = contact?.id === job.contactId ? { contact } : {};

  get.set(jobDetailStateAtomFamily(workItemId), {
    ...detailWithoutContact,
    ...matchingContact,
    job,
  });
}

function updateJobsListJob(get: Atom.FnContext, job: Job) {
  const currentListState = get(jobsListStateAtom);

  get.set(jobsListStateAtom, {
    items: upsertJobListItem(currentListState.items, job),
    nextCursor: currentListState.nextCursor,
    organizationId: currentListState.organizationId,
  });
}

function syncChangedJobDetail(
  get: Atom.FnContext,
  workItemId: WorkItemIdType,
  detail: JobDetailResponse
) {
  get.set(jobDetailStateAtomFamily(workItemId), detail);
  updateJobsListJob(get, detail.job);
}

function upsertJobOptionLabel(get: Atom.FnContext, label: JobLabel) {
  const currentOptionsState = get(jobsOptionsStateAtom);
  const labels = [
    label,
    ...currentOptionsState.data.labels.filter(
      (current) => current.id !== label.id
    ),
  ].sort(compareJobLabels);

  get.set(jobsOptionsStateAtom, {
    data: {
      ...currentOptionsState.data,
      labels,
    },
    organizationId: currentOptionsState.organizationId,
  });
}

function compareJobLabels(left: JobLabel, right: JobLabel) {
  const nameOrder = left.name.localeCompare(right.name);

  return nameOrder === 0 ? left.id.localeCompare(right.id) : nameOrder;
}

function refreshJobDetailIfPossible(
  get: Atom.FnContext,
  workItemId: WorkItemIdType
) {
  return getBrowserJobDetail(workItemId).pipe(
    Effect.tapError((error) =>
      Effect.logWarning("Job detail refresh failed; keeping optimistic state", {
        error: error.message,
        workItemId,
      })
    ),
    Effect.option,
    Effect.tap((detail) =>
      Option.match(detail, {
        onNone: () => Effect.void,
        onSome: (freshDetail) =>
          Effect.sync(() => {
            get.set(jobDetailStateAtomFamily(workItemId), freshDetail);
          }),
      })
    )
  );
}

function appendJobComment(
  get: Atom.FnContext,
  workItemId: WorkItemIdType,
  comment: AddJobCommentResponse
) {
  const currentDetail = get(jobDetailStateAtomFamily(workItemId));

  if (currentDetail === null) {
    return;
  }

  get.set(jobDetailStateAtomFamily(workItemId), {
    ...currentDetail,
    comments: [
      ...currentDetail.comments.filter((current) => current.id !== comment.id),
      comment,
    ],
  });
}

function insertJobVisit(
  get: Atom.FnContext,
  workItemId: WorkItemIdType,
  visit: AddJobVisitResponse
) {
  const currentDetail = get(jobDetailStateAtomFamily(workItemId));

  if (currentDetail === null) {
    return;
  }

  get.set(jobDetailStateAtomFamily(workItemId), {
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
  });
}

function insertJobCostLine(
  get: Atom.FnContext,
  workItemId: WorkItemIdType,
  costLine: AddJobCostLineResponse
) {
  const currentDetail = get(jobDetailStateAtomFamily(workItemId));

  if (currentDetail === null) {
    return;
  }

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

  get.set(jobDetailStateAtomFamily(workItemId), {
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
  });
}
