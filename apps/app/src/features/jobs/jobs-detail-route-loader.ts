import type { OrganizationRole } from "@ceird/identity-core";
import { WorkItemId } from "@ceird/jobs-core";
import type { WorkItemIdType } from "@ceird/jobs-core";
import { Schema } from "effect";

import { getCurrentServerJobDetail } from "#/features/jobs/jobs-server";
import {
  assertOrganizationAdministrationRouteContext,
  requireOrganizationAdministrationAccess,
} from "#/features/organizations/organization-access";
import type { ActiveOrganizationSync } from "#/features/organizations/organization-access";

import { CREATE_JOB_ROUTE_DATA } from "./jobs-detail-route-data";
import type { CreateJobRouteData } from "./jobs-detail-route-data";

const decodeWorkItemId = Schema.decodeUnknownSync(WorkItemId);

export type JobDetailRouteData =
  | Awaited<ReturnType<typeof getCurrentServerJobDetail>>
  | null
  | CreateJobRouteData;

export function loadJobDetailRouteData(
  workItemId: string | WorkItemIdType,
  organizationAccess?: {
    readonly activeOrganizationSync: ActiveOrganizationSync;
    readonly currentOrganizationRole?: OrganizationRole | undefined;
  }
): Promise<JobDetailRouteData> {
  if (workItemId === "new") {
    if (organizationAccess !== undefined) {
      assertOrganizationAdministrationRouteContext(organizationAccess);
      return Promise.resolve(CREATE_JOB_ROUTE_DATA);
    }

    return requireOrganizationAdministrationAccess().then(
      () => CREATE_JOB_ROUTE_DATA
    );
  }

  const decodedWorkItemId = decodeWorkItemId(workItemId);

  if (organizationAccess?.activeOrganizationSync.required) {
    return Promise.resolve(null);
  }

  return getCurrentServerJobDetail(decodedWorkItemId);
}
