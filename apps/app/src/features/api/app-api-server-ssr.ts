import type {
  JobListItem,
  JobListQuery,
  JobListResponse,
} from "@ceird/jobs-core";
import type { LabelsResponse, ListLabelsQuery } from "@ceird/labels-core";
import type {
  SiteListQuery,
  SiteListResponse,
  SiteOption,
} from "@ceird/sites-core";

import {
  createAllPagesPaginationState,
  ensureAllPagesCursorProgress,
  ensureAllPagesLimit,
} from "#/features/api/all-pages-pagination";
import { runAppApiClient } from "#/features/api/app-api-client";
import { AppApiRequestError } from "#/features/api/app-api-errors";
import { readConfiguredServerApiOrigin } from "#/lib/api-origin.server";
import {
  normalizeServerApiCookieHeader,
  readServerApiForwardedHeaders,
} from "#/lib/server-api-forwarded-headers";

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

export async function getCurrentServerLabelsDirect(
  query: ListLabelsQuery = {}
): Promise<LabelsResponse> {
  const request = await readServerAppApiRequestStrict();

  return await runAppApiClient(request, "LabelsServer.listLabels", (client) =>
    client.labels.listLabels({ query })
  );
}

export async function listCurrentServerSitesDirect(
  query: SiteListQuery = {}
): Promise<SiteListResponse> {
  const request = await readServerAppApiRequestStrict();

  return await runAppApiClient(request, "SitesServer.listSites", (client) =>
    client.sites.listSites({
      query,
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
  const pagination = createAllPagesPaginationState("Site", initialCursor);
  let cursor = initialCursor;

  while (true) {
    ensureAllPagesLimit(pagination);

    const pageQuery =
      cursor === undefined ? staticQuery : { ...staticQuery, cursor };
    const page = await runAppApiClient(
      request,
      "SitesServer.listAllSites.page",
      (client) =>
        client.sites.listSites({
          query: pageQuery,
        })
    );

    items.push(...page.items);

    if (!page.nextCursor) {
      return {
        items,
        nextCursor: undefined,
      };
    }

    ensureAllPagesCursorProgress(pagination, page.nextCursor);
    cursor = page.nextCursor;
  }
}

export async function listAllCurrentServerJobsDirect(
  query: JobListQuery = {}
): Promise<JobListResponse> {
  const items: JobListItem[] = [];
  const request = await readServerAppApiRequestStrict();
  const { cursor: initialCursor, ...staticQuery } = query;
  const pagination = createAllPagesPaginationState("Job", initialCursor);
  let cursor = initialCursor;

  while (true) {
    ensureAllPagesLimit(pagination);

    const pageQuery = cursor ? { ...staticQuery, cursor } : staticQuery;
    const page = await runAppApiClient(
      request,
      "JobsServer.listJobs",
      (client) =>
        client.jobs.listJobs({
          query: pageQuery,
        })
    );

    items.push(...page.items);

    if (!page.nextCursor) {
      return {
        items,
        nextCursor: undefined,
      };
    }

    ensureAllPagesCursorProgress(pagination, page.nextCursor);
    cursor = page.nextCursor;
  }
}

export async function listCurrentServerJobsDirect(
  query: JobListQuery = {}
): Promise<JobListResponse> {
  const request = await readServerAppApiRequestStrict();

  return await runAppApiClient(request, "JobsServer.listJobs", (client) =>
    client.jobs.listJobs({
      query,
    })
  );
}
