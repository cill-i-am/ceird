import { createFileRoute, useRouteContext } from "@tanstack/react-router";

import { UserSettingsPage } from "#/features/settings/user-settings-page";
import { loadUserSettingsRouteData } from "#/features/settings/user-settings-route-loader";
import { decodeUserSettingsSearch } from "#/features/settings/user-settings-search";

export const Route = createFileRoute("/_app/settings")({
  staticData: {
    breadcrumb: {
      label: "Settings",
    },
  },
  codeSplitGroupings: [["loader"], ["component"]],
  validateSearch: decodeUserSettingsSearch,
  loader: () => loadUserSettingsRouteData(),
  component: SettingsRoute,
});

function SettingsRoute() {
  const { currentOrganizationRole, session } = useRouteContext({
    from: "/_app",
  });
  const { preferences, preferencesUnavailable } = Route.useLoaderData();
  const { emailChange } = Route.useSearch();

  return (
    <UserSettingsPage
      user={session.user}
      currentOrganizationRole={currentOrganizationRole}
      emailChangeStatus={emailChange}
      preferences={preferences}
      preferencesUnavailable={preferencesUnavailable}
    />
  );
}
