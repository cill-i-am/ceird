import type { OrganizationId } from "@ceird/identity-core";
import type {
  JobListCursorType,
  JobListItem,
  JobListResponse,
} from "@ceird/jobs-core";
import { QueryClient } from "@tanstack/react-query";

import { createDataPlaneMutationJournal } from "#/data-plane/mutation-journal";
import { createOrganizationDataScope } from "#/data-plane/query-scope";
import { getDataPlaneSessionKey } from "#/data-plane/session";

import {
  createJobsListSeed,
  createJobsListScope,
  getOrCreateJobsCollectionState,
  jobsCollectionId,
  jobsCollectionKey,
} from "./jobs-data-plane";

describe("jobs data plane", () => {
  const scope = createOrganizationDataScope({
    organizationId: "org_123" as OrganizationId,
    role: "owner",
    userId: "user_123",
  });

  const job = {
    assignees: [],
    contacts: [],
    createdAt: "2026-05-30T00:00:00.000Z",
    id: "job_123",
    kind: "job",
    labels: [],
    priority: "normal",
    status: "open",
    title: "Inspect boiler",
    updatedAt: "2026-05-30T00:00:00.000Z",
  } as unknown as JobListItem;

  it("uses organization scoped jobs collection identity", () => {
    expect(jobsCollectionKey(scope)).toStrictEqual([
      "jobs",
      "organization",
      "org_123",
      "user",
      "user_123",
      "role",
      "owner",
      "list",
      "cursor",
      "initial",
      "limit",
      50,
      "status",
      "all",
      "assignee",
      "all",
      "coordinator",
      "all",
      "priority",
      "all",
      "label",
      "all",
      "site",
      "all",
      "search",
      "",
      "sort",
      "updated-desc",
    ]);
    expect(jobsCollectionId(scope)).toBe(
      "organization:org_123:user:user_123:role:owner:jobs:list:cursor:initial:limit:50:status:all:assignee:all:coordinator:all:priority:all:label:all:site:all:search::sort:updated-desc"
    );
  });

  it("creates paged-query jobs seed envelopes for route loaders", () => {
    const response = {
      items: [job],
      nextCursor: "cursor-two" as JobListCursorType,
    } satisfies JobListResponse;
    const listScope = createJobsListScope({
      limit: 25,
      query: "boiler",
      status: "active",
    });

    expect(createJobsListSeed(scope, response, listScope, 1000)).toMatchObject({
      collection: "jobs",
      completeness: {
        filters: [
          { field: "status", operator: "eq", value: "active" },
          { field: "query", operator: "search", value: "boiler" },
        ],
        mode: "paged-query",
        page: {
          hasNextPage: true,
          limit: 25,
          type: "cursor",
        },
        queryName: "jobs.list",
      },
      data: [job],
      queryKey: jobsCollectionKey(scope, listScope),
      requestStartedAt: 1000,
    });
  });

  it("reuses collection state through the data-plane registry", () => {
    const queryClient = new QueryClient();
    const session = {
      mutationJournal: createDataPlaneMutationJournal(),
      queryClient,
      registry: new Map<string, unknown>(),
      scope,
    };

    const first = getOrCreateJobsCollectionState({
      initialJobs: [job],
      listScope: createJobsListScope({ limit: 25, status: "active" }),
      queryClient,
      scope,
      session,
    });
    const second = getOrCreateJobsCollectionState({
      initialJobs: [],
      listScope: createJobsListScope({ limit: 25, status: "active" }),
      queryClient,
      scope,
      session,
    });

    expect(first).toBe(second);
    expect(
      session.registry.has(
        jobsCollectionId(
          scope,
          createJobsListScope({ limit: 25, status: "active" })
        )
      )
    ).toBeTruthy();
    expect(getDataPlaneSessionKey(session.scope)).toBe(
      "organization:org_123:user:user_123:role:owner"
    );
  });
});
