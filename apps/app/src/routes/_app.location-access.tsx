import { createFileRoute } from "@tanstack/react-router";

import { LocationAccessOnboardingPage } from "#/features/onboarding/location-access-onboarding-page";

export const Route = createFileRoute("/_app/location-access")({
  component: LocationAccessRouteComponent,
});

function LocationAccessRouteComponent() {
  return <LocationAccessOnboardingPage />;
}
