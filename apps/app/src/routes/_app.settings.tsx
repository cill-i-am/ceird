import { createFileRoute, useRouteContext } from "@tanstack/react-router";

import { UserSettingsPage } from "#/features/settings/user-settings-page";

export const Route = createFileRoute("/_app/settings")({
  staticData: {
    breadcrumb: {
      label: "Settings",
    },
  },
  validateSearch: (search: Record<string, unknown>) => ({
    emailChange: search.emailChange === "verified" ? "verified" : undefined,
  }),
  component: SettingsRoute,
});

function SettingsRoute() {
  const { session } = useRouteContext({ from: "/_app" });
  const { emailChange } = Route.useSearch();

  return (
    <UserSettingsPage user={session.user} emailChangeStatus={emailChange} />
  );
}
