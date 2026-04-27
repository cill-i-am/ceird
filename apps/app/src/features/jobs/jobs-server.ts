import { createIsomorphicFn } from "@tanstack/react-start";
import type {
  JobDetailResponse,
  JobListItem,
  JobListQuery,
  JobListResponse,
  JobOptionsResponse,
  SitesOptionsResponse,
  WorkItemIdType,
} from "@task-tracker/jobs-core";
import { Effect } from "effect";

import { makeBrowserJobsClient, provideBrowserJobsHttp } from "./jobs-client";
import type { JobsApiClient } from "./jobs-client";
import { normalizeJobsError } from "./jobs-errors";

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

const getCurrentServerSiteOptionsIsomorphic = createIsomorphicFn()
  .server(async () => {
    const { getCurrentServerSiteOptionsDirect } = await importJobsServerSsr();
    return await getCurrentServerSiteOptionsDirect();
  })
  .client(() => getCurrentBrowserSiteOptions());

function runBrowserJobsClient<Response>(
  execute: (client: JobsApiClient) => Effect.Effect<Response, unknown>
): Promise<Response> {
  return Effect.gen(function* () {
    const client = yield* makeBrowserJobsClient();

    return yield* execute(client);
  }).pipe(
    Effect.mapError(normalizeJobsError),
    provideBrowserJobsHttp,
    Effect.runPromise
  );
}

async function listCurrentBrowserJobs(
  query: JobListQuery = {}
): Promise<JobListResponse> {
  return await runBrowserJobsClient((client) =>
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

async function getCurrentBrowserJobDetail(
  workItemId: WorkItemIdType
): Promise<JobDetailResponse> {
  return await runBrowserJobsClient((client) =>
    client.jobs.getJobDetail({ path: { workItemId } })
  );
}

async function getCurrentBrowserJobOptions(): Promise<JobOptionsResponse> {
  return await runBrowserJobsClient((client) => client.jobs.getJobOptions());
}

async function getCurrentBrowserSiteOptions(): Promise<SitesOptionsResponse> {
  return await runBrowserJobsClient((client) => client.sites.getSiteOptions());
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

export function getCurrentServerJobDetail(
  workItemId: WorkItemIdType
): Promise<JobDetailResponse> {
  return getCurrentServerJobDetailIsomorphic(workItemId);
}

export function getCurrentServerJobOptions(): Promise<JobOptionsResponse> {
  return getCurrentServerJobOptionsIsomorphic();
}

export function getCurrentServerSiteOptions(): Promise<SitesOptionsResponse> {
  return getCurrentServerSiteOptionsIsomorphic();
}
