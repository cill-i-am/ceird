import { createFileRoute } from "@tanstack/react-router";

import { JobsCreateSheet } from "#/features/jobs/jobs-create-sheet";
import { requireOrganizationAdministrationAccess } from "#/features/organizations/organization-access";

export const Route = createFileRoute("/_app/_org/jobs/new")({
  beforeLoad: async () => {
    await requireOrganizationAdministrationAccess();
  },
  component: JobsCreateRoute,
});

function JobsCreateRoute() {
  return <JobsCreateSheet />;
}
