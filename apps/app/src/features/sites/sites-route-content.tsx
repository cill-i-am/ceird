import { RegistryProvider } from "@effect-atom/atom-react";
import type { OrganizationId } from "@task-tracker/identity-core";
import type { JobOptionsResponse } from "@task-tracker/jobs-core";
import type { ReactNode } from "react";

import {
  jobsOptionsStateAtom,
  seedJobsOptionsState,
} from "#/features/jobs/jobs-state";
import type { JobsViewer } from "#/features/jobs/jobs-viewer";
import { SitesPage } from "#/features/sites/sites-page";

export function SitesRouteContent({
  activeOrganizationId,
  children,
  options,
  viewer,
}: {
  readonly activeOrganizationId: OrganizationId;
  readonly children?: ReactNode;
  readonly options: JobOptionsResponse;
  readonly viewer: JobsViewer;
}) {
  return (
    <RegistryProvider
      key={activeOrganizationId}
      initialValues={[
        [
          jobsOptionsStateAtom,
          seedJobsOptionsState(activeOrganizationId, options),
        ],
      ]}
    >
      <SitesPage viewer={viewer}>{children}</SitesPage>
    </RegistryProvider>
  );
}
