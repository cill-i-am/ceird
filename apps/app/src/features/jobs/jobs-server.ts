import { createIsomorphicFn } from "@tanstack/react-start";
import type {
  JobDetailResponse,
  JobLabelsResponse,
  JobListItem,
  JobListQuery,
  JobListResponse,
  JobMemberOptionsResponse,
  JobOptionsResponse,
  OrganizationActivityListResponse,
  OrganizationActivityQuery,
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

const getCurrentServerJobLabelsIsomorphic = createIsomorphicFn()
  .server(async () => {
    const { getCurrentServerJobLabelsDirect } = await importJobsServerSsr();
    return await getCurrentServerJobLabelsDirect();
  })
  .client(() => getCurrentBrowserJobLabels());
const getCurrentServerJobMemberOptionsIsomorphic = createIsomorphicFn()
  .server(async () => {
    const { getCurrentServerJobMemberOptionsDirect } =
      await importJobsServerSsr();
    return await getCurrentServerJobMemberOptionsDirect();
  })
  .client(() => getCurrentBrowserJobMemberOptions());

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

async function listCurrentBrowserOrganizationActivity(
  query: OrganizationActivityQuery = {}
): Promise<OrganizationActivityListResponse> {
  return await runBrowserJobsClient((client) =>
    client.jobs.listOrganizationActivity({
      urlParams: query,
    })
  );
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

async function getCurrentBrowserJobLabels(): Promise<JobLabelsResponse> {
  return await runBrowserJobsClient((client) => client.jobs.listJobLabels());
}

async function getCurrentBrowserJobMemberOptions(): Promise<JobMemberOptionsResponse> {
  return await runBrowserJobsClient((client) =>
    client.jobs.getJobMemberOptions()
  );
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

export function getCurrentServerJobLabels(): Promise<JobLabelsResponse> {
  return getCurrentServerJobLabelsIsomorphic();
}

export function getCurrentServerJobMemberOptions(): Promise<JobMemberOptionsResponse> {
  return getCurrentServerJobMemberOptionsIsomorphic();
}

export function getCurrentServerSiteOptions(): Promise<SitesOptionsResponse> {
  return getCurrentServerSiteOptionsIsomorphic();
}
