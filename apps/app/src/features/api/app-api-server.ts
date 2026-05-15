import type {
  JobListItem,
  JobListQuery,
  JobListResponse,
} from "@ceird/jobs-core";
import type { LabelsResponse } from "@ceird/labels-core";
import type { SitesOptionsResponse } from "@ceird/sites-core";
import { createIsomorphicFn } from "@tanstack/react-start";
import { Effect } from "effect";

import { runBrowserAppApiRequest } from "#/features/api/app-api-client";
import type { AppApiClient } from "#/features/api/app-api-client";

const importAppApiServerSsr = () => import("./app-api-server-ssr");

const getCurrentServerLabelsIsomorphic = createIsomorphicFn()
  .server(async () => {
    const { getCurrentServerLabelsDirect } = await importAppApiServerSsr();
    return await getCurrentServerLabelsDirect();
  })
  .client(() => getCurrentBrowserLabels());

const getCurrentServerSiteOptionsIsomorphic = createIsomorphicFn()
  .server(async () => {
    const { getCurrentServerSiteOptionsDirect } = await importAppApiServerSsr();
    return await getCurrentServerSiteOptionsDirect();
  })
  .client(() => getCurrentBrowserSiteOptions());

const listAllCurrentServerJobsIsomorphic = createIsomorphicFn()
  .server(async (query: JobListQuery = {}) => {
    const { listAllCurrentServerJobsDirect } = await importAppApiServerSsr();
    return await listAllCurrentServerJobsDirect(query);
  })
  .client((query: JobListQuery = {}) => listAllCurrentBrowserJobs(query));

const listCurrentServerJobsIsomorphic = createIsomorphicFn()
  .server(async (query: JobListQuery = {}) => {
    const { listCurrentServerJobsDirect } = await importAppApiServerSsr();
    return await listCurrentServerJobsDirect(query);
  })
  .client((query: JobListQuery = {}) => listCurrentBrowserJobs(query));

function runBrowserAppApiClient<Response>(
  operation: string,
  execute: (client: AppApiClient) => Effect.Effect<Response, unknown>
): Promise<Response> {
  return Effect.runPromise(runBrowserAppApiRequest(operation, execute));
}

async function getCurrentBrowserLabels(): Promise<LabelsResponse> {
  return await runBrowserAppApiClient("LabelsClient.listLabels", (client) =>
    client.labels.listLabels()
  );
}

async function getCurrentBrowserSiteOptions(): Promise<SitesOptionsResponse> {
  return await runBrowserAppApiClient("SitesClient.getSiteOptions", (client) =>
    client.sites.getSiteOptions()
  );
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
    // Cursor pagination must await each page before requesting its next cursor.
    // react-doctor-disable-next-line
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

export function getCurrentServerLabels(): Promise<LabelsResponse> {
  return getCurrentServerLabelsIsomorphic();
}

export function getCurrentServerSiteOptions(): Promise<SitesOptionsResponse> {
  return getCurrentServerSiteOptionsIsomorphic();
}

export function listAllCurrentServerJobs(
  query: JobListQuery = {}
): Promise<JobListResponse> {
  return listAllCurrentServerJobsIsomorphic(query);
}

export function listCurrentServerJobs(
  query: JobListQuery = {}
): Promise<JobListResponse> {
  return listCurrentServerJobsIsomorphic(query);
}
