import { getRequestHeader } from "@tanstack/react-start/server";
import type {
  JobDetailResponse,
  JobListItem,
  JobListQuery,
  JobListResponse,
  JobOptionsResponse,
  WorkItemIdType,
} from "@task-tracker/jobs-core";

import { readConfiguredServerApiOrigin } from "#/lib/api-origin";

import { runJobsClient } from "./jobs-client";
import { JobsRequestError } from "./jobs-errors";

interface ServerJobsRequest {
  readonly cookie: string;
  readonly apiOrigin: string;
}

export async function listCurrentServerJobsDirect(
  query: JobListQuery = {}
): Promise<JobListResponse> {
  const request = readServerJobsRequestStrict();

  return await runJobsClient(request, (client) =>
    client.jobs.listJobs({
      urlParams: query,
    })
  );
}

export async function listAllCurrentServerJobsDirect(
  query: JobListQuery = {}
): Promise<JobListResponse> {
  const request = readServerJobsRequestStrict();
  const items: JobListItem[] = [];
  const { cursor: initialCursor, ...staticQuery } = query;
  let cursor = initialCursor;

  while (true) {
    const urlParams = cursor ? { ...staticQuery, cursor } : staticQuery;
    const page = await runJobsClient(request, (client) =>
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

export async function getCurrentServerJobDetailDirect(
  workItemId: WorkItemIdType
): Promise<JobDetailResponse> {
  const request = readServerJobsRequestStrict();

  return await runJobsClient(request, (client) =>
    client.jobs.getJobDetail({ path: { workItemId } })
  );
}

export async function getCurrentServerJobOptionsDirect(): Promise<JobOptionsResponse> {
  const request = readServerJobsRequestStrict();

  return await runJobsClient(request, (client) => client.jobs.getJobOptions());
}

function readServerJobsRequestStrict(): ServerJobsRequest {
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
    cookie,
  };
}
