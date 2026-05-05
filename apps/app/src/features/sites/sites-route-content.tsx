import type { OrganizationId } from "@ceird/identity-core";
import type { SitesOptionsResponse } from "@ceird/sites-core";
import { RegistryProvider } from "@effect-atom/atom-react";
import type { ReactNode } from "react";

import type { OrganizationViewer } from "#/features/organizations/organization-viewer";
import { SitesPage } from "#/features/sites/sites-page";

import { seedSitesOptionsState, sitesOptionsStateAtom } from "./sites-state";

export function SitesRouteContent({
  activeOrganizationId,
  children,
  options,
  viewer,
}: {
  readonly activeOrganizationId: OrganizationId;
  readonly children?: ReactNode;
  readonly options: SitesOptionsResponse;
  readonly viewer: OrganizationViewer;
}) {
  return (
    <RegistryProvider
      key={activeOrganizationId}
      initialValues={[
        [
          sitesOptionsStateAtom,
          seedSitesOptionsState(activeOrganizationId, options),
        ],
      ]}
    >
      <SitesPage viewer={viewer}>{children}</SitesPage>
    </RegistryProvider>
  );
}
