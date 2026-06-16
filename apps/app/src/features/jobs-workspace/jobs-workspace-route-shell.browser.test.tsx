import type { UserId } from "@ceird/identity-core";
import type { WorkItemIdType } from "@ceird/jobs-core";
import type { LabelIdType } from "@ceird/labels-core";
import type { SiteIdType } from "@ceird/sites-core";
import { HotkeysProvider } from "@tanstack/react-hotkeys";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import * as React from "react";

import type { JobsWorkspaceLiveListState } from "./jobs-workspace-live-list";
import { JobsWorkspaceRouteShell } from "./jobs-workspace-route-shell";

const liveListState = vi.hoisted<{ current: JobsWorkspaceLiveListState }>(
  () => ({
    current: {
      allRowsCount: 0,
      availableLabels: [],
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

vi.mock(import("./jobs-workspace-live-list"), () => ({
  useJobsWorkspaceLiveList: () => liveListState.current,
}));

function renderShell(
  props: Partial<React.ComponentProps<typeof JobsWorkspaceRouteShell>> = {}
) {
  return render(
    <HotkeysProvider>
      <JobsWorkspaceRouteShell
        currentOrganizationRole="member"
        hotkeysEnabled
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
      isCollectionGraphAvailable: true,
      isLoading: false,
      isReady: true,
      rows: [],
    };
  });

  it("renders the live preview shell for internal members", () => {
    renderShell();

    expect(
      screen.getByRole("heading", { name: "Jobs Workspace" })
    ).toBeVisible();
    expect(screen.getByText("Not the active Jobs route")).toBeVisible();
    expect(screen.getByRole("button", { name: /new job/i })).toBeDisabled();
    expect(
      screen.getByRole("searchbox", { name: /search live jobs/i })
    ).toBeVisible();
    expect(screen.getByText(/No jobs match this live view/i)).toBeVisible();
    expect(screen.getByText("Collection health")).toBeVisible();
  });

  it("renders a permission-aware state for external collaborators", () => {
    renderShell({ currentOrganizationRole: "external" });

    expect(
      screen.getByText("Jobs workspace preview is internal only")
    ).toBeVisible();
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

    expect(screen.getByText("Fit heat pump")).toBeVisible();
    expect(screen.getByText("Warehouse")).toBeVisible();
    expect(screen.getByText("Urgent")).toBeVisible();
    expect(
      screen.getByRole("button", { name: /open actions for fit heat pump/i })
    ).toHaveAttribute("aria-disabled", "true");
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
});
