import { HotkeysProvider } from "@tanstack/react-hotkeys";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type * as React from "react";

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
      screen.getByRole("textbox", { name: "Search sites workspace" })
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /new site/i })).toBeEnabled();
    expect(screen.getByText("Realtime sites unavailable")).toBeInTheDocument();
  });

  it("shows a permission-aware state for external collaborators", () => {
    renderSitesWorkspace({ currentOrganizationRole: "external" });

    expect(
      screen.getByText("Sites workspace is internal-only")
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /new site/i })).toBeDisabled();
    expect(
      screen.queryByRole("textbox", { name: "Search sites workspace" })
    ).not.toBeInTheDocument();
  });

  it("switches placeholder route state through shell controls", async () => {
    const user = userEvent.setup();
    const onShellStateChange =
      vi.fn<
        React.ComponentProps<
          typeof SitesWorkspaceRouteContent
        >["onShellStateChange"]
      >();

    renderSitesWorkspace({ onShellStateChange, shellState: "ready" });

    await user.click(screen.getByRole("tab", { name: "Loading" }));
    expect(onShellStateChange).toHaveBeenCalledWith("loading");

    await user.click(screen.getByRole("tab", { name: "Empty" }));
    expect(onShellStateChange).toHaveBeenCalledWith("empty");
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
      screen.getByRole("textbox", { name: "Search sites workspace" })
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
  return render(
    <HotkeysProvider>
      <CommandBarProvider>
        <SitesWorkspaceRouteContent
          currentOrganizationRole={currentOrganizationRole}
          onShellStateChange={onShellStateChange}
          shellState={shellState}
        />
      </CommandBarProvider>
    </HotkeysProvider>
  );
}
