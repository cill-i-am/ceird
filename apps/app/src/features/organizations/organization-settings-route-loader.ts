import type { OrganizationId, OrganizationRole } from "@ceird/identity-core";

import { getCurrentServerLabels } from "#/features/api/app-api-server";
import type { ActiveOrganizationSync } from "#/features/organizations/organization-access";

interface SettingsRouteContext {
  readonly activeOrganizationId: OrganizationId;
  readonly activeOrganizationSync: ActiveOrganizationSync;
  readonly currentOrganizationRole?: OrganizationRole | undefined;
}

export function loadSettingsRoute(context: SettingsRouteContext) {
  if (context.activeOrganizationSync.required) {
    return {
      organizationLabels: [],
    };
  }

  return getCurrentServerLabels().then((labels) => ({
    organizationLabels: labels.labels,
  }));
}
