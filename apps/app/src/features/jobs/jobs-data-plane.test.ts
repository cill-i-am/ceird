import type { OrganizationId } from "@ceird/identity-core";
import type { JobListItem, JobListResponse } from "@ceird/jobs-core";
import { QueryClient } from "@tanstack/react-query";

import { createDataPlaneMutationJournal } from "#/data-plane/mutation-journal";
import { createOrganizationDataScope } from "#/data-plane/query-scope";
import { getDataPlaneSessionKey } from "#/data-plane/session";

import {
  createJobsListSeed,
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
    ]);
    expect(jobsCollectionId(scope)).toBe(
      "organization:org_123:user:user_123:role:owner:jobs"
    );
  });

  it("creates complete jobs seed envelopes for route loaders", () => {
    const response = {
      items: [job],
      nextCursor: undefined,
    } satisfies JobListResponse;

    expect(createJobsListSeed(scope, response, 1000)).toMatchObject({
      collection: "jobs",
      completeness: "complete",
      data: [job],
      queryKey: jobsCollectionKey(scope),
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
      queryClient,
      scope,
      session,
    });
    const second = getOrCreateJobsCollectionState({
      initialJobs: [],
      queryClient,
      scope,
      session,
    });

    expect(first).toBe(second);
    expect(session.registry.has(jobsCollectionId(scope))).toBeTruthy();
    expect(getDataPlaneSessionKey(session.scope)).toBe(
      "organization:org_123:user:user_123:role:owner"
    );
  });
});
