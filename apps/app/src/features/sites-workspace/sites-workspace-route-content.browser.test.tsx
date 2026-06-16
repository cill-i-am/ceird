import type { OrganizationId } from "@ceird/identity-core";
import { HotkeysProvider } from "@tanstack/react-hotkeys";
import { QueryClient } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type * as React from "react";

import { createOrganizationDataScope } from "#/data-plane/query-scope";
import { DataPlaneProvider } from "#/data-plane/session";
import { CommandBarProvider } from "#/features/command-bar/command-bar";

import { SitesWorkspaceRouteContent } from "./sites-workspace-route-content";

describe(SitesWorkspaceRouteContent, () => {
  it("renders the gated realtime shell for internal roles", () => {
    renderSitesWorkspace();

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

  it("can render a connecting state from the route state hook", () => {
    renderSitesWorkspace({ shellState: "loading" });

    expect(screen.getByText("Connecting to live Sites")).toBeInTheDocument();
    expect(
      screen.getByLabelText("Sites workspace loading")
    ).toBeInTheDocument();
  });

  it("registers keyboard access for search and create affordances", async () => {
    const user = userEvent.setup();
    const onShellStateChange =
      vi.fn<
        React.ComponentProps<
          typeof SitesWorkspaceRouteContent
        >["onShellStateChange"]
      >();

    renderSitesWorkspace({ onShellStateChange });

    await user.keyboard("n");
    expect(onShellStateChange).toHaveBeenCalledWith("ready");

    await user.keyboard("/");
    expect(
      screen.getByRole("searchbox", { name: /search sites workspace/i })
    ).toHaveFocus();
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
  onShellStateChange = vi.fn<
    React.ComponentProps<
      typeof SitesWorkspaceRouteContent
    >["onShellStateChange"]
  >(),
  shellState = "unavailable",
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
            onShellStateChange={onShellStateChange}
            shellState={shellState}
          />
        </CommandBarProvider>
      </DataPlaneProvider>
    </HotkeysProvider>
  );
}
