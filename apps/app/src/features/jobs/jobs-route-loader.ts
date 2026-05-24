import type {
  JobContactOption,
  JobDetailResponse,
  JobListResponse,
  JobOptionsResponse,
} from "@ceird/jobs-core";
import type { Label } from "@ceird/labels-core";
import type { ServiceAreaOption, SiteOption } from "@ceird/sites-core";
import type { QueryClient } from "@tanstack/query-core";

import {
  getCurrentServerJobDetail,
  getCurrentServerJobOptions,
  listAllCurrentServerJobs,
} from "#/features/jobs/jobs-server";
import {
  canUseInternalJobOptions,
  decodeJobsViewerUserId,
  isExternalJobsViewer,
} from "#/features/jobs/jobs-viewer";
import type { JobsViewer } from "#/features/jobs/jobs-viewer";
import { requireOrganizationRouteContextRole } from "#/features/organizations/organization-route-access";
import type { OrganizationProductRouteContext } from "#/features/organizations/organization-route-access";
import { seedRouteQueryData } from "#/lib/tanstack-db-query";

import { organizationJobsQueryKey } from "./jobs-query-keys";

const EMPTY_JOBS_OPTIONS: JobOptionsResponse = {
  contacts: [],
  labels: [],
  members: [],
  serviceAreas: [],
  sites: [],
};

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
      list: EMPTY_JOBS_LIST,
      options: EMPTY_JOBS_OPTIONS,
      viewer: {
        role: "member",
        userId: decodeJobsViewerUserId(organizationAccess.currentUserId),
      } satisfies JobsViewer,
    };
  }

  const listRequestStartedAt = Date.now();
  const listPromise = listAllCurrentServerJobs({});
  const activeRole = requireOrganizationRouteContextRole(organizationAccess);
  const viewer = {
    role: activeRole,
    userId: decodeJobsViewerUserId(organizationAccess.currentUserId),
  } satisfies JobsViewer;
  const internalOptionsPromise = canUseInternalJobOptions(viewer)
    ? getCurrentServerJobOptions()
    : undefined;
  const list = await listPromise;
  let options = EMPTY_JOBS_OPTIONS;

  if (internalOptionsPromise) {
    options = await internalOptionsPromise;
  } else if (isExternalJobsViewer(viewer)) {
    options = await loadExternalJobsScopedOptions(list);
  }

  if (organizationAccess.queryClient) {
    const seededItems = seedRouteQueryData(
      organizationAccess.queryClient,
      organizationJobsQueryKey({
        organizationId: organizationAccess.activeOrganizationId,
        role: viewer.role,
        userId: viewer.userId,
      }),
      list.items,
      {
        requestStartedAt: listRequestStartedAt,
      }
    );

    return {
      list: {
        ...list,
        items: seededItems,
      },
      options,
      viewer,
    };
  }

  return {
    list,
    options,
    viewer,
  };
}

async function loadExternalJobsScopedOptions(
  list: JobListResponse
): Promise<JobOptionsResponse> {
  const details = await Promise.all(
    list.items.map((item) => getCurrentServerJobDetail(item.id))
  );

  return deriveExternalJobsScopedOptions(details);
}

function deriveExternalJobsScopedOptions(
  details: readonly JobDetailResponse[]
): JobOptionsResponse {
  const contactsById = new Map<JobContactOption["id"], JobContactOption>();
  const labelsById = new Map<Label["id"], Label>();
  const serviceAreasById = new Map<
    ServiceAreaOption["id"],
    ServiceAreaOption
  >();
  const sitesById = new Map<SiteOption["id"], SiteOption>();

  for (const detail of details) {
    for (const label of detail.job.labels) {
      labelsById.set(label.id, label);
    }

    if (detail.site !== undefined) {
      sitesById.set(detail.site.id, detail.site);

      const { serviceAreaId, serviceAreaName } = detail.site;

      if (serviceAreaId !== undefined && serviceAreaName !== undefined) {
        serviceAreasById.set(serviceAreaId, {
          id: serviceAreaId,
          name: serviceAreaName,
        });
      }
    }

    if (detail.contact !== undefined) {
      contactsById.set(detail.contact.id, {
        email: detail.contact.email,
        id: detail.contact.id,
        name: detail.contact.name,
        phone: detail.contact.phone,
        siteIds: detail.job.siteId === undefined ? [] : [detail.job.siteId],
      });
    }
  }

  return {
    contacts: [...contactsById.values()],
    labels: [...labelsById.values()],
    members: [],
    serviceAreas: [...serviceAreasById.values()],
    sites: [...sitesById.values()],
  };
}
