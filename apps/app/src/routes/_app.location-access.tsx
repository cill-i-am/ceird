import { createFileRoute } from "@tanstack/react-router";

import { LocationAccessOnboardingPage } from "#/features/onboarding/location-access-onboarding-page";
import { loadLocationAccessRouteData } from "#/features/onboarding/location-access-route-loader";

export const Route = createFileRoute("/_app/location-access")({
  loader: () => loadLocationAccessRouteData(),
  component: LocationAccessRouteComponent,
});

function LocationAccessRouteComponent() {
  const { preferences, preferencesUnavailable } = Route.useLoaderData();

  return (
    <LocationAccessOnboardingPage
      initialPreferences={preferences}
      preferencesUnavailable={preferencesUnavailable}
    />
  );
}
