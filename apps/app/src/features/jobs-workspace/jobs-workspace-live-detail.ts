"use client";
import type { ProductActor } from "@ceird/identity-core";
import type { JobCollaborator, WorkItemIdType } from "@ceird/jobs-core";
import type { Label } from "@ceird/labels-core";
import * as React from "react";

import type { DataPlaneCollectionHealthSnapshot } from "#/data-plane/collection-health";
import { useDataPlaneLiveQuery } from "#/data-plane/live-query";
import { useDataPlaneSession } from "#/data-plane/session";
import {
  deriveJobsWorkspaceDetail,
  getOrCreateJobsWorkspaceReadModelState,
} from "#/features/jobs/jobs-data-plane";
import type {
  JobCommentEdgeRow,
  JobContactSummaryRow,
  JobLabelAssignmentRow,
  JobSiteSummaryRow,
  JobsWorkspaceActivityRow,
  JobsWorkspaceCommentRow,
  JobsWorkspaceDetailReadModel,
  JobsWorkspaceJobRow,
  JobsWorkspaceVisitRow,
} from "#/features/jobs/jobs-data-plane";

export interface JobsWorkspaceLiveDetailState {
  readonly detail?: JobsWorkspaceDetailReadModel | undefined;
  readonly health: DataPlaneCollectionHealthSnapshot;
  readonly isCollectionGraphAvailable: boolean;
  readonly isLoading: boolean;
  readonly isNotFound: boolean;
  readonly isReady: boolean;
}

export function useJobsWorkspaceLiveDetail(
  selectedJobId: WorkItemIdType | string | undefined
): JobsWorkspaceLiveDetailState {
  const session = useDataPlaneSession();
  const readModel = React.useMemo(
    () =>
      getOrCreateJobsWorkspaceReadModelState({
        scope: session.scope,
        session,
      }),
    [session]
  );
  const health = React.useSyncExternalStore(
    readModel.detailHealth.subscribe,
    () => readModel.detailHealth.current,
    () => readModel.detailHealth.current
  );
  const jobsQuery = useDataPlaneLiveQuery(
    (query) =>
      readModel.jobs
        ? query
            .from({ jobs: readModel.jobs })
            .orderBy(({ jobs }) => jobs.updatedAt, "desc")
            .select(({ jobs }) => jobs)
        : undefined,
    [readModel.jobs]
  );
  const labelsQuery = useDataPlaneLiveQuery(
    () => readModel.labels ?? undefined,
    [readModel.labels]
  );
  const assignmentsQuery = useDataPlaneLiveQuery(
    () => readModel.jobLabelAssignments ?? undefined,
    [readModel.jobLabelAssignments]
  );
  const sitesQuery = useDataPlaneLiveQuery(
    () => readModel.siteSummaries ?? undefined,
    [readModel.siteSummaries]
  );
  const contactsQuery = useDataPlaneLiveQuery(
    () => readModel.contactSummaries ?? undefined,
    [readModel.contactSummaries]
  );
  const collaboratorsQuery = useDataPlaneLiveQuery(
    () => readModel.collaborators ?? undefined,
    [readModel.collaborators]
  );
  const actorsQuery = useDataPlaneLiveQuery(
    () => readModel.actors ?? undefined,
    [readModel.actors]
  );
  const activityQuery = useDataPlaneLiveQuery(
    () => readModel.activity ?? undefined,
    [readModel.activity]
  );
  const visitsQuery = useDataPlaneLiveQuery(
    () => readModel.visits ?? undefined,
    [readModel.visits]
  );
  const jobCommentsQuery = useDataPlaneLiveQuery(
    () => readModel.jobComments ?? undefined,
    [readModel.jobComments]
  );
  const commentsQuery = useDataPlaneLiveQuery(
    () => readModel.comments ?? undefined,
    [readModel.comments]
  );
  const queryStates = [
    jobsQuery,
    labelsQuery,
    assignmentsQuery,
    sitesQuery,
    contactsQuery,
    collaboratorsQuery,
    actorsQuery,
    activityQuery,
    visitsQuery,
    jobCommentsQuery,
    commentsQuery,
  ] as const;
  const isCollectionGraphAvailable = isJobsWorkspaceDetailGraphAvailable(
    readModel,
    health
  );
  const isLoading =
    health.status === "connecting" ||
    queryStates.some((queryState) => queryState.isLoading);
  const isReady =
    selectedJobId !== undefined &&
    health.status === "ready" &&
    isCollectionGraphAvailable &&
    queryStates.every((queryState) => queryState.isReady);
  const detail = isReady
    ? deriveJobsWorkspaceDetail({
        activity: readLiveQueryData<JobsWorkspaceActivityRow>(
          activityQuery.data
        ),
        actors: readLiveQueryData<ProductActor>(actorsQuery.data),
        collaborators: readLiveQueryData<JobCollaborator>(
          collaboratorsQuery.data
        ),
        comments: readLiveQueryData<JobsWorkspaceCommentRow>(
          commentsQuery.data
        ),
        contacts: readLiveQueryData<JobContactSummaryRow>(contactsQuery.data),
        jobComments: readLiveQueryData<JobCommentEdgeRow>(
          jobCommentsQuery.data
        ),
        jobs: readLiveQueryData<JobsWorkspaceJobRow>(jobsQuery.data),
        labelAssignments: readLiveQueryData<JobLabelAssignmentRow>(
          assignmentsQuery.data
        ),
        labels: readLiveQueryData<Label>(labelsQuery.data),
        selectedJobId,
        sites: readLiveQueryData<JobSiteSummaryRow>(sitesQuery.data),
        visits: readLiveQueryData<JobsWorkspaceVisitRow>(visitsQuery.data),
      })
    : undefined;

  return {
    detail,
    health,
    isCollectionGraphAvailable,
    isLoading,
    isNotFound: selectedJobId !== undefined && isReady && detail === undefined,
    isReady,
  };
}

function readLiveQueryData<Item>(
  data: readonly Item[] | undefined
): readonly Item[] {
  return data ?? [];
}

function isJobsWorkspaceDetailGraphAvailable(
  readModel: ReturnType<typeof getOrCreateJobsWorkspaceReadModelState>,
  health: DataPlaneCollectionHealthSnapshot
): boolean {
  return (
    health.status !== "disabled" &&
    health.status !== "fallback-active" &&
    health.status !== "unavailable" &&
    readModel.jobs !== undefined &&
    readModel.labels !== undefined &&
    readModel.jobLabelAssignments !== undefined &&
    readModel.siteSummaries !== undefined &&
    readModel.contactSummaries !== undefined &&
    readModel.collaborators !== undefined &&
    readModel.actors !== undefined &&
    readModel.activity !== undefined &&
    readModel.visits !== undefined &&
    readModel.jobComments !== undefined &&
    readModel.comments !== undefined
  );
}
