import { createFileRoute } from "@tanstack/react-router";

import { requireAuthenticatedSession } from "#/features/auth/require-authenticated-session";
import { LocationAccessOnboardingPage } from "#/features/onboarding/location-access-onboarding-page";
import { loadLocationAccessRouteData } from "#/features/onboarding/location-access-route-loader";

export const Route = createFileRoute("/location-access")({
  beforeLoad: () => requireAuthenticatedSession(),
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
