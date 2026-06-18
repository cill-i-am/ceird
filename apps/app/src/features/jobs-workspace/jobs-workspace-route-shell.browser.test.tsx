import { decodeOrganizationId } from "@ceird/identity-core";
import type { ProductActorId, UserId } from "@ceird/identity-core";
import type {
  ActivityIdType,
  CommentIdType,
  ContactIdType,
  Job,
  WorkItemIdType,
  VisitIdType,
} from "@ceird/jobs-core";
import type { LabelIdType } from "@ceird/labels-core";
import type { SiteIdType } from "@ceird/sites-core";
import { HotkeysProvider } from "@tanstack/react-hotkeys";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Exit } from "effect";
import * as React from "react";

import type { JobsWorkspaceVisibleRow } from "#/features/jobs/jobs-data-plane";

import type { JobsWorkspaceLiveDetailState } from "./jobs-workspace-live-detail";
import type { JobsWorkspaceLiveListState } from "./jobs-workspace-live-list";
import { JobsWorkspaceRouteShell } from "./jobs-workspace-route-shell";

function getModEnterKeyboardInput() {
  return /(Mac|iPhone|iPad|iPod)/i.test(navigator.platform)
    ? "{Meta>}{Enter}{/Meta}"
    : "{Control>}{Enter}{/Control}";
}

const liveListState = vi.hoisted<{ current: JobsWorkspaceLiveListState }>(
  () => ({
    current: {
      allRowsCount: 0,
      availableLabels: [],
      commands: makeCommandStubs(),
      graphCounts: {
        contacts: 0,
        jobLabelAssignments: 0,
        jobs: 0,
        labels: 0,
        sites: 0,
      },
      health: {
        collection: "jobs",
        collectionId: "jobs-workspace-test",
        lastStatusChangeAtMs: 0,
        recoveryAttempts: 0,
        source: "electric",
        startedAtMs: 0,
        status: "ready",
        subscriptionName: "jobs",
      },
      isCollectionGraphAvailable: true,
      isLoading: false,
      isReady: true,
      rows: [],
    } as JobsWorkspaceLiveListState,
  })
);
const organizationId = decodeOrganizationId("org_123");
const liveDetailState = vi.hoisted<{
  current: JobsWorkspaceLiveDetailState;
}>(() => ({
  current: {
    addComment: vi.fn<JobsWorkspaceLiveDetailState["addComment"]>(),
    detail: undefined,
    graphCounts: {
      activity: 0,
      actors: 0,
      collaborators: 0,
      comments: 0,
      jobComments: 0,
      memberActorSummaries: 0,
      visits: 0,
    },
    health: {
      collection: "jobs",
      collectionId: "jobs-workspace-detail-test",
      lastStatusChangeAtMs: 0,
      recoveryAttempts: 0,
      source: "electric",
      startedAtMs: 0,
      status: "ready",
      subscriptionName: "jobs-workspace-detail",
    },
    isCollectionGraphAvailable: true,
    isLoading: false,
    isNotFound: false,
    isReady: false,
  },
}));

vi.mock(import("./jobs-workspace-live-list"), () => ({
  useJobsWorkspaceLiveList: () => liveListState.current,
}));
vi.mock(import("./jobs-workspace-live-detail"), () => ({
  useJobsWorkspaceLiveDetail: () => liveDetailState.current,
}));

function renderShell(
  props: Partial<React.ComponentProps<typeof JobsWorkspaceRouteShell>> = {}
) {
  return render(
    <HotkeysProvider>
      <JobsWorkspaceRouteShell
        currentOrganizationRole="member"
        hotkeysEnabled
        onDetailJobChange={vi.fn<(jobId: string | undefined) => void>()}
        onLabelChange={vi.fn<(labelId: string | undefined) => void>()}
        onQueryChange={vi.fn<(query: string | undefined) => void>()}
        onRecentSearchCommit={vi.fn<(query: string | undefined) => void>()}
        onSortChange={vi.fn<(sort: unknown) => void>()}
        onStatusChange={vi.fn<(status: unknown) => void>()}
        onViewChange={vi.fn<(view: unknown) => void>()}
        sort="updated-desc"
        view="list"
        {...props}
      />
    </HotkeysProvider>
  );
}

describe("jobs workspace route shell", () => {
  beforeEach(() => {
    liveListState.current = {
      ...liveListState.current,
      allRowsCount: 0,
      availableLabels: [],
      commands: makeCommandStubs(),
      graphCounts: {
        contacts: 0,
        jobLabelAssignments: 0,
        jobs: 0,
        labels: 0,
        sites: 0,
      },
      isCollectionGraphAvailable: true,
      isLoading: false,
      isReady: true,
      rows: [],
    };
    liveDetailState.current = {
      addComment: vi.fn<JobsWorkspaceLiveDetailState["addComment"]>(),
      detail: undefined,
      graphCounts: {
        activity: 0,
        actors: 0,
        collaborators: 0,
        comments: 0,
        jobComments: 0,
        memberActorSummaries: 0,
        visits: 0,
      },
      health: {
        collection: "jobs",
        collectionId: "jobs-workspace-detail-test",
        lastStatusChangeAtMs: 0,
        recoveryAttempts: 0,
        source: "electric",
        startedAtMs: 0,
        status: "ready",
        subscriptionName: "jobs-workspace-detail",
      },
      isCollectionGraphAvailable: true,
      isLoading: false,
      isNotFound: false,
      isReady: false,
    };
  });

  it("renders the live jobs shell for internal members", () => {
    renderShell();

    expect(screen.getByRole("heading", { name: "Jobs" })).toBeVisible();
    expect(
      screen.queryByText("Not the active Jobs route")
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /new job/i })).toBeEnabled();
    expect(
      screen.getByRole("searchbox", { name: /search live jobs/i })
    ).toBeVisible();
    expect(screen.getByText(/No jobs match this live view/i)).toBeVisible();
    expect(screen.getByText("Collection health")).toBeVisible();
  });

  it("renders a permission-aware state for external collaborators", () => {
    renderShell({ currentOrganizationRole: "external" });

    expect(screen.getByText("Realtime Jobs is internal only")).toBeVisible();
    expect(
      screen.queryByText("Not the active Jobs route")
    ).not.toBeInTheDocument();
  });

  it("shows unavailable state without falling back when Electric is disabled", () => {
    liveListState.current = {
      ...liveListState.current,
      health: {
        ...liveListState.current.health,
        disabledReason: "missing-sync-origin",
        status: "disabled",
      },
      isCollectionGraphAvailable: false,
      isReady: false,
    };

    renderShell();

    expect(screen.getByText("Realtime jobs are unavailable")).toBeVisible();
    expect(screen.getByText("disabled")).toBeVisible();
  });

  it("does not render partial joined rows while the collection graph is not ready", () => {
    liveListState.current = {
      ...liveListState.current,
      allRowsCount: 0,
      health: {
        ...liveListState.current.health,
        status: "connecting",
        subscriptionName: "jobs-workspace-list",
      },
      isLoading: true,
      isReady: false,
      rows: [
        {
          job: {
            createdAt: "2026-06-15T10:00:00.000Z",
            createdByUserId: "user_123" as UserId,
            id: "11111111-1111-4111-8111-111111111111" as WorkItemIdType,
            kind: "job",
            priority: "high",
            status: "blocked",
            title: "Fit heat pump",
            updatedAt: "2026-06-15T11:00:00.000Z",
          },
          labels: [],
          searchText: "fit heat pump",
        },
      ],
    };

    renderShell();

    expect(screen.getByLabelText("Connecting live jobs")).toBeVisible();
    expect(screen.queryByText("Fit heat pump")).not.toBeInTheDocument();
    expect(screen.queryByText("None")).not.toBeInTheDocument();
    expect(screen.queryByText("Unassigned")).not.toBeInTheDocument();
  });

  it("renders joined live rows with labels and row actions", () => {
    liveListState.current = {
      ...liveListState.current,
      allRowsCount: 1,
      rows: [
        {
          job: {
            createdAt: "2026-06-15T10:00:00.000Z",
            createdByUserId: "user_123" as UserId,
            id: "11111111-1111-4111-8111-111111111111" as WorkItemIdType,
            kind: "job",
            priority: "high",
            status: "blocked",
            title: "Fit heat pump",
            updatedAt: "2026-06-15T11:00:00.000Z",
          },
          labels: [
            {
              createdAt: "2026-06-15T10:00:00.000Z",
              id: "22222222-2222-4222-8222-222222222222" as LabelIdType,
              name: "Urgent",
              updatedAt: "2026-06-15T10:00:00.000Z",
            },
          ],
          searchText: "fit heat pump urgent",
          site: {
            displayLocation: "Dublin",
            hasUsableCoordinates: false,
            id: "33333333-3333-4333-8333-333333333333" as SiteIdType,
            locationStatus: "unverified",
            name: "Warehouse",
            updatedAt: "2026-06-15T10:00:00.000Z",
          },
        },
      ],
    };

    renderShell();

    expect(screen.getAllByText("Fit heat pump")[0]).toBeVisible();
    expect(screen.getByText("Warehouse")).toBeVisible();
    expect(screen.getByText("Urgent")).toBeVisible();
    expect(
      screen.getByRole("button", { name: /open detail for fit heat pump/i })
    ).toBeEnabled();
  });

  it("opens detail from the live list with click and keyboard shortcuts", async () => {
    const user = userEvent.setup();
    const onDetailJobChange = vi.fn<(jobId: string | undefined) => void>();
    const workItemId = "11111111-1111-4111-8111-111111111111" as WorkItemIdType;
    liveListState.current = {
      ...liveListState.current,
      allRowsCount: 1,
      rows: [makeWorkspaceRow(workItemId)],
    };

    renderShell({ onDetailJobChange });

    await user.click(
      screen.getByRole("button", { name: /open detail for fit heat pump/i })
    );
    await user.keyboard("{Enter}");

    expect(onDetailJobChange).toHaveBeenCalledWith(workItemId);
    expect(onDetailJobChange).toHaveBeenCalledTimes(2);
  });

  it("renders reactive detail fields and record-local activity", () => {
    const workItemId = "11111111-1111-4111-8111-111111111111" as WorkItemIdType;
    liveListState.current = {
      ...liveListState.current,
      allRowsCount: 1,
      rows: [makeWorkspaceRow(workItemId)],
    };
    liveDetailState.current = makeReadyDetailState(workItemId);

    renderShell({ detailJobId: workItemId });

    expect(
      screen.getByRole("heading", { name: "Fit heat pump" })
    ).toBeVisible();
    expect(screen.getAllByText("Urgent").length).toBeGreaterThan(1);
    expect(screen.getAllByText("Warehouse").length).toBeGreaterThan(1);
    expect(screen.getAllByText("Operations").length).toBeGreaterThan(1);
    expect(screen.getByText("Activity and comments")).toBeVisible();
    expect(screen.getByText("Ready for dispatch")).toBeVisible();
    expect(
      screen.getAllByText("Taylor Member · Dispatch").length
    ).toBeGreaterThan(1);
    expect(screen.getByText("Jordan Coordinator · Scheduling")).toBeVisible();
    expect(screen.queryByText(/Member [a-z0-9_-]+/i)).not.toBeInTheDocument();
  });

  it("adds comments through the detail composer with pending and synced feedback", async () => {
    const user = userEvent.setup();
    const workItemId = "11111111-1111-4111-8111-111111111111" as WorkItemIdType;
    const commentResponse =
      Promise.withResolvers<
        Awaited<ReturnType<JobsWorkspaceLiveDetailState["addComment"]>>
      >();
    const addComment = vi.fn<JobsWorkspaceLiveDetailState["addComment"]>(
      () => commentResponse.promise
    );
    liveListState.current = {
      ...liveListState.current,
      allRowsCount: 1,
      rows: [makeWorkspaceRow(workItemId)],
    };
    liveDetailState.current = {
      ...makeReadyDetailState(workItemId),
      addComment,
    };

    renderShell({ detailJobId: workItemId });

    await user.keyboard("N");
    expect(screen.getByLabelText("Comment")).toHaveFocus();
    await user.type(screen.getByLabelText("Comment"), "Customer confirmed.");
    await user.keyboard(getModEnterKeyboardInput());

    expect(addComment).toHaveBeenCalledWith(workItemId, {
      body: "Customer confirmed.",
    });
    expect(screen.getByText("Comment pending")).toBeVisible();

    commentResponse.resolve({
      _tag: "Success",
      value: {
        actor: {
          displayName: "Taylor Member",
          id: "99999999-9999-4999-8999-999999999999",
          kind: "member",
        },
        actorId: "99999999-9999-4999-8999-999999999999",
        body: "Customer confirmed.",
        createdAt: "2026-06-15T10:45:00.000Z",
        electricObservation: {
          commentBody: "observed-change",
          commentEdge: "observed-change",
        },
        id: "55555555-5555-4555-8555-555555555555",
        workItemId,
      },
    } as Awaited<ReturnType<JobsWorkspaceLiveDetailState["addComment"]>>);

    await expect(screen.findByText("Comment synced")).resolves.toBeVisible();
    expect(screen.getByLabelText("Comment")).toHaveValue("");
  });

  it("focuses detail comments instead of creating a hidden draft job", async () => {
    const user = userEvent.setup();
    const workItemId = "11111111-1111-4111-8111-111111111111" as WorkItemIdType;
    const createJob =
      vi.fn<JobsWorkspaceLiveListState["commands"]["createJob"]>();
    liveListState.current = {
      ...liveListState.current,
      allRowsCount: 1,
      commands: {
        ...makeCommandStubs(),
        createJob,
      },
      rows: [makeWorkspaceRow(workItemId)],
    };
    liveDetailState.current = makeReadyDetailState(workItemId);

    function StatefulDetailShell() {
      const [detailJobId, setDetailJobId] = React.useState<
        string | undefined
      >();

      return (
        <JobsWorkspaceRouteShell
          currentOrganizationRole="owner"
          detailJobId={detailJobId}
          hotkeysEnabled
          onDetailJobChange={setDetailJobId}
          onLabelChange={vi.fn<(labelId: string | undefined) => void>()}
          onQueryChange={vi.fn<(query: string | undefined) => void>()}
          onRecentSearchCommit={vi.fn<(query: string | undefined) => void>()}
          onSortChange={vi.fn<(sort: unknown) => void>()}
          onStatusChange={vi.fn<(status: unknown) => void>()}
          onViewChange={vi.fn<(view: unknown) => void>()}
          sort="updated-desc"
          view="list"
        />
      );
    }

    render(
      <HotkeysProvider>
        <StatefulDetailShell />
      </HotkeysProvider>
    );

    await user.type(screen.getByLabelText("New job title"), "Hidden draft");
    await user.click(
      screen.getByRole("button", { name: /open detail for fit heat pump/i })
    );
    await user.keyboard("N");

    expect(screen.getByLabelText("Comment")).toHaveFocus();
    expect(createJob).not.toHaveBeenCalled();
  });

  it("shows failed comment feedback when Electric confirmation fails", async () => {
    const user = userEvent.setup();
    const workItemId = "11111111-1111-4111-8111-111111111111" as WorkItemIdType;
    liveListState.current = {
      ...liveListState.current,
      allRowsCount: 1,
      rows: [makeWorkspaceRow(workItemId)],
    };
    liveDetailState.current = {
      ...makeReadyDetailState(workItemId),
      addComment: vi.fn<JobsWorkspaceLiveDetailState["addComment"]>(() =>
        Promise.resolve(Exit.fail(new Error("Timed out waiting for Electric")))
      ),
    };

    renderShell({ detailJobId: workItemId });

    await user.type(screen.getByLabelText("Comment"), "Needs another visit.");
    await user.click(screen.getByRole("button", { name: /submit/i }));

    await expect(screen.findByText("Comment failed")).resolves.toBeVisible();
    expect(screen.getByText("Timed out waiting for Electric")).toBeVisible();
  });

  it("describes Enter as opening detail in shortcut help", () => {
    const workItemId = "11111111-1111-4111-8111-111111111111" as WorkItemIdType;
    liveListState.current = {
      ...liveListState.current,
      allRowsCount: 1,
      rows: [makeWorkspaceRow(workItemId)],
    };

    renderShell();

    expect(screen.getByText(/to open job detail/i)).toBeVisible();
    expect(screen.queryByText(/to focus row actions/i)).not.toBeInTheDocument();
  });

  it("shows detail sync unavailable state without falling back", () => {
    const workItemId = "11111111-1111-4111-8111-111111111111" as WorkItemIdType;
    liveListState.current = {
      ...liveListState.current,
      allRowsCount: 1,
      rows: [makeWorkspaceRow(workItemId)],
    };
    liveDetailState.current = {
      ...liveDetailState.current,
      health: {
        ...liveDetailState.current.health,
        disabledReason: "missing-sync-origin",
        status: "disabled",
      },
      isCollectionGraphAvailable: false,
      isReady: false,
    };

    renderShell({ detailJobId: workItemId });

    expect(
      screen.getByText("Realtime job detail is unavailable")
    ).toBeVisible();
    expect(screen.getByText(/Detail sync status: disabled/)).toBeVisible();
  });

  it("closes an unavailable detail panel with Escape", async () => {
    const user = userEvent.setup();
    const workItemId = "11111111-1111-4111-8111-111111111111" as WorkItemIdType;
    const onDetailJobChange = vi.fn<(jobId: string | undefined) => void>();
    liveListState.current = {
      ...liveListState.current,
      allRowsCount: 1,
      rows: [makeWorkspaceRow(workItemId)],
    };
    liveDetailState.current = {
      ...liveDetailState.current,
      health: {
        ...liveDetailState.current.health,
        disabledReason: "missing-sync-origin",
        status: "disabled",
      },
      isCollectionGraphAvailable: false,
      isReady: false,
    };

    renderShell({ detailJobId: workItemId, onDetailJobChange });

    await user.keyboard("{Escape}");

    expect(onDetailJobChange).toHaveBeenCalledWith(undefined);
  });

  it("closes detail and restores focus to the opening row action", async () => {
    const user = userEvent.setup();
    const workItemId = "11111111-1111-4111-8111-111111111111" as WorkItemIdType;
    liveListState.current = {
      ...liveListState.current,
      allRowsCount: 1,
      rows: [makeWorkspaceRow(workItemId)],
    };
    liveDetailState.current = makeReadyDetailState(workItemId);

    function StatefulDetailShell() {
      const [detailJobId, setDetailJobId] = React.useState<string | undefined>(
        workItemId
      );

      return (
        <JobsWorkspaceRouteShell
          currentOrganizationRole="owner"
          detailJobId={detailJobId}
          hotkeysEnabled
          onDetailJobChange={setDetailJobId}
          onLabelChange={vi.fn<(labelId: string | undefined) => void>()}
          onQueryChange={vi.fn<(query: string | undefined) => void>()}
          onRecentSearchCommit={vi.fn<(query: string | undefined) => void>()}
          onSortChange={vi.fn<(sort: unknown) => void>()}
          onStatusChange={vi.fn<(status: unknown) => void>()}
          onViewChange={vi.fn<(view: unknown) => void>()}
          sort="updated-desc"
          view="list"
        />
      );
    }

    render(
      <HotkeysProvider>
        <StatefulDetailShell />
      </HotkeysProvider>
    );

    await user.click(screen.getByRole("button", { name: /close/i }));

    expect(screen.queryByLabelText("Job detail")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /open detail for fit heat pump/i })
    ).toHaveFocus();
  });

  it("shows pending and synced command feedback for workspace writes", async () => {
    const user = userEvent.setup();
    const createDeferred = Promise.withResolvers<
      Exit.Exit<
        {
          readonly electricObservation: {
            readonly collection: "jobs";
            readonly kind: "observed-change";
          };
          readonly job: Job;
          readonly mutation: { readonly txid: number };
        },
        unknown
      >
    >();
    liveListState.current = {
      ...liveListState.current,
      commands: {
        ...makeCommandStubs(),
        createJob: vi.fn<JobsWorkspaceLiveListState["commands"]["createJob"]>(
          () => createDeferred.promise
        ),
      },
    };

    renderShell();

    await user.type(screen.getByLabelText("New job title"), "Fit heat pump");
    await user.click(screen.getByRole("button", { name: /^create/i }));

    expect(
      screen.getByText("Creating job through the domain command.")
    ).toBeVisible();

    createDeferred.resolve(
      Exit.succeed({
        electricObservation: {
          collection: "jobs",
          kind: "observed-change",
        },
        job: makeJob("Fit heat pump"),
        mutation: { txid: 501 },
      })
    );

    await expect(
      screen.findByText(/Created and synced Fit heat pump/)
    ).resolves.toBeVisible();
    expect(screen.getByText(/Txid 501/)).toBeVisible();
  });

  it("keeps failed command feedback visible without clearing the draft", async () => {
    const user = userEvent.setup();
    liveListState.current = {
      ...liveListState.current,
      commands: {
        ...makeCommandStubs(),
        createJob: vi.fn<JobsWorkspaceLiveListState["commands"]["createJob"]>(
          () => Promise.resolve(Exit.fail(new Error("Title is too short")))
        ),
      },
    };

    renderShell();

    await user.type(screen.getByLabelText("New job title"), "Fit");
    await user.click(screen.getByRole("button", { name: /^create/i }));

    await expect(
      screen.findByText("Title is too short")
    ).resolves.toBeVisible();
    expect(screen.getByLabelText("New job title")).toHaveValue("Fit");
  });

  it("keeps route state controls keyboard-addressable", async () => {
    const user = userEvent.setup();
    const onStatusChange = vi.fn<(status: unknown) => void>();
    const onViewChange = vi.fn<(view: unknown) => void>();
    const onQueryChange = vi.fn<(query: string | undefined) => void>();
    function StatefulShell() {
      const [query, setQuery] = React.useState<string | undefined>();

      return (
        <JobsWorkspaceRouteShell
          currentOrganizationRole="owner"
          hotkeysEnabled
          onDetailJobChange={vi.fn<(jobId: string | undefined) => void>()}
          onLabelChange={vi.fn<(labelId: string | undefined) => void>()}
          onQueryChange={(nextQuery) => {
            setQuery(nextQuery);
            onQueryChange(nextQuery);
          }}
          onRecentSearchCommit={vi.fn<(query: string | undefined) => void>()}
          onSortChange={vi.fn<(sort: unknown) => void>()}
          onStatusChange={onStatusChange}
          onViewChange={onViewChange}
          query={query}
          sort="updated-desc"
          status="blocked"
          view="board"
        />
      );
    }

    render(
      <HotkeysProvider>
        <StatefulShell />
      </HotkeysProvider>
    );

    expect(screen.getByRole("button", { name: /board/i })).toHaveAttribute(
      "aria-pressed",
      "true"
    );
    expect(screen.getByRole("button", { name: "Blocked" })).toHaveAttribute(
      "aria-pressed",
      "true"
    );

    await user.click(screen.getByRole("button", { name: /list/i }));
    await user.click(screen.getByRole("button", { name: "All" }));
    await user.keyboard("/");
    await user.type(screen.getByRole("searchbox"), "boiler");

    expect(onViewChange).toHaveBeenCalledWith("list");
    expect(onStatusChange).toHaveBeenCalledWith("all");
    expect(screen.getByRole("searchbox")).toHaveFocus();
    expect(onQueryChange).toHaveBeenLastCalledWith("boiler");
  });

  it("restores recent searches as quick actions", async () => {
    const user = userEvent.setup();
    const onQueryChange = vi.fn<(query: string | undefined) => void>();
    const onRecentSearchCommit = vi.fn<(query: string | undefined) => void>();

    renderShell({
      onQueryChange,
      onRecentSearchCommit,
      recentSearch: "pump",
      recentSearches: ["pump", "boiler"],
    });

    expect(screen.getByText("Recent search: pump")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "boiler" }));

    expect(onQueryChange).toHaveBeenCalledWith("boiler");
    expect(onRecentSearchCommit).toHaveBeenCalledWith("boiler");
  });
});

function makeCommandStubs(): JobsWorkspaceLiveListState["commands"] {
  return {
    assignJobLabel:
      vi.fn<JobsWorkspaceLiveListState["commands"]["assignJobLabel"]>(),
    createJob: vi.fn<JobsWorkspaceLiveListState["commands"]["createJob"]>(),
    removeJobLabel:
      vi.fn<JobsWorkspaceLiveListState["commands"]["removeJobLabel"]>(),
    reopenJob: vi.fn<JobsWorkspaceLiveListState["commands"]["reopenJob"]>(),
    transitionJob:
      vi.fn<JobsWorkspaceLiveListState["commands"]["transitionJob"]>(),
    updateJob: vi.fn<JobsWorkspaceLiveListState["commands"]["updateJob"]>(),
  };
}

function makeJob(title: string): Job {
  return {
    createdAt: "2026-06-15T10:00:00.000Z",
    createdByUserId: "user_123" as UserId,
    id: "11111111-1111-4111-8111-111111111111" as WorkItemIdType,
    kind: "job",
    labels: [],
    priority: "medium",
    status: "new",
    title,
    updatedAt: "2026-06-15T11:00:00.000Z",
  };
}

function makeWorkspaceRow(workItemId: WorkItemIdType): JobsWorkspaceVisibleRow {
  return {
    contact: {
      id: "44444444-4444-4444-8444-444444444444" as ContactIdType,
      name: "Operations",
      updatedAt: "2026-06-15T10:00:00.000Z",
    },
    job: {
      assigneeId: "user_taylor" as UserId,
      coordinatorId: "user_jordan" as UserId,
      createdAt: "2026-06-15T10:00:00.000Z",
      createdByUserId: "user_123" as UserId,
      id: workItemId,
      kind: "job" as const,
      priority: "high" as const,
      status: "blocked" as const,
      title: "Fit heat pump",
      updatedAt: "2026-06-15T11:00:00.000Z",
    },
    labels: [
      {
        createdAt: "2026-06-15T10:00:00.000Z",
        id: "22222222-2222-4222-8222-222222222222" as LabelIdType,
        name: "Urgent",
        updatedAt: "2026-06-15T10:00:00.000Z",
      },
    ],
    searchText: "fit heat pump urgent warehouse operations",
    site: {
      displayLocation: "Dublin",
      hasUsableCoordinates: false,
      id: "33333333-3333-4333-8333-333333333333" as SiteIdType,
      locationStatus: "unverified",
      name: "Warehouse",
      updatedAt: "2026-06-15T10:00:00.000Z",
    },
  };
}

function makeReadyDetailState(
  workItemId: WorkItemIdType
): JobsWorkspaceLiveDetailState {
  return {
    ...liveDetailState.current,
    addComment: vi.fn<JobsWorkspaceLiveDetailState["addComment"]>(),
    detail: {
      activity: [
        {
          activity: {
            actorId: "99999999-9999-4999-8999-999999999999" as ProductActorId,
            actorUserId: "user_taylor" as UserId,
            createdAt: "2026-06-15T10:30:00.000Z",
            eventType: "priority_changed",
            id: "77777777-7777-4777-8777-777777777777" as ActivityIdType,
            payload: {
              eventType: "priority_changed",
              fromPriority: "medium",
              toPriority: "high",
            },
            workItemId,
          },
          actor: {
            displayDetail: "Dispatch",
            displayName: "Taylor Member",
            id: "99999999-9999-4999-8999-999999999999" as ProductActorId,
            kind: "member",
          },
        },
      ],
      assignee: {
        displayDetail: "Dispatch",
        displayName: "Taylor Member",
        id: "99999999-9999-4999-8999-999999999999" as ProductActorId,
        kind: "member",
        organizationId,
        userId: "user_taylor" as UserId,
      },
      collaborators: [],
      commentCount: 1,
      comments: [
        {
          actor: {
            displayDetail: "Dispatch",
            displayName: "Taylor Member",
            id: "99999999-9999-4999-8999-999999999999" as ProductActorId,
            kind: "member",
          },
          comment: {
            actorId: "99999999-9999-4999-8999-999999999999" as ProductActorId,
            body: "Ready for dispatch",
            createdAt: "2026-06-15T10:40:00.000Z",
            id: "55555555-5555-4555-8555-555555555555" as CommentIdType,
            updatedAt: "2026-06-15T10:40:00.000Z",
          },
          edge: {
            commentId: "55555555-5555-4555-8555-555555555555" as CommentIdType,
            createdAt: "2026-06-15T10:40:00.000Z",
            id: `${workItemId}:55555555-5555-4555-8555-555555555555`,
            workItemId,
          },
        },
      ],
      contact: {
        id: "44444444-4444-4444-8444-444444444444" as ContactIdType,
        name: "Operations",
        updatedAt: "2026-06-15T10:00:00.000Z",
      },
      job: {
        assigneeId: "user_taylor" as UserId,
        coordinatorId: "user_jordan" as UserId,
        createdAt: "2026-06-15T10:00:00.000Z",
        createdByUserId: "user_123" as UserId,
        id: workItemId,
        kind: "job",
        priority: "high",
        status: "blocked",
        title: "Fit heat pump",
        updatedAt: "2026-06-15T11:00:00.000Z",
      },
      coordinator: {
        displayDetail: "Scheduling",
        displayName: "Jordan Coordinator",
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" as ProductActorId,
        kind: "member",
        organizationId,
        userId: "user_jordan" as UserId,
      },
      labels: [
        {
          createdAt: "2026-06-15T10:00:00.000Z",
          id: "22222222-2222-4222-8222-222222222222" as LabelIdType,
          name: "Urgent",
          updatedAt: "2026-06-15T10:00:00.000Z",
        },
      ],
      site: {
        displayLocation: "Dublin",
        hasUsableCoordinates: false,
        id: "33333333-3333-4333-8333-333333333333" as SiteIdType,
        locationStatus: "unverified",
        name: "Warehouse",
        updatedAt: "2026-06-15T10:00:00.000Z",
      },
      visits: [
        {
          authorUserId: "user_taylor" as UserId,
          createdAt: "2026-06-15T10:20:00.000Z",
          durationMinutes: 60,
          id: "88888888-8888-4888-8888-888888888888" as VisitIdType,
          note: "Initial survey",
          visitDate: "2026-06-15",
          workItemId,
        },
      ],
    },
    isCollectionGraphAvailable: true,
    isLoading: false,
    isNotFound: false,
    isReady: true,
  };
}
