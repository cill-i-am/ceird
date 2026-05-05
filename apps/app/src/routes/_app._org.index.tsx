import type { OrganizationId, OrganizationRole } from "@ceird/identity-core";
import { createFileRoute } from "@tanstack/react-router";

import { AuthenticatedShellHome } from "#/features/auth/authenticated-shell-home";
import { assertOrganizationInternalRouteContext } from "#/features/organizations/organization-access";
import type { ActiveOrganizationSync } from "#/features/organizations/organization-access";

export const Route = createFileRoute("/_app/_org/")({
  staticData: {
    breadcrumb: {
      label: "Home",
      to: "/",
    },
  },
  beforeLoad: ({ context }) => loadOrganizationHomeRoute(context),
  component: AuthenticatedShellHome,
});

export function loadOrganizationHomeRoute(context: {
  readonly activeOrganizationId: OrganizationId;
  readonly activeOrganizationSync: ActiveOrganizationSync;
  readonly currentOrganizationRole?: OrganizationRole | undefined;
}) {
  assertOrganizationInternalRouteContext(context);
}
