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
import type { CreateLabelInput, Label, LabelIdType } from "@ceird/labels-core";
/* oxlint-disable unicorn/no-array-sort */
import { Atom } from "@effect-atom/atom-react";
import { Effect, Option } from "effect";

import { runBrowserAppApiRequest } from "#/features/api/app-api-client";
import type { AppApiError } from "#/features/api/app-api-errors";

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

export const jobCollaboratorsStateAtomFamily = Atom.family(
  (workItemId: WorkItemIdType) => {
    void workItemId;

    return Atom.make<readonly JobCollaborator[]>([]);
  }
);

export const refreshJobDetailAtomFamily = Atom.family(
  (workItemId: WorkItemIdType) =>
    Atom.fn<AppApiError, JobDetailResponse>((_, get) =>
      getBrowserJobDetail(workItemId).pipe(
        Effect.tap((detail) =>
          Effect.sync(() => {
            get.set(jobDetailStateAtomFamily(workItemId), detail);
          })
        )
      )
    )
);

export const refreshJobCollaboratorsAtomFamily = Atom.family(
  (workItemId: WorkItemIdType) =>
    Atom.fn<AppApiError, readonly JobCollaborator[]>((_, get) =>
      listBrowserJobCollaborators(workItemId).pipe(
        Effect.tap((response) =>
          Effect.sync(() => {
            get.set(
              jobCollaboratorsStateAtomFamily(workItemId),
              response.collaborators
            );
          })
        ),
        Effect.map((response) => response.collaborators)
      )
    )
);

export const transitionJobMutationAtomFamily = Atom.family(
  (workItemId: WorkItemIdType) =>
    Atom.fn<AppApiError, TransitionJobResponse, TransitionJobInput>(
      (input, get) =>
        transitionBrowserJob(workItemId, input).pipe(
          Effect.tap((job) => syncChangedJob(get, workItemId, job))
        )
    )
);

export const reopenJobMutationAtomFamily = Atom.family(
  (workItemId: WorkItemIdType) =>
    Atom.fn<AppApiError, JobDetailResponse["job"]>((_, get) =>
      reopenBrowserJob(workItemId).pipe(
        Effect.tap((job) => syncChangedJob(get, workItemId, job))
      )
    )
);

export const patchJobMutationAtomFamily = Atom.family(
  (workItemId: WorkItemIdType) =>
    Atom.fn<AppApiError, PatchJobResponse, PatchJobInput>((input, get) =>
      patchBrowserJob(workItemId, input).pipe(
        Effect.tap((job) => syncChangedJob(get, workItemId, job))
      )
    )
);

export const addJobCommentMutationAtomFamily = Atom.family(
  (workItemId: WorkItemIdType) =>
    Atom.fn<AppApiError, AddJobCommentResponse, AddJobCommentInput>(
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
    Atom.fn<AppApiError, AddJobVisitResponse, AddJobVisitInput>((input, get) =>
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
    Atom.fn<AppApiError, JobDetailResponse, AssignJobLabelInput>((input, get) =>
      assignBrowserJobLabel(workItemId, input).pipe(
        Effect.tap((detail) =>
          Effect.sync(() => syncChangedJobDetail(get, workItemId, detail))
        )
      )
    )
);

export const addJobCostLineMutationAtomFamily = Atom.family(
  (workItemId: WorkItemIdType) =>
    Atom.fn<AppApiError, AddJobCostLineResponse, AddJobCostLineInput>(
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

export const attachJobCollaboratorMutationAtomFamily = Atom.family(
  (workItemId: WorkItemIdType) =>
    Atom.fn<AppApiError, JobCollaborator, AttachJobCollaboratorInput>(
      (input, get) =>
        attachBrowserJobCollaborator(workItemId, input).pipe(
          Effect.tap((collaborator) =>
            Effect.sync(() =>
              upsertJobCollaborator(get, workItemId, collaborator)
            )
          )
        )
    )
);

export const updateJobCollaboratorMutationAtomFamily = Atom.family(
  (workItemId: WorkItemIdType) =>
    Atom.fn<
      AppApiError,
      JobCollaborator,
      {
        readonly collaboratorId: JobCollaboratorIdType;
        readonly input: UpdateJobCollaboratorInput;
      }
    >(({ collaboratorId, input }, get) =>
      updateBrowserJobCollaborator(workItemId, collaboratorId, input).pipe(
        Effect.tap((collaborator) =>
          Effect.sync(() =>
            upsertJobCollaborator(get, workItemId, collaborator)
          )
        )
      )
    )
);

export const detachJobCollaboratorMutationAtomFamily = Atom.family(
  (workItemId: WorkItemIdType) =>
    Atom.fn<AppApiError, JobCollaborator, JobCollaboratorIdType>(
      (collaboratorId, get) =>
        detachBrowserJobCollaborator(workItemId, collaboratorId).pipe(
          Effect.tap((collaborator) =>
            Effect.sync(() => {
              const current = get(jobCollaboratorsStateAtomFamily(workItemId));

              get.set(
                jobCollaboratorsStateAtomFamily(workItemId),
                current.filter((item) => item.id !== collaborator.id)
              );
            })
          )
        )
    )
);

export const createAndAssignJobLabelMutationAtomFamily = Atom.family(
  (workItemId: WorkItemIdType) =>
    Atom.fn<AppApiError, JobDetailResponse, CreateLabelInput>((input, get) =>
      createBrowserLabel(input).pipe(
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
    Atom.fn<AppApiError, JobDetailResponse, LabelIdType>((labelId, get) =>
      removeBrowserJobLabel(workItemId, labelId).pipe(
        Effect.tap((detail) =>
          Effect.sync(() => syncChangedJobDetail(get, workItemId, detail))
        )
      )
    )
);

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

function createBrowserLabel(input: CreateLabelInput) {
  return runBrowserAppApiRequest("LabelsBrowser.createLabel", (client) =>
    client.labels.createLabel({
      payload: input,
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

  const { contact, site, ...detailWithoutContactAndSite } = currentDetail;
  const matchingContact = contact?.id === job.contactId ? { contact } : {};
  const matchingSite = site?.id === job.siteId ? { site } : {};

  get.set(jobDetailStateAtomFamily(workItemId), {
    ...detailWithoutContactAndSite,
    ...matchingContact,
    ...matchingSite,
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

function upsertJobOptionLabel(get: Atom.FnContext, label: Label) {
  const currentOptionsState = get(jobsOptionsStateAtom);
  const labels = [
    label,
    ...currentOptionsState.data.labels.filter(
      (current) => current.id !== label.id
    ),
  ].sort(compareLabels);

  get.set(jobsOptionsStateAtom, {
    data: {
      ...currentOptionsState.data,
      labels,
    },
    organizationId: currentOptionsState.organizationId,
  });
}

function upsertJobCollaborator(
  get: Atom.FnContext,
  workItemId: WorkItemIdType,
  collaborator: JobCollaborator
) {
  const current = get(jobCollaboratorsStateAtomFamily(workItemId));

  get.set(
    jobCollaboratorsStateAtomFamily(workItemId),
    [
      collaborator,
      ...current.filter((item) => item.id !== collaborator.id),
    ].sort((left, right) => left.roleLabel.localeCompare(right.roleLabel))
  );
}

function compareLabels(left: Label, right: Label) {
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
