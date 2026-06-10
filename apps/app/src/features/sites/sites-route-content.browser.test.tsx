import { decodeUserId } from "@ceird/identity-core";
import type { OrganizationId } from "@ceird/identity-core";
import type { SitesOptionsResponse } from "@ceird/sites-core";
import { render, screen } from "@testing-library/react";
import type { ComponentProps, PropsWithChildren } from "react";

import type { SitesPage } from "#/features/sites/sites-page";

const stateProviderProbe = vi.hoisted(() => ({
  nextMountId: 0,
  sitesPageProps: [] as ComponentProps<typeof SitesPage>[],
}));

vi.mock(import("#/data-plane/session"), () => ({
  useApplyDataPlaneSeeds: vi.fn<() => void>(),
}));

vi.mock(import("#/features/sites/sites-page"), () => ({
  SitesPage: (props: ComponentProps<typeof SitesPage>) => {
    stateProviderProbe.sitesPageProps.push(props);

    return <div data-testid="sites-page" />;
  },
}));

vi.mock(import("#/features/workspace-sheets/workspace-sheet-stack"), () => ({
  WorkspaceSheetStack: () => <div data-testid="workspace-sheet-stack" />,
}));

vi.mock(import("./sites-state"), async () => {
  const React = await import("react");

  return {
    SitesStateProvider: ({ children }: PropsWithChildren) => {
      const [mountId] = React.useState(() => {
        stateProviderProbe.nextMountId += 1;
        return stateProviderProbe.nextMountId;
      });

      return (
        <div data-testid="sites-state-provider" data-mount-id={mountId}>
          {children}
        </div>
      );
    },
  };
});

describe("SitesRouteContent", () => {
  afterEach(() => {
    stateProviderProbe.sitesPageProps = [];
  });

  it("remounts scoped state when viewer user changes inside the same organization", async () => {
    const { SitesRouteContent } = await import("./sites-route-content");
    const organizationId = "org_123" as OrganizationId;
    const options = {
      sites: [],
    } satisfies SitesOptionsResponse;
    const firstUserId = decodeUserId("user_123");
    const secondUserId = decodeUserId("user_456");
    const { rerender } = render(
      <SitesRouteContent
        activeOrganizationId={organizationId}
        options={options}
        viewer={{ role: "owner", userId: firstUserId }}
      />
    );
    const firstMountId = screen.getByTestId("sites-state-provider").dataset
      .mountId;

    rerender(
      <SitesRouteContent
        activeOrganizationId={organizationId}
        options={options}
        viewer={{ role: "owner", userId: secondUserId }}
      />
    );

    expect(screen.getByTestId("sites-state-provider").dataset.mountId).not.toBe(
      firstMountId
    );
  });

  it("forwards URL-backed view mode controls to the sites page", async () => {
    const { SitesRouteContent } = await import("./sites-route-content");
    const organizationId = "org_123" as OrganizationId;
    const options = {
      sites: [],
    } satisfies SitesOptionsResponse;
    const onViewModeChange =
      vi.fn<
        NonNullable<ComponentProps<typeof SitesPage>["onViewModeChange"]>
      >();

    render(
      <SitesRouteContent
        activeOrganizationId={organizationId}
        onViewModeChange={onViewModeChange}
        options={options}
        viewMode="map"
        viewer={{ role: "owner", userId: decodeUserId("user_123") }}
      />
    );

    expect(stateProviderProbe.sitesPageProps).toMatchObject([
      {
        onViewModeChange,
        routeHotkeysEnabled: true,
        viewMode: "map",
      },
    ]);
  });
});
