import type { OrganizationId } from "@ceird/identity-core";
import type { SitesOptionsResponse } from "@ceird/sites-core";
import type { QueryClient } from "@tanstack/query-core";
import type { ReactNode } from "react";

import type { OrganizationViewer } from "#/features/organizations/organization-viewer";
import { SitesPage } from "#/features/sites/sites-page";

import { SitesStateProvider } from "./sites-state";

export function SitesRouteContent({
  activeOrganizationId,
  children,
  options,
  queryClient,
  viewer,
}: {
  readonly activeOrganizationId: OrganizationId;
  readonly children?: ReactNode;
  readonly options: SitesOptionsResponse;
  readonly queryClient?: QueryClient | undefined;
  readonly viewer: OrganizationViewer;
}) {
  return (
    <SitesStateProvider
      key={activeOrganizationId}
      activeOrganizationId={activeOrganizationId}
      options={options}
      queryClient={queryClient}
      viewer={viewer}
    >
      <SitesPage viewer={viewer}>{children}</SitesPage>
    </SitesStateProvider>
  );
}
