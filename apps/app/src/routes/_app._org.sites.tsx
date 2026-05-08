import {
  Outlet,
  createFileRoute,
  useRouteContext,
} from "@tanstack/react-router";

import { SitesRouteContent } from "#/features/sites/sites-route-content";
import { loadSitesRouteData } from "#/features/sites/sites-route-loader";

export const Route = createFileRoute("/_app/_org/sites")({
  staticData: {
    breadcrumb: {
      label: "Sites",
      to: "/sites",
    },
  },
  codeSplitGroupings: [["loader", "component"]],
  loader: ({ context }) => loadSitesRouteData(context),
  component: SitesRoute,
});

function SitesRoute() {
  const { activeOrganizationId } = useRouteContext({
    from: "/_app/_org",
  });
  const { options, viewer } = Route.useLoaderData();

  return (
    <SitesRouteContent
      activeOrganizationId={activeOrganizationId}
      options={options}
      viewer={viewer}
    >
      <Outlet />
    </SitesRouteContent>
  );
}
