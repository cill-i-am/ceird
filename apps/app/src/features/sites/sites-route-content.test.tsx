import { decodeUserId } from "@ceird/identity-core";
import type { OrganizationId } from "@ceird/identity-core";
import type { SitesOptionsResponse } from "@ceird/sites-core";
import { render, screen } from "@testing-library/react";
import type { PropsWithChildren } from "react";

const stateProviderProbe = vi.hoisted(() => ({
  nextMountId: 0,
}));

vi.mock(import("#/data-plane/session"), () => ({
  useApplyDataPlaneSeeds: vi.fn<() => void>(),
}));

vi.mock(import("#/features/sites/sites-page"), () => ({
  SitesPage: () => <div data-testid="sites-page" />,
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
});
