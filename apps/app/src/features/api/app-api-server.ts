import type {
  JobListItem,
  JobListQuery,
  JobListResponse,
} from "@ceird/jobs-core";
import type { LabelsResponse } from "@ceird/labels-core";
import type {
  ServiceAreaListResponse,
  SiteListQuery,
  SiteListResponse,
  SiteOption,
} from "@ceird/sites-core";
import { createIsomorphicFn } from "@tanstack/react-start";
import { Effect } from "effect";

import { runBrowserAppApiRequest } from "#/features/api/app-api-client";
import type { AppApiClient } from "#/features/api/app-api-client";
import { AppApiRequestError } from "#/features/api/app-api-errors";

const importAppApiServerSsr = () => import("./app-api-server-ssr");
const MAX_ALL_SITE_PAGES = 1000;

const getCurrentServerLabelsIsomorphic = createIsomorphicFn()
  .server(async () => {
    const { getCurrentServerLabelsDirect } = await importAppApiServerSsr();
    return await getCurrentServerLabelsDirect();
  })
  .client(() => getCurrentBrowserLabels());

const listCurrentServerSitesIsomorphic = createIsomorphicFn()
  .server(async (query: SiteListQuery = {}) => {
    const { listCurrentServerSitesDirect } = await importAppApiServerSsr();
    return await listCurrentServerSitesDirect(query);
  })
  .client((query: SiteListQuery = {}) => listCurrentBrowserSites(query));

const listAllCurrentServerSitesIsomorphic = createIsomorphicFn()
  .server(async (query: SiteListQuery = {}) => {
    const { listAllCurrentServerSitesDirect } = await importAppApiServerSsr();
    return await listAllCurrentServerSitesDirect(query);
  })
  .client((query: SiteListQuery = {}) => listAllCurrentBrowserSites(query));

const getCurrentServerServiceAreasIsomorphic = createIsomorphicFn()
  .server(async () => {
    const { getCurrentServerServiceAreasDirect } =
      await importAppApiServerSsr();
    return await getCurrentServerServiceAreasDirect();
  })
  .client(() => getCurrentBrowserServiceAreas());

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

async function getCurrentBrowserServiceAreas(): Promise<ServiceAreaListResponse> {
  return await runBrowserAppApiClient(
    "ServiceAreasClient.listServiceAreas",
    (client) => client.serviceAreas.listServiceAreas()
  );
}

async function listCurrentBrowserSites(
  query: SiteListQuery = {}
): Promise<SiteListResponse> {
  return await runBrowserAppApiClient("SitesClient.listSites", (client) =>
    client.sites.listSites({
      urlParams: query,
    })
  );
}

async function listAllCurrentBrowserSites(
  query: SiteListQuery = {}
): Promise<SiteListResponse> {
  const items: SiteOption[] = [];
  const { cursor: initialCursor, limit, ...queryWithoutCursor } = query;
  const staticQuery = { limit: limit ?? 100, ...queryWithoutCursor };
  const seenCursors = new Set<string>();
  let cursor = initialCursor;
  let pageCount = 0;

  if (cursor !== undefined) {
    seenCursors.add(cursor);
  }

  while (true) {
    pageCount += 1;
    ensureSitePageLimit(pageCount);

    // Cursor pagination must await each page before requesting its next cursor.
    // react-doctor-disable-next-line
    const page = await listCurrentBrowserSites(
      cursor === undefined ? staticQuery : { ...staticQuery, cursor }
    );

    items.push(...page.items);

    if (!page.nextCursor) {
      return {
        items,
        nextCursor: undefined,
      };
    }

    ensureSiteCursorProgress(page.nextCursor, seenCursors);
    cursor = page.nextCursor;
  }
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

export function listCurrentServerSites(
  query: SiteListQuery = {}
): Promise<SiteListResponse> {
  return listCurrentServerSitesIsomorphic(query);
}

export function listAllCurrentServerSites(
  query: SiteListQuery = {}
): Promise<SiteListResponse> {
  return listAllCurrentServerSitesIsomorphic(query);
}

export function getCurrentServerServiceAreas(): Promise<ServiceAreaListResponse> {
  return getCurrentServerServiceAreasIsomorphic();
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

function ensureSitePageLimit(pageCount: number) {
  if (pageCount > MAX_ALL_SITE_PAGES) {
    throw new AppApiRequestError({
      message: "Site pagination exceeded the maximum page count.",
    });
  }
}

function ensureSiteCursorProgress(
  nextCursor: NonNullable<SiteListResponse["nextCursor"]>,
  seenCursors: Set<string>
) {
  if (seenCursors.has(nextCursor)) {
    throw new AppApiRequestError({
      message: "Site pagination returned a repeated cursor.",
    });
  }

  seenCursors.add(nextCursor);
}
