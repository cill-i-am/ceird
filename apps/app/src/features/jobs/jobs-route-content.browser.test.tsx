import { decodeUserId } from "@ceird/identity-core";
import type { OrganizationId } from "@ceird/identity-core";
import type { JobListResponse, JobOptionsResponse } from "@ceird/jobs-core";
import { render, screen } from "@testing-library/react";
import type { PropsWithChildren } from "react";

const stateProviderProbe = vi.hoisted(() => ({
  nextMountId: 0,
}));

vi.mock(import("#/data-plane/session"), () => ({
  useApplyDataPlaneSeeds: vi.fn<() => void>(),
}));

vi.mock(import("#/features/jobs/jobs-page"), () => ({
  JobsPage: () => <div data-testid="jobs-page" />,
}));

vi.mock(import("#/features/workspace-sheets/workspace-sheet-stack"), () => ({
  WorkspaceSheetStack: () => <div data-testid="workspace-sheet-stack" />,
}));

vi.mock(import("#/features/jobs/jobs-state"), async () => {
  const React = await import("react");

  return {
    JobsStateProvider: ({ children }: PropsWithChildren) => {
      const [mountId] = React.useState(() => {
        stateProviderProbe.nextMountId += 1;
        return stateProviderProbe.nextMountId;
      });

      return (
        <div data-testid="jobs-state-provider" data-mount-id={mountId}>
          {children}
        </div>
      );
    },
  };
});

describe("JobsRouteContent", () => {
  it("remounts scoped state when viewer role changes inside the same organization", async () => {
    const { JobsRouteContent } = await import("./jobs-route-content");
    const organizationId = "org_123" as OrganizationId;
    const list = {
      items: [],
      nextCursor: undefined,
    } satisfies JobListResponse;
    const options = {
      contacts: [],
      labels: [],
      members: [],
      sites: [],
    } satisfies JobOptionsResponse;
    const userId = decodeUserId("user_123");
    const { rerender } = render(
      <JobsRouteContent
        activeOrganizationId={organizationId}
        list={list}
        options={options}
        routeProximityLocationPreferenceStatus="unavailable"
        viewer={{ role: "owner", userId }}
      />
    );
    const firstMountId = screen.getByTestId("jobs-state-provider").dataset
      .mountId;

    rerender(
      <JobsRouteContent
        activeOrganizationId={organizationId}
        list={list}
        options={options}
        routeProximityLocationPreferenceStatus="unavailable"
        viewer={{ role: "external", userId }}
      />
    );

    expect(screen.getByTestId("jobs-state-provider").dataset.mountId).not.toBe(
      firstMountId
    );
  });
});
