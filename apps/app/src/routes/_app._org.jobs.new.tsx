import { createFileRoute } from "@tanstack/react-router";

import { JobsCreateSheet } from "#/features/jobs/jobs-create-sheet";
import { assertOrganizationAdministrationRouteContext } from "#/features/organizations/organization-access";

export const Route = createFileRoute("/_app/_org/jobs/new")({
  staticData: {
    breadcrumb: {
      label: "New job",
      to: "/jobs/new",
    },
  },
  beforeLoad: ({ context }) => {
    assertOrganizationAdministrationRouteContext(context);
  },
  component: JobsCreateRoute,
});

function JobsCreateRoute() {
  return <JobsCreateSheet />;
}
