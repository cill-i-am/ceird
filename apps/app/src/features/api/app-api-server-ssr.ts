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

import { runAppApiClient } from "#/features/api/app-api-client";
import { AppApiRequestError } from "#/features/api/app-api-errors";
import { readConfiguredServerApiOrigin } from "#/lib/api-origin.server";
import {
  normalizeServerApiCookieHeader,
  readServerApiForwardedHeaders,
} from "#/lib/server-api-forwarded-headers";

const MAX_ALL_SITE_PAGES = 1000;

export interface ServerAppApiRequest {
  readonly cookie: string;
  readonly apiOrigin: string;
  readonly forwardedHeaders?: ReturnType<typeof readServerApiForwardedHeaders>;
}

export async function readServerAppApiRequestStrict(): Promise<ServerAppApiRequest> {
  const { getRequestHeader } = await import("@tanstack/react-start/server");
  const cookie = getRequestHeader("cookie");
  const apiOrigin = readConfiguredServerApiOrigin();

  if (!cookie) {
    throw new AppApiRequestError({
      message: "Cannot query the Ceird API without the current auth cookie.",
    });
  }

  if (!apiOrigin) {
    throw new AppApiRequestError({
      message: "Cannot resolve the Ceird API origin for server requests.",
    });
  }

  return {
    apiOrigin,
    cookie: normalizeServerApiCookieHeader(cookie, apiOrigin),
    forwardedHeaders: readServerApiForwardedHeaders({
      forwardedHost: getRequestHeader("x-forwarded-host"),
      host: getRequestHeader("host"),
      origin: getRequestHeader("origin"),
      forwardedProto: getRequestHeader("x-forwarded-proto"),
    }),
  };
}

export async function getCurrentServerLabelsDirect(): Promise<LabelsResponse> {
  const request = await readServerAppApiRequestStrict();

  return await runAppApiClient(request, "LabelsServer.listLabels", (client) =>
    client.labels.listLabels()
  );
}

export async function listCurrentServerSitesDirect(
  query: SiteListQuery = {}
): Promise<SiteListResponse> {
  const request = await readServerAppApiRequestStrict();

  return await runAppApiClient(request, "SitesServer.listSites", (client) =>
    client.sites.listSites({
      urlParams: query,
    })
  );
}

export async function listAllCurrentServerSitesDirect(
  query: SiteListQuery = {}
): Promise<SiteListResponse> {
  const request = await readServerAppApiRequestStrict();
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

    const urlParams =
      cursor === undefined ? staticQuery : { ...staticQuery, cursor };
    const page = await runAppApiClient(
      request,
      "SitesServer.listAllSites.page",
      (client) =>
        client.sites.listSites({
          urlParams,
        })
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

export async function getCurrentServerServiceAreasDirect(): Promise<ServiceAreaListResponse> {
  const request = await readServerAppApiRequestStrict();

  return await runAppApiClient(
    request,
    "ServiceAreasServer.listServiceAreas",
    (client) => client.serviceAreas.listServiceAreas()
  );
}

export async function listAllCurrentServerJobsDirect(
  query: JobListQuery = {}
): Promise<JobListResponse> {
  const items: JobListItem[] = [];
  const request = await readServerAppApiRequestStrict();
  const { cursor: initialCursor, ...staticQuery } = query;
  let cursor = initialCursor;

  while (true) {
    const pageQuery = cursor ? { ...staticQuery, cursor } : staticQuery;
    const page = await runAppApiClient(
      request,
      "JobsServer.listJobs",
      (client) =>
        client.jobs.listJobs({
          urlParams: pageQuery,
        })
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

export async function listCurrentServerJobsDirect(
  query: JobListQuery = {}
): Promise<JobListResponse> {
  const request = await readServerAppApiRequestStrict();

  return await runAppApiClient(request, "JobsServer.listJobs", (client) =>
    client.jobs.listJobs({
      urlParams: query,
    })
  );
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
