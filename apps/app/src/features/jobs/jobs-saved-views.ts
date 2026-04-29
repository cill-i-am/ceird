import type { UserIdType } from "@task-tracker/jobs-core";

import {
  defaultJobsListFilters,
  isJobsAssigneeFilterEqual,
} from "./jobs-state";
import type { JobsListFilters } from "./jobs-state";

export const JOB_SAVED_VIEW_IDS = [
  "active",
  "assigned-to-me",
  "completed",
  "blocked",
  "high-priority",
  "unassigned",
] as const;

export type JobSavedViewId = (typeof JOB_SAVED_VIEW_IDS)[number];

export interface JobSavedView {
  readonly filters: JobsListFilters;
  readonly id: JobSavedViewId;
  readonly label: string;
}

const JOBS_LIST_FILTER_EQUALITY_FIELDS = {
  assigneeId: true,
  coordinatorId: true,
  labelId: true,
  priority: true,
  query: true,
  serviceAreaId: true,
  siteId: true,
  status: true,
} satisfies Record<keyof JobsListFilters, true>;

const JOBS_LIST_FILTER_EQUALITY_KEYS = Object.keys(
  JOBS_LIST_FILTER_EQUALITY_FIELDS
) as readonly (keyof JobsListFilters)[];

export function buildJobSavedViews(
  viewerUserId: UserIdType
): readonly JobSavedView[] {
  return [
    {
      filters: defaultJobsListFilters,
      id: "active",
      label: "Active jobs",
    },
    {
      filters: {
        ...defaultJobsListFilters,
        assigneeId: { kind: "user", userId: viewerUserId },
      },
      id: "assigned-to-me",
      label: "Assigned to me",
    },
    {
      filters: {
        ...defaultJobsListFilters,
        status: "completed",
      },
      id: "completed",
      label: "Completed",
    },
    {
      filters: {
        ...defaultJobsListFilters,
        status: "blocked",
      },
      id: "blocked",
      label: "Blocked",
    },
    {
      filters: {
        ...defaultJobsListFilters,
        priority: "high",
      },
      id: "high-priority",
      label: "High priority",
    },
    {
      filters: {
        ...defaultJobsListFilters,
        assigneeId: { kind: "unassigned" },
      },
      id: "unassigned",
      label: "Unassigned",
    },
  ];
}

export function findMatchingJobSavedView(
  filters: JobsListFilters,
  savedViews: readonly JobSavedView[]
): JobSavedView | undefined {
  return savedViews.find((view) =>
    areJobsListFiltersEqual(filters, view.filters)
  );
}

export function areJobsListFiltersEqual(
  left: JobsListFilters,
  right: JobsListFilters
): boolean {
  return JOBS_LIST_FILTER_EQUALITY_KEYS.every((key) => {
    if (key === "assigneeId") {
      return isJobsAssigneeFilterEqual(left.assigneeId, right.assigneeId);
    }

    if (key === "query") {
      return left.query.trim() === right.query.trim();
    }

    return left[key] === right[key];
  });
}
