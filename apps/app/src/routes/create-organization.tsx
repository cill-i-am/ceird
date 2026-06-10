import { createFileRoute, useRouteContext } from "@tanstack/react-router";

import { redirectIfOrganizationReady } from "#/features/organizations/organization-access";
import { OrganizationActiveSyncBoundary } from "#/features/organizations/organization-active-sync-boundary";
import { OrganizationOnboardingPage } from "#/features/organizations/organization-onboarding-page";

export const Route = createFileRoute("/create-organization")({
  beforeLoad: redirectIfOrganizationReady,
  component: CreateOrganizationRouteComponent,
});

function CreateOrganizationRouteComponent() {
  const { activeOrganizationSync } = useRouteContext({
    from: "/create-organization",
  });

  return (
    <OrganizationActiveSyncBoundary
      activeOrganizationSync={activeOrganizationSync}
    >
      <OrganizationOnboardingPage />
    </OrganizationActiveSyncBoundary>
  );
}
