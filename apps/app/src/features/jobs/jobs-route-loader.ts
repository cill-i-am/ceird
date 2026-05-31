import type { JobListResponse } from "@ceird/jobs-core";
import type { QueryClient } from "@tanstack/query-core";

import { applyDataPlaneSeed } from "#/data-plane/bootstrap";
import { createOrganizationDataScope } from "#/data-plane/query-scope";
import {
  EMPTY_JOBS_OPTIONS,
  createJobOptionsSeed,
  createJobsListSeed,
  loadCurrentJobsOptionsForViewer,
} from "#/features/jobs/jobs-data-plane";
import {
  getCurrentServerJobOptions,
  listAllCurrentServerJobs,
} from "#/features/jobs/jobs-server";
import {
  canUseInternalJobOptions,
  decodeJobsViewerUserId,
} from "#/features/jobs/jobs-viewer";
import type { JobsViewer } from "#/features/jobs/jobs-viewer";
import { requireOrganizationRouteContextRole } from "#/features/organizations/organization-route-access";
import type { OrganizationProductRouteContext } from "#/features/organizations/organization-route-access";

const EMPTY_JOBS_LIST: JobListResponse = {
  items: [],
  nextCursor: undefined,
};

interface JobsRouteOrganizationAccess extends OrganizationProductRouteContext {
  readonly queryClient?: QueryClient | undefined;
}

export async function loadJobsRouteData(
  organizationAccess: JobsRouteOrganizationAccess
) {
  if (organizationAccess.activeOrganizationSync.required) {
    return {
      dataPlaneSeeds: [],
      list: EMPTY_JOBS_LIST,
      options: EMPTY_JOBS_OPTIONS,
      viewer: {
        role: "member",
        userId: decodeJobsViewerUserId(organizationAccess.currentUserId),
      } satisfies JobsViewer,
    };
  }

  const activeRole = requireOrganizationRouteContextRole(organizationAccess);
  const viewer = {
    role: activeRole,
    userId: decodeJobsViewerUserId(organizationAccess.currentUserId),
  } satisfies JobsViewer;
  const listRequestStartedAt = Date.now();
  const listPromise = listAllCurrentServerJobs({});
  let optionsRequestStartedAt = Date.now();
  let optionsPromise = canUseInternalJobOptions(viewer)
    ? getCurrentServerJobOptions()
    : undefined;
  const list = await listPromise;

  if (!optionsPromise) {
    optionsRequestStartedAt = Date.now();
    optionsPromise = loadCurrentJobsOptionsForViewer(viewer, list);
  }

  const options = await optionsPromise;
  const scope = createOrganizationDataScope({
    organizationId: organizationAccess.activeOrganizationId,
    role: viewer.role,
    userId: viewer.userId,
  });

  const jobsSeed = createJobsListSeed(scope, list, listRequestStartedAt);
  const jobOptionsSeed = createJobOptionsSeed(
    scope,
    options,
    optionsRequestStartedAt
  );

  if (organizationAccess.queryClient) {
    const seededItems = applyDataPlaneSeed(
      organizationAccess.queryClient,
      jobsSeed
    );
    const [seededOptions] = applyDataPlaneSeed(
      organizationAccess.queryClient,
      jobOptionsSeed
    );

    return {
      dataPlaneSeeds: [jobsSeed, jobOptionsSeed],
      list: {
        ...list,
        items: seededItems,
      },
      options: seededOptions?.options ?? options,
      viewer,
    };
  }

  return {
    dataPlaneSeeds: [jobsSeed, jobOptionsSeed],
    list,
    options,
    viewer,
  };
}
