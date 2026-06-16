import type { OrganizationId } from "@ceird/identity-core";
import { HotkeysProvider } from "@tanstack/react-hotkeys";
import { QueryClient } from "@tanstack/react-query";
import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type * as React from "react";

import { createOrganizationDataScope } from "#/data-plane/query-scope";
import { DataPlaneProvider } from "#/data-plane/session";
import { CommandBarProvider } from "#/features/command-bar/command-bar";

import {
  resolveWorkspaceStatus,
  SitesWorkspaceRouteContent,
} from "./sites-workspace-route-content";

describe(SitesWorkspaceRouteContent, () => {
  it("renders the gated realtime shell for internal roles", () => {
    renderSitesWorkspace({ shellState: "ready" });

    expect(
      screen.getByRole("heading", { name: "Sites workspace" })
    ).toBeInTheDocument();
    expect(screen.getByText("Preview route")).toBeInTheDocument();
    expect(
      screen.getByRole("searchbox", { name: /search sites workspace/i })
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /new site/i })).toBeEnabled();
    expect(
      screen.getAllByText("Realtime sites unavailable").length
    ).toBeGreaterThan(0);
    expect(
      screen.queryByText("Live Sites read model ready")
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(/server-render|missing-sync-origin/)
    ).toBeInTheDocument();
  });

  it("shows a permission-aware state for external collaborators", () => {
    renderSitesWorkspace({ currentOrganizationRole: "external" });

    expect(
      screen.getByText("Sites workspace is internal-only")
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /new site/i })).toBeDisabled();
    expect(
      screen.queryByRole("searchbox", { name: /search sites workspace/i })
    ).not.toBeInTheDocument();
  });

  it("does not let forced loading shell state mask disabled sync health", () => {
    renderSitesWorkspace({ shellState: "loading" });

    expect(
      screen.getAllByText("Realtime sites unavailable").length
    ).toBeGreaterThan(0);
    expect(
      screen.queryByText("Connecting to live Sites")
    ).not.toBeInTheDocument();
  });

  it("registers keyboard access for search and create affordances", async () => {
    const user = userEvent.setup();
    const onWorkspaceSearchChange =
      vi.fn<
        React.ComponentProps<
          typeof SitesWorkspaceRouteContent
        >["onWorkspaceSearchChange"]
      >();

    renderSitesWorkspace({ onWorkspaceSearchChange });

    await user.keyboard("n");
    expect(onWorkspaceSearchChange).not.toHaveBeenCalled();
    expect(
      screen.getAllByText("Realtime sites unavailable").length
    ).toBeGreaterThan(0);

    await user.keyboard("/");
    expect(
      screen.getByRole("searchbox", { name: /search sites workspace/i })
    ).toHaveFocus();
  });

  it("routes search input changes through the workspace search hook", () => {
    const onWorkspaceSearchChange =
      vi.fn<
        React.ComponentProps<
          typeof SitesWorkspaceRouteContent
        >["onWorkspaceSearchChange"]
      >();

    renderSitesWorkspace({
      onWorkspaceSearchChange,
      workspaceSearch: { query: "Dub" },
    });

    const searchInput = screen.getByRole("searchbox", {
      name: /search sites workspace/i,
    });

    expect(searchInput).toHaveValue("Dub");

    fireEvent.change(searchInput, { target: { value: "Cork" } });

    expect(onWorkspaceSearchChange).toHaveBeenLastCalledWith({
      query: "Cork",
    });
  });

  it("fails closed when joined read-model slices are unavailable with base sites ready", () => {
    expect(
      resolveWorkspaceStatus([
        collectionHealth("sites", "ready"),
        collectionHealth("site-label-assignments", "unavailable"),
        collectionHealth("site-active-job-summaries", "unavailable"),
        collectionHealth("site-related-jobs", "ready"),
        collectionHealth("labels", "ready"),
      ])
    ).toBe("unavailable");
  });

  it("keeps rows connecting until every joined read-model slice is initially hydrated", () => {
    expect(
      resolveWorkspaceStatus([
        collectionHealth("sites", "ready"),
        collectionHealth("site-label-assignments", "connecting"),
        collectionHealth("site-active-job-summaries", "connecting"),
        collectionHealth("site-related-jobs", "ready"),
        collectionHealth("labels", "ready"),
      ])
    ).toBe("connecting");
  });

  it("exposes route commands with discoverable shortcuts", async () => {
    const user = userEvent.setup();
    renderSitesWorkspace();

    await user.keyboard("{Meta>}k{/Meta}");

    const searchOption = await screen.findByRole("option", {
      name: /focus workspace search/i,
    });
    expect(searchOption).toBeInTheDocument();
    expect(within(searchOption).getByText("/")).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: /prepare site creation/i })
    ).toBeInTheDocument();
  });
});

function renderSitesWorkspace({
  currentOrganizationRole = "owner",
  onWorkspaceSearchChange = vi.fn<
    React.ComponentProps<
      typeof SitesWorkspaceRouteContent
    >["onWorkspaceSearchChange"]
  >(),
  shellState = "unavailable",
  workspaceSearch = {},
}: Partial<React.ComponentProps<typeof SitesWorkspaceRouteContent>> = {}) {
  const queryClient = new QueryClient();

  return render(
    <HotkeysProvider>
      <DataPlaneProvider
        queryClient={queryClient}
        scope={createOrganizationDataScope({
          organizationId: "org_123" as OrganizationId,
          role: currentOrganizationRole,
          userId: "user_123",
        })}
      >
        <CommandBarProvider>
          <SitesWorkspaceRouteContent
            currentOrganizationRole={currentOrganizationRole}
            workspaceSearch={workspaceSearch}
            onWorkspaceSearchChange={onWorkspaceSearchChange}
            shellState={shellState}
          />
        </CommandBarProvider>
      </DataPlaneProvider>
    </HotkeysProvider>
  );
}

function collectionHealth(
  collection: Parameters<
    typeof resolveWorkspaceStatus
  >[0][number]["collection"],
  status: Parameters<typeof resolveWorkspaceStatus>[0][number]["status"]
): Parameters<typeof resolveWorkspaceStatus>[0][number] {
  return {
    collection,
    collectionId: `test:${collection}`,
    lastStatusChangeAtMs: 1,
    recoveryAttempts: 0,
    source: "electric",
    startedAtMs: 1,
    status,
    subscriptionName: collection,
  };
}
