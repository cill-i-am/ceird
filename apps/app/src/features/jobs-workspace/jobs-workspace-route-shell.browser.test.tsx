import { HotkeysProvider } from "@tanstack/react-hotkeys";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { JobsWorkspaceRouteShell } from "./jobs-workspace-route-shell";

describe("jobs workspace route shell", () => {
  it("renders the marked preview shell for internal members", () => {
    render(
      <HotkeysProvider>
        <JobsWorkspaceRouteShell
          currentOrganizationRole="member"
          hotkeysEnabled
          onStatusChange={vi.fn<(status: unknown) => void>()}
          onViewChange={vi.fn<(view: unknown) => void>()}
          view="list"
        />
      </HotkeysProvider>
    );

    expect(
      screen.getByRole("heading", { name: "Jobs Workspace" })
    ).toBeVisible();
    expect(screen.getByText("Not the active Jobs route")).toBeVisible();
    expect(screen.getByRole("button", { name: /new job/i })).toBeDisabled();
    expect(
      screen.getByRole("searchbox", { name: /search jobs workspace/i })
    ).toBeVisible();
    expect(screen.getByText(/No live jobs connected yet/i)).toBeVisible();
    expect(screen.getByText(/Sync route unavailable/i)).toBeVisible();
  });

  it("renders a permission-aware state for external collaborators", () => {
    render(
      <HotkeysProvider>
        <JobsWorkspaceRouteShell
          currentOrganizationRole="external"
          hotkeysEnabled
          onStatusChange={vi.fn<(status: unknown) => void>()}
          onViewChange={vi.fn<(view: unknown) => void>()}
          view="list"
        />
      </HotkeysProvider>
    );

    expect(
      screen.getByText("Jobs workspace preview is internal only")
    ).toBeVisible();
    expect(
      screen.queryByText("Not the active Jobs route")
    ).not.toBeInTheDocument();
  });

  it("keeps route state controls keyboard-addressable", async () => {
    const user = userEvent.setup();
    const onStatusChange = vi.fn<(status: unknown) => void>();
    const onViewChange = vi.fn<(view: unknown) => void>();

    render(
      <HotkeysProvider>
        <JobsWorkspaceRouteShell
          currentOrganizationRole="owner"
          hotkeysEnabled
          onStatusChange={onStatusChange}
          onViewChange={onViewChange}
          status="blocked"
          view="board"
        />
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

    expect(onViewChange).toHaveBeenCalledWith("list");
    expect(onStatusChange).toHaveBeenCalledWith(undefined);
    expect(screen.getByRole("searchbox")).toHaveFocus();
  });
});
