import type {
  JobListQuery,
  JobListResponse,
  JobOptionsResponse,
} from "@ceird/jobs-core";
import type { QueryClient } from "@tanstack/query-core";

import { applyDataPlaneSeed } from "#/data-plane/bootstrap";
import { createOrganizationDataScope } from "#/data-plane/query-scope";
import {
  EMPTY_JOBS_OPTIONS,
  createJobsListScope,
  createJobOptionsSeed,
  createJobsListSeed,
  loadCurrentJobsOptionsForViewer,
} from "#/features/jobs/jobs-data-plane";
import {
  getCurrentServerExternalJobOptions,
  getCurrentServerJobOptions,
  listCurrentServerJobs,
} from "#/features/jobs/jobs-server";
import {
  canUseInternalJobOptions,
  decodeJobsViewerUserId,
} from "#/features/jobs/jobs-viewer";
import type { JobsViewer } from "#/features/jobs/jobs-viewer";
import { requireOrganizationRouteContextRole } from "#/features/organizations/organization-route-access";
import type { OrganizationProductRouteContext } from "#/features/organizations/organization-route-access";
import { loadRouteProximityLocationPreferenceEnabled } from "#/features/settings/route-proximity-location-preference";

const EMPTY_JOBS_LIST: JobListResponse = {
  items: [],
  nextCursor: undefined,
};

interface JobsRouteOrganizationAccess extends OrganizationProductRouteContext {
  readonly queryClient?: QueryClient | undefined;
}

export async function loadJobsRouteData(
  organizationAccess: JobsRouteOrganizationAccess,
  query: JobListQuery = {}
) {
  const listScope = createJobsListScope(query);

  if (organizationAccess.activeOrganizationSync.required) {
    return {
      dataPlaneSeeds: [],
      list: EMPTY_JOBS_LIST,
      listScope,
      options: EMPTY_JOBS_OPTIONS,
      routeProximityLocationEnabled: false,
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
  const routeProximityLocationPreferencePromise =
    loadRouteProximityLocationPreferenceEnabled();
  const listPromise = listCurrentServerJobs(listScope.query);
  let optionsRequestStartedAt = Date.now();
  let optionsPromise: Promise<JobOptionsResponse> | undefined;

  if (canUseInternalJobOptions(viewer)) {
    optionsPromise = getCurrentServerJobOptions();
  } else if (viewer.role === "external") {
    optionsPromise = getCurrentServerExternalJobOptions();
  }

  let list: JobListResponse;
  let options: JobOptionsResponse;

  if (optionsPromise) {
    [list, options] = await Promise.all([listPromise, optionsPromise]);
  } else {
    list = await listPromise;
    optionsRequestStartedAt = Date.now();
    options = await loadCurrentJobsOptionsForViewer(viewer);
  }

  const routeProximityLocationEnabled =
    await routeProximityLocationPreferencePromise;
  const scope = createOrganizationDataScope({
    organizationId: organizationAccess.activeOrganizationId,
    role: viewer.role,
    userId: viewer.userId,
  });

  const jobsSeed = createJobsListSeed(
    scope,
    list,
    listScope,
    listRequestStartedAt
  );
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
      listScope,
      options: seededOptions?.options ?? options,
      routeProximityLocationEnabled,
      viewer,
    };
  }

  return {
    dataPlaneSeeds: [jobsSeed, jobOptionsSeed],
    list,
    listScope,
    options,
    routeProximityLocationEnabled,
    viewer,
  };
}
