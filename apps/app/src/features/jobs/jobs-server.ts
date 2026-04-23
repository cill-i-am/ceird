import { createIsomorphicFn, createServerFn } from "@tanstack/react-start";
import type {
  JobDetailResponse,
  JobListQuery,
  JobListResponse,
  JobOptionsResponse,
  WorkItemIdType,
} from "@task-tracker/jobs-core";

import {
  listAllCurrentServerJobsDirect,
  getCurrentServerJobDetailDirect,
  getCurrentServerJobOptionsDirect,
  listCurrentServerJobsDirect,
} from "./jobs-server.server";

const listAllCurrentServerJobsServerFn = createServerFn({ method: "GET" })
  .inputValidator((query: JobListQuery = {}) => query)
  .handler(
    ({ data: query }): Promise<JobListResponse> =>
      listAllCurrentServerJobsDirect(query)
  );

const listCurrentServerJobsServerFn = createServerFn({ method: "GET" })
  .inputValidator((query: JobListQuery = {}) => query)
  .handler(
    ({ data: query }): Promise<JobListResponse> =>
      listCurrentServerJobsDirect(query)
  );

const getCurrentServerJobDetailServerFn = createServerFn({ method: "GET" })
  .inputValidator((workItemId: WorkItemIdType) => workItemId)
  .handler(
    ({ data: workItemId }): Promise<JobDetailResponse> =>
      getCurrentServerJobDetailDirect(workItemId as WorkItemIdType)
  );

const getCurrentServerJobOptionsServerFn = createServerFn({
  method: "GET",
}).handler(
  (): Promise<JobOptionsResponse> => getCurrentServerJobOptionsDirect()
);

const listAllCurrentServerJobsIsomorphic = createIsomorphicFn()
  .server((query: JobListQuery = {}) => listAllCurrentServerJobsDirect(query))
  .client((query: JobListQuery = {}) =>
    listAllCurrentServerJobsServerFn({ data: query })
  );

const listCurrentServerJobsIsomorphic = createIsomorphicFn()
  .server((query: JobListQuery = {}) => listCurrentServerJobsDirect(query))
  .client((query: JobListQuery = {}) =>
    listCurrentServerJobsServerFn({ data: query })
  );

const getCurrentServerJobDetailIsomorphic = createIsomorphicFn()
  .server((workItemId: WorkItemIdType) =>
    getCurrentServerJobDetailDirect(workItemId as WorkItemIdType)
  )
  .client((workItemId: WorkItemIdType) =>
    getCurrentServerJobDetailServerFn({ data: workItemId as WorkItemIdType })
  );

const getCurrentServerJobOptionsIsomorphic = createIsomorphicFn()
  .server(() => getCurrentServerJobOptionsDirect())
  .client(() => getCurrentServerJobOptionsServerFn());

export function listCurrentServerJobs(
  query: JobListQuery = {}
): Promise<JobListResponse> {
  return listCurrentServerJobsIsomorphic(query);
}

export function listAllCurrentServerJobs(
  query: JobListQuery = {}
): Promise<JobListResponse> {
  return listAllCurrentServerJobsIsomorphic(query);
}

export function getCurrentServerJobDetail(
  workItemId: WorkItemIdType
): Promise<JobDetailResponse> {
  return getCurrentServerJobDetailIsomorphic(workItemId);
}

export function getCurrentServerJobOptions(): Promise<JobOptionsResponse> {
  return getCurrentServerJobOptionsIsomorphic();
}
