/* oxlint-disable unicorn/no-array-sort */
"use client";

import { Atom } from "@effect-atom/atom-react";
import type {
  AddJobCommentInput,
  AddJobCommentResponse,
  AddJobVisitInput,
  AddJobVisitResponse,
  Job,
  JobDetailResponse,
  PatchJobInput,
  PatchJobResponse,
  TransitionJobInput,
  TransitionJobResponse,
  WorkItemIdType,
} from "@task-tracker/jobs-core";
import { Effect } from "effect";

import { makeBrowserJobsClient, provideBrowserJobsHttp } from "./jobs-client";
import type { AppJobsError } from "./jobs-errors";
import { normalizeJobsError } from "./jobs-errors";
import { jobsListStateAtom, upsertJobListItem } from "./jobs-state";

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
          Effect.tap((job) =>
            Effect.gen(function* () {
              yield* Effect.sync(() => {
                updateJobDetailJob(get, workItemId, job);
                updateJobsListJob(get, job);
              });

              yield* refreshJobDetailIfPossible(get, workItemId);
            })
          )
        )
    )
);

export const reopenJobMutationAtomFamily = Atom.family(
  (workItemId: WorkItemIdType) =>
    Atom.fn<AppJobsError, JobDetailResponse["job"]>((_, get) =>
      reopenBrowserJob(workItemId).pipe(
        Effect.tap((job) =>
          Effect.gen(function* () {
            yield* Effect.sync(() => {
              updateJobDetailJob(get, workItemId, job);
              updateJobsListJob(get, job);
            });

            yield* refreshJobDetailIfPossible(get, workItemId);
          })
        )
      )
    )
);

export const patchJobMutationAtomFamily = Atom.family(
  (workItemId: WorkItemIdType) =>
    Atom.fn<AppJobsError, PatchJobResponse, PatchJobInput>((input, get) =>
      patchBrowserJob(workItemId, input).pipe(
        Effect.tap((job) =>
          Effect.gen(function* () {
            yield* Effect.sync(() => {
              updateJobDetailJob(get, workItemId, job);
              updateJobsListJob(get, job);
            });

            yield* refreshJobDetailIfPossible(get, workItemId);
          })
        )
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

function getBrowserJobDetail(workItemId: WorkItemIdType) {
  return Effect.gen(function* () {
    const client = yield* makeBrowserJobsClient();

    return yield* client.jobs.getJobDetail({
      path: { workItemId },
    });
  }).pipe(Effect.mapError(normalizeJobsError), provideBrowserJobsHttp);
}

function transitionBrowserJob(
  workItemId: WorkItemIdType,
  input: TransitionJobInput
) {
  return Effect.gen(function* () {
    const client = yield* makeBrowserJobsClient();

    return yield* client.jobs.transitionJob({
      path: { workItemId },
      payload: input,
    });
  }).pipe(Effect.mapError(normalizeJobsError), provideBrowserJobsHttp);
}

function reopenBrowserJob(workItemId: WorkItemIdType) {
  return Effect.gen(function* () {
    const client = yield* makeBrowserJobsClient();

    return yield* client.jobs.reopenJob({
      path: { workItemId },
    });
  }).pipe(Effect.mapError(normalizeJobsError), provideBrowserJobsHttp);
}

function patchBrowserJob(workItemId: WorkItemIdType, input: PatchJobInput) {
  return Effect.gen(function* () {
    const client = yield* makeBrowserJobsClient();

    return yield* client.jobs.patchJob({
      path: { workItemId },
      payload: input,
    });
  }).pipe(Effect.mapError(normalizeJobsError), provideBrowserJobsHttp);
}

function addBrowserJobComment(
  workItemId: WorkItemIdType,
  input: AddJobCommentInput
) {
  return Effect.gen(function* () {
    const client = yield* makeBrowserJobsClient();

    return yield* client.jobs.addJobComment({
      path: { workItemId },
      payload: input,
    });
  }).pipe(Effect.mapError(normalizeJobsError), provideBrowserJobsHttp);
}

function addBrowserJobVisit(
  workItemId: WorkItemIdType,
  input: AddJobVisitInput
) {
  return Effect.gen(function* () {
    const client = yield* makeBrowserJobsClient();

    return yield* client.jobs.addJobVisit({
      path: { workItemId },
      payload: input,
    });
  }).pipe(Effect.mapError(normalizeJobsError), provideBrowserJobsHttp);
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

  get.set(jobDetailStateAtomFamily(workItemId), {
    ...currentDetail,
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

function refreshJobDetailIfPossible(
  get: Atom.FnContext,
  workItemId: WorkItemIdType
) {
  return getBrowserJobDetail(workItemId).pipe(
    Effect.either,
    Effect.tap((detailResult) =>
      Effect.sync(() => {
        if (detailResult._tag === "Right") {
          get.set(jobDetailStateAtomFamily(workItemId), detailResult.right);
        }
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
