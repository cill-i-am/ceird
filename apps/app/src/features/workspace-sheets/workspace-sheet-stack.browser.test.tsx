import type * as RouterModule from "@tanstack/react-router";
import { act, fireEvent, render, screen } from "@testing-library/react";

import type * as JobsCreateSheetModule from "#/features/jobs/jobs-create-sheet";
import type * as JobsDetailRouteLoaderModule from "#/features/jobs/jobs-detail-route-loader";
import type * as JobsDetailSheetModule from "#/features/jobs/jobs-detail-sheet";
import type * as JobsRouteLoaderModule from "#/features/jobs/jobs-route-loader";
import type * as JobsStateModule from "#/features/jobs/jobs-state";
import type * as SitesCreateSheetModule from "#/features/sites/sites-create-sheet";
import type * as SitesDetailRouteLoaderModule from "#/features/sites/sites-detail-route-loader";
import type * as SitesDetailSheetModule from "#/features/sites/sites-detail-sheet";
import type * as SitesRouteLoaderModule from "#/features/sites/sites-route-loader";
import type * as SitesStateModule from "#/features/sites/sites-state";

import { WorkspaceSheetEventsProvider } from "./workspace-sheet-events";
import { WorkspaceSheetNavigationProvider } from "./workspace-sheet-navigation";
import type { WorkspaceSheet } from "./workspace-sheet-search";
import type * as WorkspaceSheetStackModule from "./workspace-sheet-stack";

type JobsViewer = ReturnType<typeof JobsStateModule.useJobsViewer>;
type SitesViewer = ReturnType<typeof SitesStateModule.useSitesViewer>;

const OWNER_VIEWER = { role: "owner" as const, userId: "user_123" as never };
let WorkspaceSheetStack: typeof WorkspaceSheetStackModule.WorkspaceSheetStack;

const { mockedJobsState, mockedSitesState } = vi.hoisted(() => ({
  mockedJobsState: {
    existingViewer: undefined as JobsViewer | undefined,
  },
  mockedSitesState: {
    existingViewer: undefined as SitesViewer | undefined,
  },
}));

const {
  getDeferredSitesRouteData,
  mockedLoadJobsRouteData,
  mockedLoadSitesRouteData,
  resetDeferredSitesRouteData,
} = vi.hoisted(() => {
  let deferredSitesRouteData =
    Promise.withResolvers<
      Awaited<ReturnType<typeof SitesRouteLoaderModule.loadSitesRouteData>>
    >();

  return {
    getDeferredSitesRouteData: () => deferredSitesRouteData,
    mockedLoadJobsRouteData:
      vi.fn<typeof JobsRouteLoaderModule.loadJobsRouteData>(),
    mockedLoadSitesRouteData:
      vi.fn<typeof SitesRouteLoaderModule.loadSitesRouteData>(),
    resetDeferredSitesRouteData: () => {
      deferredSitesRouteData =
        Promise.withResolvers<
          Awaited<ReturnType<typeof SitesRouteLoaderModule.loadSitesRouteData>>
        >();
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
      )) as typeof RouterModule.useNavigate,
    useRouteContext: (() => ({
      activeOrganizationId: "org_123",
      activeOrganizationSync: { required: false },
      currentOrganizationRole: "owner",
      currentUserId: "user_123",
      queryClient: undefined,
    })) as typeof RouterModule.useRouteContext,
    useRouterState: (({ select }: { select: (state: unknown) => unknown }) =>
      select({
        location: { pathname: "/jobs" },
      })) as typeof RouterModule.useRouterState,
  };
});

vi.mock(import("#/features/jobs/jobs-route-loader"), () => {
  const pendingJobsRouteData =
    Promise.withResolvers<
      Awaited<ReturnType<typeof JobsRouteLoaderModule.loadJobsRouteData>>
    >().promise;

  return {
    loadJobsRouteData: mockedLoadJobsRouteData.mockImplementation(
      () => pendingJobsRouteData
    ),
  };
});

vi.mock(import("#/features/jobs/jobs-detail-route-loader"), () => ({
  loadJobDetailRouteData:
    vi.fn<typeof JobsDetailRouteLoaderModule.loadJobDetailRouteData>(),
}));

vi.mock(import("#/features/jobs/jobs-state"), async () => {
  const React = await import("react");
  const JobsViewerContext = React.createContext<JobsViewer | undefined>(
    undefined
  );

  return {
    JobsStateProvider: (({
      children,
      viewer,
    }: Parameters<typeof JobsStateModule.JobsStateProvider>[0]) => (
      <JobsViewerContext.Provider value={viewer}>
        {children}
      </JobsViewerContext.Provider>
    )) as typeof JobsStateModule.JobsStateProvider,
    useJobsViewer: (() =>
      React.use(JobsViewerContext) ??
      mockedJobsState.existingViewer ??
      ({
        role: "owner",
        userId: "user_123" as never,
      } as JobsViewer)) as typeof JobsStateModule.useJobsViewer,
    useOptionalJobsViewer: (() =>
      React.use(JobsViewerContext) ??
      mockedJobsState.existingViewer) as typeof JobsStateModule.useOptionalJobsViewer,
  };
});

vi.mock(import("#/features/jobs/jobs-create-sheet"), async () => {
  const React = await import("react");

  return {
    JobsCreateSheet: (({
      nestedSheet,
      sheetLayer = "active",
    }: Parameters<typeof JobsCreateSheetModule.JobsCreateSheet>[0] = {}) => {
      const [title, setTitle] = React.useState("");

      return (
        <dialog
          aria-label="New job"
          data-vaul-drawer=""
          data-workspace-sheet-interactive={
            sheetLayer === "active" ? "true" : "false"
          }
          open
        >
          <h2>New job</h2>
          <label>
            Title
            <input
              aria-label="Title"
              value={title}
              onChange={(event) => setTitle(event.currentTarget.value)}
            />
          </label>
          {nestedSheet}
        </dialog>
      );
    }) as typeof JobsCreateSheetModule.JobsCreateSheet,
  };
});

vi.mock(import("#/features/jobs/jobs-detail-sheet"), () => ({
  JobsDetailSheet: (() => (
    <div data-testid="jobs-detail-sheet" />
  )) as typeof JobsDetailSheetModule.JobsDetailSheet,
}));

vi.mock(import("#/features/sites/sites-route-loader"), () => ({
  loadSitesRouteData: mockedLoadSitesRouteData.mockImplementation(
    () => getDeferredSitesRouteData().promise
  ),
}));

vi.mock(import("#/features/sites/sites-detail-route-loader"), () => ({
  loadSiteDetailRouteData:
    vi.fn<typeof SitesDetailRouteLoaderModule.loadSiteDetailRouteData>(),
}));

vi.mock(import("#/features/sites/sites-state"), async () => {
  const React = await import("react");
  const SitesViewerContext = React.createContext<SitesViewer | undefined>(
    undefined
  );

  return {
    SitesStateProvider: (({
      children,
      viewer,
    }: Parameters<typeof SitesStateModule.SitesStateProvider>[0]) => (
      <SitesViewerContext.Provider value={viewer}>
        {children}
      </SitesViewerContext.Provider>
    )) as typeof SitesStateModule.SitesStateProvider,
    useOptionalSitesViewer: (() =>
      React.use(SitesViewerContext) ??
      mockedSitesState.existingViewer) as typeof SitesStateModule.useOptionalSitesViewer,
    useSitesOptions: (() => ({
      sites: [],
    })) as typeof SitesStateModule.useSitesOptions,
    useSitesViewer: (() =>
      React.use(SitesViewerContext) ??
      mockedSitesState.existingViewer ??
      ({
        role: "owner",
        userId: "user_123" as never,
      } as SitesViewer)) as typeof SitesStateModule.useSitesViewer,
  };
});

vi.mock(import("#/features/sites/sites-create-sheet"), () => {
  const SitesCreateSheetRoot = (({
    children,
    nestedSheet,
    sheetLayer = "active",
  }: Parameters<typeof SitesCreateSheetModule.SitesCreateSheet>[0] = {}) => (
    <dialog
      aria-label="New site"
      data-vaul-drawer=""
      data-workspace-sheet-interactive={
        sheetLayer === "active" ? "true" : "false"
      }
      open
    >
      <h2>New site</h2>
      {children}
      {nestedSheet}
    </dialog>
  )) as typeof SitesCreateSheetModule.SitesCreateSheet;

  return {
    SitesCreateSheet: Object.assign(SitesCreateSheetRoot, {
      Form: (() => (
        <div data-testid="sites-create-sheet-form" />
      )) as typeof SitesCreateSheetModule.SitesCreateSheet.Form,
      LoadingContent: () => (
        <div data-testid="sites-create-sheet-loading">
          <div data-testid="sites-create-sheet-skeleton-row" />
        </div>
      ),
    }) as typeof SitesCreateSheetModule.SitesCreateSheet,
  };
});

vi.mock(import("#/features/sites/sites-detail-sheet"), () => ({
  SitesDetailSheet: (() => (
    <div data-testid="sites-detail-sheet" />
  )) as typeof SitesDetailSheetModule.SitesDetailSheet,
}));

describe("workspace sheet stack", () => {
  beforeAll(async () => {
    ({ WorkspaceSheetStack } = await import("./workspace-sheet-stack"));
  });

  afterEach(() => {
    vi.clearAllMocks();
    mockedJobsState.existingViewer = undefined;
    mockedSitesState.existingViewer = undefined;
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
    mockedJobsState.existingViewer = OWNER_VIEWER;

    render(
      <WorkspaceSheetEventsProvider>
        <WorkspaceSheetNavigationProvider stack={[{ kind: "job.create" }]}>
          <WorkspaceSheetStack stack={[{ kind: "job.create" }]} />
        </WorkspaceSheetNavigationProvider>
      </WorkspaceSheetEventsProvider>
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
        dataPlaneSeeds: [],
        options: { sites: [] },
        routeProximityLocationEnabled: true,
        viewer: { role: "owner", userId: "user_123" as never },
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
  mockedJobsState.existingViewer = OWNER_VIEWER;

  return (
    <WorkspaceSheetEventsProvider>
      <WorkspaceSheetNavigationProvider stack={stack}>
        <WorkspaceSheetStack stack={stack} />
      </WorkspaceSheetNavigationProvider>
    </WorkspaceSheetEventsProvider>
  );
}
