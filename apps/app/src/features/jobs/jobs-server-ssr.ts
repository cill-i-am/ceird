import type {
  JobDetailResponse,
  JobExternalMemberOptionsResponse,
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

import { readConfiguredServerApiOrigin } from "#/lib/api-origin.server";
import {
  normalizeServerApiCookieHeader,
  readServerApiForwardedHeaders,
} from "#/lib/server-api-forwarded-headers";

import { runJobsClient } from "./jobs-client";
import { JobsRequestError } from "./jobs-errors";

interface ServerJobsRequest {
  readonly cookie: string;
  readonly apiOrigin: string;
  readonly forwardedHeaders?: ReturnType<typeof readServerApiForwardedHeaders>;
}

async function readServerJobsRequestStrict(): Promise<ServerJobsRequest> {
  const { getRequestHeader } = await import("@tanstack/react-start/server");
  const cookie = getRequestHeader("cookie");
  const apiOrigin = readConfiguredServerApiOrigin();

  if (!cookie) {
    throw new JobsRequestError({
      message: "Cannot query jobs without the current auth cookie.",
    });
  }

  if (!apiOrigin) {
    throw new JobsRequestError({
      message: "Cannot resolve the jobs API origin for server jobs requests.",
    });
  }

  return {
    apiOrigin,
    cookie: normalizeServerApiCookieHeader(cookie, apiOrigin),
    forwardedHeaders: readServerApiForwardedHeaders({
      host: getRequestHeader("host"),
      forwardedProto: getRequestHeader("x-forwarded-proto"),
    }),
  };
}

export async function listCurrentServerJobsDirect(
  query: JobListQuery = {}
): Promise<JobListResponse> {
  const request = await readServerJobsRequestStrict();

  return await runJobsClient(request, "JobsServer.listJobs", (client) =>
    client.jobs.listJobs({
      urlParams: query,
    })
  );
}

export async function listAllCurrentServerJobsDirect(
  query: JobListQuery = {}
): Promise<JobListResponse> {
  const request = await readServerJobsRequestStrict();
  const items: JobListItem[] = [];
  const { cursor: initialCursor, ...staticQuery } = query;
  let cursor = initialCursor;

  while (true) {
    const urlParams = cursor ? { ...staticQuery, cursor } : staticQuery;
    const page = await runJobsClient(
      request,
      "JobsServer.listAllJobs.page",
      (client) =>
        client.jobs.listJobs({
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

    cursor = page.nextCursor;
  }
}

export async function listCurrentServerOrganizationActivityDirect(
  query: OrganizationActivityQuery = {}
): Promise<OrganizationActivityListResponse> {
  const request = await readServerJobsRequestStrict();

  return await runJobsClient(
    request,
    "JobsServer.listOrganizationActivity",
    (client) =>
      client.jobs.listOrganizationActivity({
        urlParams: query,
      })
  );
}

export async function getCurrentServerJobDetailDirect(
  workItemId: WorkItemIdType
): Promise<JobDetailResponse> {
  const request = await readServerJobsRequestStrict();

  return await runJobsClient(request, "JobsServer.getJobDetail", (client) =>
    client.jobs.getJobDetail({ path: { workItemId } })
  );
}

export async function getCurrentServerJobOptionsDirect(): Promise<JobOptionsResponse> {
  const request = await readServerJobsRequestStrict();

  return await runJobsClient(request, "JobsServer.getJobOptions", (client) =>
    client.jobs.getJobOptions()
  );
}

export async function getCurrentServerJobLabelsDirect(): Promise<JobLabelsResponse> {
  const request = await readServerJobsRequestStrict();

  return await runJobsClient(request, "JobsServer.listJobLabels", (client) =>
    client.jobs.listJobLabels()
  );
}

export async function getCurrentServerJobMemberOptionsDirect(): Promise<JobMemberOptionsResponse> {
  const request = await readServerJobsRequestStrict();

  return await runJobsClient(
    request,
    "JobsServer.getJobMemberOptions",
    (client) => client.jobs.getJobMemberOptions()
  );
}

export async function getCurrentServerJobExternalMemberOptionsDirect(): Promise<JobExternalMemberOptionsResponse> {
  const request = await readServerJobsRequestStrict();

  return await runJobsClient(
    request,
    "JobsServer.getJobExternalMemberOptions",
    (client) => client.jobs.getJobExternalMemberOptions()
  );
}

export async function getCurrentServerSiteOptionsDirect(): Promise<SitesOptionsResponse> {
  const request = await readServerJobsRequestStrict();

  return await runJobsClient(request, "SitesServer.getSiteOptions", (client) =>
    client.sites.getSiteOptions()
  );
}
