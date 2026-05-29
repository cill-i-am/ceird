import { act, fireEvent, render, screen } from "@testing-library/react";

import { JobsStateProvider } from "#/features/jobs/jobs-state";

import { WorkspaceSheetEventsProvider } from "./workspace-sheet-events";
import { WorkspaceSheetNavigationProvider } from "./workspace-sheet-navigation";
import type { WorkspaceSheet } from "./workspace-sheet-search";
import { WorkspaceSheetStack } from "./workspace-sheet-stack";

const EMPTY_JOBS_LIST = { items: [], nextCursor: undefined };
const EMPTY_JOBS_OPTIONS = {
  contacts: [],
  labels: [],
  members: [],
  sites: [],
};
const OWNER_VIEWER = { role: "owner" as const, userId: "user_123" as never };

const {
  getDeferredSitesRouteData,
  mockedLoadJobsRouteData,
  mockedLoadSitesRouteData,
  resetDeferredSitesRouteData,
} = vi.hoisted(() => {
  let deferredSitesRouteData = Promise.withResolvers<unknown>();

  return {
    getDeferredSitesRouteData: () => deferredSitesRouteData,
    mockedLoadJobsRouteData: vi.fn<(...args: unknown[]) => unknown>(),
    mockedLoadSitesRouteData: vi.fn<(...args: unknown[]) => unknown>(),
    resetDeferredSitesRouteData: () => {
      deferredSitesRouteData = Promise.withResolvers<unknown>();
    },
  };
});

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

vi.mock(import("#/features/sites/sites-route-loader"), async (importActual) => {
  const actual = await importActual();

  return {
    ...actual,
    loadSitesRouteData: mockedLoadSitesRouteData.mockImplementation(
      () => getDeferredSitesRouteData().promise
    ) as typeof actual.loadSitesRouteData,
  };
});

describe("workspace sheet stack", () => {
  afterEach(() => {
    vi.clearAllMocks();
    resetDeferredSitesRouteData();
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

  it("renders the immediate parent sheet as live Vaul drawer content", async () => {
    const stack = [{ kind: "job.create" }, { kind: "site.create" }] as const;

    render(renderStackWithJobsProvider(stack));

    await act(async () => {
      await Promise.resolve();
    });

    expect(
      screen.queryByTestId("workspace-sheet-background")
    ).not.toBeInTheDocument();
    expect(
      screen.getByText("New site").closest("[data-vaul-drawer]")
    ).toHaveAttribute("data-workspace-sheet-interactive", "true");
    expect(
      screen.getByText("New job").closest("[data-vaul-drawer]")
    ).toHaveAttribute("data-workspace-sheet-interactive", "false");
  });

  it("keeps an inactive parent sheet draft when a nested domain provider resolves", async () => {
    const parentStack = [{ kind: "job.create" }] as const;
    const nestedStack = [
      { kind: "job.create" },
      { kind: "site.create" },
    ] as const;
    const view = render(renderStackWithJobsProvider(parentStack));

    act(() => {
      fireEvent.change(screen.getByLabelText("Title"), {
        target: { value: "Replace boiler relay" },
      });
    });

    await act(async () => {
      view.rerender(renderStackWithJobsProvider(nestedStack));
      await Promise.resolve();
    });

    const loadingSiteDialog = screen.getByRole("dialog", { name: "New site" });

    expect(loadingSiteDialog).toBeVisible();
    expect(
      screen.queryByTestId("workspace-sheet-background")
    ).not.toBeInTheDocument();
    expect(
      screen.getByText("New job").closest("[data-vaul-drawer]")
    ).toHaveAttribute("data-workspace-sheet-interactive", "false");
    expect(
      screen.queryByRole("dialog", { name: "Loading site" })
    ).not.toBeInTheDocument();
    expect(
      screen.getAllByTestId("sites-create-sheet-skeleton-row")
    ).not.toHaveLength(0);

    await act(async () => {
      const deferredSitesRouteData = getDeferredSitesRouteData();

      deferredSitesRouteData.resolve({
        options: { sites: [] },
        viewer: { role: "owner", userId: "user_123" },
      });
      await deferredSitesRouteData.promise;
    });

    const siteDialog = await screen.findByRole("dialog", { name: "New site" });
    expect(siteDialog).toBeVisible();
    expect(
      screen.queryByTestId("sites-create-sheet-skeleton-row")
    ).not.toBeInTheDocument();

    await act(async () => {
      view.rerender(renderStackWithJobsProvider(parentStack));
      await Promise.resolve();
    });

    expect(screen.getByLabelText("Title")).toHaveValue("Replace boiler relay");
  });
});

function renderStackWithJobsProvider(stack: readonly WorkspaceSheet[]) {
  return (
    <JobsStateProvider
      activeOrganizationId={"org_123" as never}
      list={EMPTY_JOBS_LIST}
      options={EMPTY_JOBS_OPTIONS}
      viewer={OWNER_VIEWER}
    >
      <WorkspaceSheetEventsProvider>
        <WorkspaceSheetNavigationProvider stack={stack}>
          <WorkspaceSheetStack stack={stack} />
        </WorkspaceSheetNavigationProvider>
      </WorkspaceSheetEventsProvider>
    </JobsStateProvider>
  );
}
