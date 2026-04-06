import { createFileRoute } from "@tanstack/react-router";

import { redirectIfOrganizationReady } from "#/features/organizations/organization-access";
import { OrganizationOnboardingPage } from "#/features/organizations/organization-onboarding-page";

export const Route = createFileRoute("/_app/create-organization")({
  beforeLoad: redirectIfOrganizationReady,
  component: OrganizationOnboardingPage,
});
