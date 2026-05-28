import { createFileRoute } from "@tanstack/react-router";

import {
  loadOrganizationHomeDashboardRouteData,
  loadOrganizationHomeRoute,
} from "#/features/auth/authenticated-home-route-loader";
import { AuthenticatedShellHome } from "#/features/auth/authenticated-shell-home";

export const Route = createFileRoute("/_app/_org/")({
  staticData: {
    breadcrumb: {
      label: "Home",
      to: "/",
    },
  },
  codeSplitGroupings: [["loader", "component"]],
  beforeLoad: ({ context }) => loadOrganizationHomeRoute(context),
  loader: ({ context }) => loadOrganizationHomeDashboardRouteData(context),
  component: OrganizationHomeRoute,
});

function OrganizationHomeRoute() {
  const dashboard = Route.useLoaderData();
  const { sheets } = Route.useSearch();

  return (
    <AuthenticatedShellHome
      dashboard={dashboard}
      routeHotkeysEnabled={(sheets ?? []).length === 0}
    />
  );
}
