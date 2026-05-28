import { render, screen } from "@testing-library/react";

import { JobsStateProvider } from "#/features/jobs/jobs-state";

import { WorkspaceSheetEventsProvider } from "./workspace-sheet-events";
import { WorkspaceSheetNavigationProvider } from "./workspace-sheet-navigation";
import { WorkspaceSheetStack } from "./workspace-sheet-stack";

const { mockedLoadJobsRouteData } = vi.hoisted(() => ({
  mockedLoadJobsRouteData: vi.fn<(...args: unknown[]) => unknown>(),
}));

vi.mock(import("@tanstack/react-router"), async (importActual) => {
  const actual = await importActual();

  return {
    ...actual,
    useNavigate: (() =>
      vi.fn<() => Promise<void>>(() =>
        Promise.resolve()
      )) as typeof actual.useNavigate,
    useRouteContext: (() => ({
      activeOrganizationId: "org_123",
      activeOrganizationSync: { required: false },
      currentOrganizationRole: "owner",
      currentUserId: "user_123",
      queryClient: undefined,
    })) as typeof actual.useRouteContext,
    useRouterState: (({ select }: { select: (state: unknown) => unknown }) =>
      select({
        location: { pathname: "/jobs" },
      })) as typeof actual.useRouterState,
  };
});

vi.mock(import("#/features/jobs/jobs-route-loader"), async (importActual) => {
  const actual = await importActual();
  const pendingJobsRouteData =
    Promise.withResolvers<
      Awaited<ReturnType<typeof actual.loadJobsRouteData>>
    >().promise;

  return {
    ...actual,
    loadJobsRouteData: mockedLoadJobsRouteData.mockImplementation(
      () => pendingJobsRouteData
    ) as typeof actual.loadJobsRouteData,
  };
});

describe("workspace sheet stack", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("renders skeleton loading state while a job sheet provider loads", () => {
    render(
      <WorkspaceSheetNavigationProvider
        stack={[
          {
            kind: "job.create",
            siteId: "019e6b6f-03d3-73e3-9dc6-d303722eef9a" as never,
          },
        ]}
      >
        <WorkspaceSheetStack
          stack={[
            {
              kind: "job.create",
              siteId: "019e6b6f-03d3-73e3-9dc6-d303722eef9a" as never,
            },
          ]}
        />
      </WorkspaceSheetNavigationProvider>
    );

    expect(screen.getByRole("dialog", { name: "Loading job" })).toBeVisible();
  });

  it("shares fallback route data loading across same-domain sheets", () => {
    const stack = [{ kind: "job.create" }, { kind: "job.create" }] as const;

    render(
      <WorkspaceSheetNavigationProvider stack={stack}>
        <WorkspaceSheetStack stack={stack} />
      </WorkspaceSheetNavigationProvider>
    );

    expect(mockedLoadJobsRouteData).toHaveBeenCalledOnce();
    expect(screen.getAllByRole("dialog", { name: "Loading job" })).toHaveLength(
      1
    );
  });

  it("reuses an existing jobs provider instead of loading route data again", () => {
    render(
      <JobsStateProvider
        activeOrganizationId={"org_123" as never}
        list={{ items: [], nextCursor: undefined }}
        options={{ contacts: [], labels: [], members: [], sites: [] }}
        viewer={{ role: "owner", userId: "user_123" as never }}
      >
        <WorkspaceSheetEventsProvider>
          <WorkspaceSheetNavigationProvider stack={[{ kind: "job.create" }]}>
            <WorkspaceSheetStack stack={[{ kind: "job.create" }]} />
          </WorkspaceSheetNavigationProvider>
        </WorkspaceSheetEventsProvider>
      </JobsStateProvider>
    );

    expect(mockedLoadJobsRouteData).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "New job" })).toBeVisible();
  });

  it("only renders the top sheet drawer when sheets are stacked", () => {
    const stack = [{ kind: "job.create" }, { kind: "job.create" }] as const;

    render(
      <JobsStateProvider
        activeOrganizationId={"org_123" as never}
        list={{ items: [], nextCursor: undefined }}
        options={{ contacts: [], labels: [], members: [], sites: [] }}
        viewer={{ role: "owner", userId: "user_123" as never }}
      >
        <WorkspaceSheetEventsProvider>
          <WorkspaceSheetNavigationProvider stack={stack}>
            <WorkspaceSheetStack stack={stack} />
          </WorkspaceSheetNavigationProvider>
        </WorkspaceSheetEventsProvider>
      </JobsStateProvider>
    );

    expect(screen.getAllByRole("dialog", { name: "New job" })).toHaveLength(1);
  });
});
