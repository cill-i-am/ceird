import type {
  JobDetailResponse,
  JobExternalMemberOptionsResponse,
  JobListItem,
  JobListQuery,
  JobListResponse,
  JobMemberOptionsResponse,
  JobOptionsResponse,
  OrganizationActivityListResponse,
  OrganizationActivityQuery,
  WorkItemIdType,
} from "@ceird/jobs-core";
import { createIsomorphicFn } from "@tanstack/react-start";
import { Effect } from "effect";

import { runBrowserAppApiRequest } from "#/features/api/app-api-client";
import type { AppApiClient } from "#/features/api/app-api-client";

const importJobsServerSsr = () => import("./jobs-server-ssr");

const listAllCurrentServerJobsIsomorphic = createIsomorphicFn()
  .server(async (query: JobListQuery = {}) => {
    const { listAllCurrentServerJobsDirect } = await importJobsServerSsr();
    return await listAllCurrentServerJobsDirect(query);
  })
  .client((query: JobListQuery = {}) => listAllCurrentBrowserJobs(query));

const listCurrentServerJobsIsomorphic = createIsomorphicFn()
  .server(async (query: JobListQuery = {}) => {
    const { listCurrentServerJobsDirect } = await importJobsServerSsr();
    return await listCurrentServerJobsDirect(query);
  })
  .client((query: JobListQuery = {}) => listCurrentBrowserJobs(query));

const listCurrentServerOrganizationActivityIsomorphic = createIsomorphicFn()
  .server(async (query: OrganizationActivityQuery = {}) => {
    const { listCurrentServerOrganizationActivityDirect } =
      await importJobsServerSsr();
    return await listCurrentServerOrganizationActivityDirect(query);
  })
  .client((query: OrganizationActivityQuery = {}) =>
    listCurrentBrowserOrganizationActivity(query)
  );

const getCurrentServerJobDetailIsomorphic = createIsomorphicFn()
  .server(async (workItemId: WorkItemIdType) => {
    const { getCurrentServerJobDetailDirect } = await importJobsServerSsr();
    return await getCurrentServerJobDetailDirect(workItemId);
  })
  .client((workItemId: WorkItemIdType) =>
    getCurrentBrowserJobDetail(workItemId)
  );

const getCurrentServerJobOptionsIsomorphic = createIsomorphicFn()
  .server(async () => {
    const { getCurrentServerJobOptionsDirect } = await importJobsServerSsr();
    return await getCurrentServerJobOptionsDirect();
  })
  .client(() => getCurrentBrowserJobOptions());

const getCurrentServerJobMemberOptionsIsomorphic = createIsomorphicFn()
  .server(async () => {
    const { getCurrentServerJobMemberOptionsDirect } =
      await importJobsServerSsr();
    return await getCurrentServerJobMemberOptionsDirect();
  })
  .client(() => getCurrentBrowserJobMemberOptions());

const getCurrentServerJobExternalMemberOptionsIsomorphic = createIsomorphicFn()
  .server(async () => {
    const { getCurrentServerJobExternalMemberOptionsDirect } =
      await importJobsServerSsr();
    return await getCurrentServerJobExternalMemberOptionsDirect();
  })
  .client(() => getCurrentBrowserJobExternalMemberOptions());

function runBrowserAppApiClient<Response>(
  operation: string,
  execute: (client: AppApiClient) => Effect.Effect<Response, unknown>
): Promise<Response> {
  return Effect.runPromise(runBrowserAppApiRequest(operation, execute));
}

async function listCurrentBrowserJobs(
  query: JobListQuery = {}
): Promise<JobListResponse> {
  return await runBrowserAppApiClient("JobsClient.listJobs", (client) =>
    client.jobs.listJobs({
      urlParams: query,
    })
  );
}

async function listAllCurrentBrowserJobs(
  query: JobListQuery = {}
): Promise<JobListResponse> {
  const items: JobListItem[] = [];
  const { cursor: initialCursor, ...staticQuery } = query;
  let cursor = initialCursor;

  while (true) {
    const page = await listCurrentBrowserJobs(
      cursor ? { ...staticQuery, cursor } : staticQuery
    );

    items.push(...page.items);

    if (!page.nextCursor) {
      return {
        items,
        nextCursor: undefined,
      };
    }

    cursor = page.nextCursor;
  }
}

async function listCurrentBrowserOrganizationActivity(
  query: OrganizationActivityQuery = {}
): Promise<OrganizationActivityListResponse> {
  return await runBrowserAppApiClient(
    "JobsClient.listOrganizationActivity",
    (client) =>
      client.jobs.listOrganizationActivity({
        urlParams: query,
      })
  );
}

async function getCurrentBrowserJobDetail(
  workItemId: WorkItemIdType
): Promise<JobDetailResponse> {
  return await runBrowserAppApiClient("JobsClient.getJobDetail", (client) =>
    client.jobs.getJobDetail({ path: { workItemId } })
  );
}

async function getCurrentBrowserJobOptions(): Promise<JobOptionsResponse> {
  return await runBrowserAppApiClient("JobsClient.getJobOptions", (client) =>
    client.jobs.getJobOptions()
  );
}

async function getCurrentBrowserJobMemberOptions(): Promise<JobMemberOptionsResponse> {
  return await runBrowserAppApiClient(
    "JobsClient.getJobMemberOptions",
    (client) => client.jobs.getJobMemberOptions()
  );
}

async function getCurrentBrowserJobExternalMemberOptions(): Promise<JobExternalMemberOptionsResponse> {
  return await runBrowserAppApiClient(
    "JobsClient.getJobExternalMemberOptions",
    (client) => client.jobs.getJobExternalMemberOptions()
  );
}

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

export function listCurrentServerOrganizationActivity(
  query: OrganizationActivityQuery = {}
): Promise<OrganizationActivityListResponse> {
  return listCurrentServerOrganizationActivityIsomorphic(query);
}

export function getCurrentServerJobDetail(
  workItemId: WorkItemIdType
): Promise<JobDetailResponse> {
  return getCurrentServerJobDetailIsomorphic(workItemId);
}

export function getCurrentServerJobOptions(): Promise<JobOptionsResponse> {
  return getCurrentServerJobOptionsIsomorphic();
}

export function getCurrentServerJobMemberOptions(): Promise<JobMemberOptionsResponse> {
  return getCurrentServerJobMemberOptionsIsomorphic();
}

export function getCurrentServerJobExternalMemberOptions(): Promise<JobExternalMemberOptionsResponse> {
  return getCurrentServerJobExternalMemberOptionsIsomorphic();
}
