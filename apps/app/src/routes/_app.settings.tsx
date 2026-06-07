import { createFileRoute, useRouteContext } from "@tanstack/react-router";

import { UserSettingsPage } from "#/features/settings/user-settings-page";
import { decodeUserSettingsSearch } from "#/features/settings/user-settings-search";

export const Route = createFileRoute("/_app/settings")({
  staticData: {
    breadcrumb: {
      label: "Settings",
    },
  },
  codeSplitGroupings: [["component"]],
  validateSearch: decodeUserSettingsSearch,
  component: SettingsRoute,
});

function SettingsRoute() {
  const { currentOrganizationRole, session } = useRouteContext({
    from: "/_app",
  });
  const { emailChange } = Route.useSearch();

  return (
    <UserSettingsPage
      user={session.user}
      currentOrganizationRole={currentOrganizationRole}
      emailChangeStatus={emailChange}
    />
  );
}
