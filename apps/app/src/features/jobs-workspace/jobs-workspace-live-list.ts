"use client";
import type { Label } from "@ceird/labels-core";
import * as React from "react";

import type { DataPlaneCollectionHealthSnapshot } from "#/data-plane/collection-health";
import { useDataPlaneLiveQuery } from "#/data-plane/live-query";
import { useDataPlaneSession } from "#/data-plane/session";
import {
  deriveJobsWorkspaceVisibleRows,
  getOrCreateJobsWorkspaceReadModelState,
} from "#/features/jobs/jobs-data-plane";
import type {
  JobContactSummaryRow,
  JobLabelAssignmentRow,
  JobsWorkspaceJobRow,
  JobsWorkspaceSort,
  JobsWorkspaceStatusFilter,
  JobsWorkspaceVisibleRow,
  JobSiteSummaryRow,
} from "#/features/jobs/jobs-data-plane";

export interface JobsWorkspaceLiveListOptions {
  readonly labelId?: string | undefined;
  readonly query?: string | undefined;
  readonly sort: JobsWorkspaceSort;
  readonly status: JobsWorkspaceStatusFilter;
}

export interface JobsWorkspaceLiveListState {
  readonly allRowsCount: number;
  readonly availableLabels: readonly Label[];
  readonly health: DataPlaneCollectionHealthSnapshot;
  readonly isCollectionGraphAvailable: boolean;
  readonly isLoading: boolean;
  readonly isReady: boolean;
  readonly rows: readonly JobsWorkspaceVisibleRow[];
}

export function useJobsWorkspaceLiveList(
  options: JobsWorkspaceLiveListOptions
): JobsWorkspaceLiveListState {
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
    readModel.health.subscribe,
    () => readModel.health.current,
    () => readModel.health.current
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

  const jobs = readLiveQueryData<JobsWorkspaceJobRow>(jobsQuery.data);
  const labels = readLiveQueryData<Label>(labelsQuery.data);
  const labelAssignments = readLiveQueryData<JobLabelAssignmentRow>(
    assignmentsQuery.data
  );
  const sites = readLiveQueryData<JobSiteSummaryRow>(sitesQuery.data);
  const contacts = readLiveQueryData<JobContactSummaryRow>(contactsQuery.data);
  const isCollectionGraphAvailable = isJobsWorkspaceReadModelAvailable(
    readModel,
    health
  );
  const queryStates = [
    jobsQuery,
    labelsQuery,
    assignmentsQuery,
    sitesQuery,
    contactsQuery,
  ] as const;
  const isLoading = isJobsWorkspaceLiveListLoading(health, queryStates);
  const isReady = isJobsWorkspaceLiveListReady({
    health,
    isCollectionGraphAvailable,
    queryStates,
  });
  const rows = isReady
    ? deriveJobsWorkspaceVisibleRows({
        contacts,
        jobs,
        labelAssignments,
        labels,
        options,
        sites,
      })
    : [];
  const availableLabels = isReady
    ? labels.toSorted((left, right) => left.name.localeCompare(right.name))
    : [];

  return {
    allRowsCount: isReady ? jobs.length : 0,
    availableLabels,
    health,
    isCollectionGraphAvailable,
    isLoading,
    isReady,
    rows,
  };
}

function readLiveQueryData<Item>(
  data: readonly Item[] | undefined
): readonly Item[] {
  return data ?? [];
}

function isJobsWorkspaceReadModelAvailable(
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
    readModel.contactSummaries !== undefined
  );
}

function isJobsWorkspaceLiveListLoading(
  health: DataPlaneCollectionHealthSnapshot,
  queryStates: readonly { readonly isLoading: boolean }[]
): boolean {
  return (
    health.status === "connecting" ||
    queryStates.some((queryState) => queryState.isLoading)
  );
}

function isJobsWorkspaceLiveListReady({
  health,
  isCollectionGraphAvailable,
  queryStates,
}: {
  readonly health: DataPlaneCollectionHealthSnapshot;
  readonly isCollectionGraphAvailable: boolean;
  readonly queryStates: readonly { readonly isReady: boolean }[];
}): boolean {
  return (
    health.status === "ready" &&
    isCollectionGraphAvailable &&
    queryStates.every((queryState) => queryState.isReady)
  );
}
