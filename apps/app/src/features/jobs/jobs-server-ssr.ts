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

import {
  createAllPagesPaginationState,
  ensureAllPagesCursorProgress,
  ensureAllPagesLimit,
} from "#/features/api/all-pages-pagination";
import { runAppApiClient } from "#/features/api/app-api-client";
import { readServerAppApiRequestStrict } from "#/features/api/app-api-server-ssr";

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

export async function listAllCurrentServerJobsDirect(
  query: JobListQuery = {}
): Promise<JobListResponse> {
  const request = await readServerAppApiRequestStrict();
  const items: JobListItem[] = [];
  const { cursor: initialCursor, ...staticQuery } = query;
  const pagination = createAllPagesPaginationState("Job", initialCursor);
  let cursor = initialCursor;

  while (true) {
    ensureAllPagesLimit(pagination);

    const pageQuery = cursor ? { ...staticQuery, cursor } : staticQuery;
    // Cursor pagination must await each page before requesting its next cursor.
    // react-doctor-disable-next-line
    const page = await runAppApiClient(
      request,
      "JobsServer.listAllJobs.page",
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

export async function listCurrentServerOrganizationActivityDirect(
  query: OrganizationActivityQuery = {}
): Promise<OrganizationActivityListResponse> {
  const request = await readServerAppApiRequestStrict();

  return await runAppApiClient(
    request,
    "JobsServer.listOrganizationActivity",
    (client) =>
      client.jobs.listOrganizationActivity({
        query,
      })
  );
}

export async function getCurrentServerJobDetailDirect(
  workItemId: WorkItemIdType
): Promise<JobDetailResponse> {
  const request = await readServerAppApiRequestStrict();

  return await runAppApiClient(request, "JobsServer.getJobDetail", (client) =>
    client.jobs.getJobDetail({ params: { workItemId } })
  );
}

export async function getCurrentServerJobOptionsDirect(): Promise<JobOptionsResponse> {
  const request = await readServerAppApiRequestStrict();

  return await runAppApiClient(request, "JobsServer.getJobOptions", (client) =>
    client.jobs.getJobOptions()
  );
}

export async function getCurrentServerExternalJobOptionsDirect(): Promise<JobOptionsResponse> {
  const request = await readServerAppApiRequestStrict();

  return await runAppApiClient(
    request,
    "JobsServer.getExternalJobOptions",
    (client) => client.jobs.getExternalJobOptions()
  );
}

export async function getCurrentServerJobMemberOptionsDirect(): Promise<JobMemberOptionsResponse> {
  const request = await readServerAppApiRequestStrict();

  return await runAppApiClient(
    request,
    "JobsServer.getJobMemberOptions",
    (client) => client.jobs.getJobMemberOptions()
  );
}

export async function getCurrentServerJobExternalMemberOptionsDirect(): Promise<JobExternalMemberOptionsResponse> {
  const request = await readServerAppApiRequestStrict();

  return await runAppApiClient(
    request,
    "JobsServer.getJobExternalMemberOptions",
    (client) => client.jobs.getJobExternalMemberOptions()
  );
}
