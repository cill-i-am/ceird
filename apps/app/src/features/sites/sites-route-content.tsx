import type { OrganizationId } from "@ceird/identity-core";
import type { SitesOptionsResponse } from "@ceird/sites-core";
import type { QueryClient } from "@tanstack/query-core";

import type { OrganizationViewer } from "#/features/organizations/organization-viewer";
import { SitesPage } from "#/features/sites/sites-page";
import type { WorkspaceSheet } from "#/features/workspace-sheets/workspace-sheet-search";
import { WorkspaceSheetStack } from "#/features/workspace-sheets/workspace-sheet-stack";

import { SitesStateProvider } from "./sites-state";

export function SitesRouteContent({
  activeOrganizationId,
  options,
  queryClient,
  stack = [],
  viewer,
}: {
  readonly activeOrganizationId: OrganizationId;
  readonly options: SitesOptionsResponse;
  readonly queryClient?: QueryClient | undefined;
  readonly stack?: readonly WorkspaceSheet[] | undefined;
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
      <SitesPage routeHotkeysEnabled={stack.length === 0} viewer={viewer} />
      <WorkspaceSheetStack stack={stack} />
    </SitesStateProvider>
  );
}
