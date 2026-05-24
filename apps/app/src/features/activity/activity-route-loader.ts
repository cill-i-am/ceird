import type { OrganizationId, OrganizationRole } from "@ceird/identity-core";
import type {
  JobMemberOptionsResponse,
  OrganizationActivityListResponse,
} from "@ceird/jobs-core";

import type { ActivitySearch } from "#/features/activity/activity-search";
import { toOrganizationActivityQuery } from "#/features/activity/activity-search";
import {
  getCurrentServerJobMemberOptions,
  listCurrentServerOrganizationActivity,
} from "#/features/jobs/jobs-server";
import {
  assertOrganizationAdministrationRole,
  requireOrganizationRouteContextRole,
} from "#/features/organizations/organization-route-access";
import type { ActiveOrganizationSync } from "#/features/organizations/organization-route-access";

const EMPTY_ACTIVITY: OrganizationActivityListResponse = {
  items: [],
  nextCursor: undefined,
};

const EMPTY_OPTIONS: JobMemberOptionsResponse = {
  members: [],
};

interface ActivityRouteOrganizationAccess {
  readonly activeOrganizationId: OrganizationId;
  readonly activeOrganizationSync: ActiveOrganizationSync;
  readonly currentOrganizationRole?: OrganizationRole | undefined;
}

export async function loadActivityRouteData(
  context: ActivityRouteOrganizationAccess,
  search: ActivitySearch
) {
  if (context.activeOrganizationSync.required) {
    return {
      activity: EMPTY_ACTIVITY,
      options: EMPTY_OPTIONS,
    };
  }

  const role = requireOrganizationRouteContextRole(context);

  assertOrganizationAdministrationRole({ role });

  const [activity, options] = await Promise.all([
    listCurrentServerOrganizationActivity(toOrganizationActivityQuery(search)),
    getCurrentServerJobMemberOptions(),
  ]);

  return {
    activity,
    options,
  };
}
