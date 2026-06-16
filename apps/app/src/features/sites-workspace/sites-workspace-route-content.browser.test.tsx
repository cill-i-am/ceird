import type { OrganizationId } from "@ceird/identity-core";
import type { JobListItem } from "@ceird/jobs-core";
import type { Label } from "@ceird/labels-core";
import type { SiteOption } from "@ceird/sites-core";
import { HotkeysProvider } from "@tanstack/react-hotkeys";
import { QueryClient } from "@tanstack/react-query";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Exit } from "effect";
import { Effect } from "effect";
import * as React from "react";

import { createOrganizationDataScope } from "#/data-plane/query-scope";
import { DataPlaneProvider } from "#/data-plane/session";
import { CommandBarProvider } from "#/features/command-bar/command-bar";

import type * as SitesDataPlane from "./sites-workspace-data-plane";
import type {
  SiteActiveJobSummaryElectricRow,
  SiteCommentBodyRow,
  SiteCommentEdgeRow,
  SitesWorkspaceCommentCommandResult,
  SitesWorkspaceCommandResult,
  SiteLabelAssignmentElectricRow,
  SitesWorkspaceProductActorRow,
} from "./sites-workspace-data-plane";
import {
  resolveWorkspaceStatus,
  SitesWorkspaceRouteContent,
} from "./sites-workspace-route-content";

function getModEnterKeyboardInput() {
  return /(Mac|iPhone|iPad|iPod)/i.test(navigator.platform)
    ? "{Meta>}{Enter}{/Meta}"
    : "{Control>}{Enter}{/Control}";
}

type SitesWorkspaceCommandRunner = ReturnType<
  typeof SitesDataPlane.createSitesWorkspaceCommandRunner
>;

const sitesDataPlaneMock = vi.hoisted(() => ({
  commandRunner: undefined as
    | ReturnType<typeof createMockCommandRunner>
    | undefined,
  readModelState: undefined as
    | ReturnType<typeof createReadyReadModelState>
    | undefined,
}));

vi.mock(import("./sites-workspace-data-plane"), async (importOriginal) => {
  const actual = await importOriginal();

  return {
    ...actual,
    createSitesWorkspaceCommandRunner: vi.fn<
      typeof SitesDataPlane.createSitesWorkspaceCommandRunner
    >(
      (options) =>
        (sitesDataPlaneMock.commandRunner ??
          actual.createSitesWorkspaceCommandRunner(options)) as ReturnType<
          typeof SitesDataPlane.createSitesWorkspaceCommandRunner
        >
    ),
    getOrCreateSitesWorkspaceReadModelCollectionState: vi.fn<
      typeof SitesDataPlane.getOrCreateSitesWorkspaceReadModelCollectionState
    >(
      (options) =>
        (sitesDataPlaneMock.readModelState ??
          actual.getOrCreateSitesWorkspaceReadModelCollectionState(
            options
          )) as ReturnType<
          typeof SitesDataPlane.getOrCreateSitesWorkspaceReadModelCollectionState
        >
    ),
  };
});

describe(SitesWorkspaceRouteContent, () => {
  beforeEach(() => {
    window.localStorage.clear();
    sitesDataPlaneMock.commandRunner = undefined;
    sitesDataPlaneMock.readModelState = undefined;
  });

  it("renders the gated realtime shell for internal roles", () => {
    renderSitesWorkspace({ shellState: "ready" });

    expect(
      screen.getByRole("heading", { name: "Sites workspace" })
    ).toBeInTheDocument();
    expect(screen.getByText("Preview route")).toBeInTheDocument();
    expect(
      screen.getByRole("searchbox", { name: /search sites workspace/i })
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /new site/i })).toBeDisabled();
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
    expect(
      screen.queryByRole("button", { name: /new site/i })
    ).not.toBeInTheDocument();
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

  it("keeps create disabled while registering keyboard access for search", async () => {
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
    expect(screen.getByRole("button", { name: /new site/i })).toBeDisabled();
    expect(
      screen.queryByRole("form", { name: /create site/i })
    ).not.toBeInTheDocument();
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
      screen.queryByRole("option", { name: /prepare site creation/i })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("option", { name: /new site/i })
    ).not.toBeInTheDocument();
  });

  it("creates a site through the shared save shortcut with pending and synced states", async () => {
    const user = userEvent.setup();
    const readModel = createReadyReadModelState({
      labels: [maintenanceLabel],
      sites: [dublinSite],
    });
    const commandRunner = createMockCommandRunner();
    const createCommand = deferredCommand();
    sitesDataPlaneMock.readModelState = readModel;
    sitesDataPlaneMock.commandRunner = commandRunner;
    commandRunner.createSite.mockReturnValueOnce(createCommand.promise);

    renderSitesWorkspace({ shellState: "ready" });
    await screen.findByText("Live Sites read model ready");

    await user.keyboard("n");
    const createForm = await screen.findByRole("form", {
      name: /create site/i,
    });
    await user.type(within(createForm).getByLabelText("Name"), "Galway Depot");
    await user.type(
      within(createForm).getByLabelText("Access notes"),
      "Ring reception"
    );

    await user.keyboard("{Meta>}{Enter}{/Meta}");

    expect(commandRunner.createSite).toHaveBeenCalledExactlyOnceWith({
      accessNotes: "Ring reception",
      name: "Galway Depot",
    });
    expect(screen.getByText("Site mutation pending")).toBeInTheDocument();
    expect(
      screen.getByText("Creating site and waiting for Electric confirmation")
    ).toBeInTheDocument();
    expect(
      within(createForm).getByRole("button", { name: /save/i })
    ).toBeDisabled();
    expect(
      within(createForm).getByRole("button", { name: /cancel/i })
    ).toBeDisabled();

    await user.keyboard("{Meta>}{Enter}{/Meta}");
    await user.keyboard("{Escape}");
    await user.keyboard("n");

    expect(commandRunner.createSite).toHaveBeenCalledExactlyOnceWith({
      accessNotes: "Ring reception",
      name: "Galway Depot",
    });
    expect(
      screen.getByRole("form", { name: /create site/i })
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /new site/i })).toBeDisabled();
    expect(screen.getByText("Site mutation pending")).toBeInTheDocument();

    const galwaySite = makeSite({
      accessNotes: "Ring reception",
      displayLocation: "Galway Depot",
      id: "99999999-9999-4999-8999-999999999999",
      name: "Galway Depot",
      updatedAt: "2026-06-03T00:00:00.000Z",
    });
    await act(async () => {
      readModel.sites.collection.upsert(galwaySite);
      createCommand.resolve(makeSuccess(galwaySite, 1001));
      await createCommand.promise;
    });

    await expect(screen.findByText("Site synced")).resolves.toBeInTheDocument();
    expect(
      screen.getByText(
        "Site synced: Galway Depot (site row observed in live data after server txid 1001)"
      )
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("form", { name: /create site/i })
    ).not.toBeInTheDocument();
    await expect(
      screen.findByRole("button", { name: /galway depot/i })
    ).resolves.toHaveAttribute("aria-pressed", "true");
  });

  it("updates the selected site through shared save/cancel keyboard behavior", async () => {
    const user = userEvent.setup();
    const readModel = createReadyReadModelState({
      labels: [maintenanceLabel],
      sites: [dublinSite],
    });
    const commandRunner = createMockCommandRunner();
    const updateCommand = deferredCommand();
    sitesDataPlaneMock.readModelState = readModel;
    sitesDataPlaneMock.commandRunner = commandRunner;
    commandRunner.updateSite.mockReturnValueOnce(updateCommand.promise);

    renderSitesWorkspace({ shellState: "ready" });
    await screen.findByRole("heading", { name: "Dublin Port" });

    await user.click(screen.getByRole("button", { name: /^edit$/i }));
    expect(screen.getByText("Edit site")).toBeInTheDocument();
    await user.clear(screen.getByLabelText("Name"));
    await user.type(screen.getByLabelText("Name"), "Dublin North");
    await user.keyboard("{Escape}");

    expect(screen.queryByText("Edit site")).not.toBeInTheDocument();
    expect(commandRunner.updateSite).not.toHaveBeenCalled();
    expect(
      screen.getByRole("heading", { name: "Dublin Port" })
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /^edit$/i }));
    await user.clear(screen.getByLabelText("Name"));
    await user.type(screen.getByLabelText("Name"), "Dublin North");
    await user.keyboard("{Meta>}{Enter}{/Meta}");

    expect(commandRunner.updateSite).toHaveBeenCalledExactlyOnceWith(
      dublinSite.id,
      {
        accessNotes: dublinSite.accessNotes,
        name: "Dublin North",
      }
    );
    expect(screen.getByText("Site mutation pending")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Saving Dublin Port and waiting for Electric confirmation"
      )
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /save/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /^cancel$/i })).toBeDisabled();

    await user.keyboard("{Meta>}{Enter}{/Meta}");
    await user.keyboard("{Escape}");

    expect(commandRunner.updateSite).toHaveBeenCalledExactlyOnceWith(
      dublinSite.id,
      {
        accessNotes: dublinSite.accessNotes,
        name: "Dublin North",
      }
    );
    expect(screen.getByText("Edit site")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Dublin North")).toBeInTheDocument();
    expect(screen.getByText("Site mutation pending")).toBeInTheDocument();

    const updatedSite = {
      ...dublinSite,
      name: "Dublin North",
      updatedAt: "2026-06-04T00:00:00.000Z",
    } satisfies SiteOption;
    await act(async () => {
      readModel.sites.collection.upsert(updatedSite);
      updateCommand.resolve(makeSuccess(updatedSite, 1002));
      await updateCommand.promise;
    });

    await expect(screen.findByText("Site synced")).resolves.toBeInTheDocument();
    expect(
      screen.getByText(
        "Site synced: Dublin North (site row observed in live data after server txid 1002)"
      )
    ).toBeInTheDocument();
    expect(screen.queryByText("Edit site")).not.toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Dublin North" })
    ).toBeInTheDocument();
  });

  it("assigns and removes labels through pending and Electric-synced states", async () => {
    const user = userEvent.setup();
    const readModel = createReadyReadModelState({
      labels: [maintenanceLabel],
      sites: [dublinSite],
    });
    const commandRunner = createMockCommandRunner();
    const assignCommand = deferredCommand();
    const removeCommand = deferredCommand();
    sitesDataPlaneMock.readModelState = readModel;
    sitesDataPlaneMock.commandRunner = commandRunner;
    commandRunner.assignSiteLabel.mockReturnValueOnce(assignCommand.promise);
    commandRunner.removeSiteLabel.mockReturnValueOnce(removeCommand.promise);

    renderSitesWorkspace({ shellState: "ready" });
    await screen.findByRole("heading", { name: "Dublin Port" });

    await user.click(
      screen.getByRole("button", { name: /assign maintenance/i })
    );

    expect(commandRunner.assignSiteLabel).toHaveBeenCalledWith(dublinSite.id, {
      labelId: maintenanceLabel.id,
    });
    expect(screen.getByText("Site mutation pending")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Assigning Maintenance and waiting for Electric confirmation"
      )
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /assign maintenance/i })
    ).toBeDisabled();

    await act(async () => {
      readModel.siteLabelAssignments.collection.upsert({
        createdAt: "2026-06-04T00:00:00.000Z",
        labelId: maintenanceLabel.id,
        organizationId: "org_123",
        siteId: dublinSite.id,
      });
      assignCommand.resolve(
        makeSuccess(dublinSite, 1003, "site-label-assignments")
      );
      await assignCommand.promise;
    });

    await expect(
      screen.findByText(
        "Maintenance label synced (site label row observed in live data after server txid 1003)"
      )
    ).resolves.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /remove maintenance/i })
    ).toBeEnabled();

    await user.click(
      screen.getByRole("button", { name: /remove maintenance/i })
    );

    expect(commandRunner.removeSiteLabel).toHaveBeenCalledWith(
      dublinSite.id,
      maintenanceLabel.id
    );
    expect(
      screen.getByText(
        "Removing Maintenance and waiting for Electric confirmation"
      )
    ).toBeInTheDocument();

    await act(async () => {
      readModel.siteLabelAssignments.collection.delete(
        `${dublinSite.id}:${maintenanceLabel.id}`
      );
      removeCommand.resolve(
        makeSuccess(dublinSite, 1004, "site-label-assignments")
      );
      await removeCommand.promise;
    });

    await expect(
      screen.findByText(
        "Maintenance label synced (site label row observed in live data after server txid 1004)"
      )
    ).resolves.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /assign maintenance/i })
    ).toBeEnabled();
  });

  it("renders synced site comments with product-safe actors", async () => {
    const readModel = createReadyReadModelState({
      actors: [caseyActor],
      commentBodies: [dublinComment],
      siteCommentEdges: [dublinCommentEdge],
      sites: [dublinSite],
    });
    sitesDataPlaneMock.readModelState = readModel;
    sitesDataPlaneMock.commandRunner = createMockCommandRunner();

    renderSitesWorkspace({ shellState: "ready" });

    await expect(
      screen.findByText("Gate 4 reopened after contractor sign-off.")
    ).resolves.toBeInTheDocument();
    expect(screen.getByText("Casey Morgan · Operations")).toBeInTheDocument();
    expect(screen.queryByText("user_123")).not.toBeInTheDocument();
    expect(
      screen.getByRole("list", { name: /synced site comments/i })
    ).toBeInTheDocument();
  });

  it("adds a site comment with keyboard focus, pending, and synced states", async () => {
    const user = userEvent.setup();
    const readModel = createReadyReadModelState({
      actors: [caseyActor],
      sites: [dublinSite],
    });
    const commandRunner = createMockCommandRunner();
    const commentCommand = deferredCommentCommand();
    sitesDataPlaneMock.readModelState = readModel;
    sitesDataPlaneMock.commandRunner = commandRunner;
    commandRunner.addSiteComment.mockReturnValueOnce(commentCommand.promise);

    renderSitesWorkspace({ shellState: "ready" });
    await screen.findByRole("heading", { name: "Dublin Port" });

    await user.keyboard("m");
    const commentInput = screen.getByLabelText("Comment");
    expect(commentInput).toHaveFocus();
    await user.type(commentInput, "Gate 4 reopened after contractor sign-off.");
    await user.keyboard(getModEnterKeyboardInput());

    expect(commandRunner.addSiteComment).toHaveBeenCalledExactlyOnceWith(
      dublinSite.id,
      { body: "Gate 4 reopened after contractor sign-off." }
    );
    expect(screen.getByText("Comment pending")).toBeInTheDocument();
    expect(
      screen.getByText("Adding site comment and waiting for realtime sync")
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /submit/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /cancel/i })).toBeDisabled();

    await user.keyboard(getModEnterKeyboardInput());
    expect(commandRunner.addSiteComment).toHaveBeenCalledOnce();

    await act(async () => {
      readModel.commentBodies.collection.upsert(dublinComment);
      readModel.siteCommentEdges.collection.upsert(dublinCommentEdge);
      commentCommand.resolve(makeCommentSuccess(dublinComment));
      await commentCommand.promise;
    });

    await expect(
      screen.findByText("Comment synced")
    ).resolves.toBeInTheDocument();
    expect(
      screen.getByText("Comment synced (observed by Electric)")
    ).toBeInTheDocument();
    expect(commentInput).toHaveValue("");
    await waitFor(() => expect(commentInput).toHaveFocus());
    expect(
      screen.getByText("Gate 4 reopened after contractor sign-off.")
    ).toBeInTheDocument();
  });

  it("does not show stale comment completion status after selecting another site", async () => {
    const user = userEvent.setup();
    const readModel = createReadyReadModelState({
      actors: [caseyActor],
      sites: [dublinSite, corkSite],
    });
    const commandRunner = createMockCommandRunner();
    const commentCommand = deferredCommentCommand();
    sitesDataPlaneMock.readModelState = readModel;
    sitesDataPlaneMock.commandRunner = commandRunner;
    commandRunner.addSiteComment.mockReturnValueOnce(commentCommand.promise);

    renderStatefulSitesWorkspace({
      shellState: "ready",
      workspaceSearch: { selectedSiteId: dublinSite.id },
    });
    await screen.findByRole("heading", { name: "Dublin Port" });

    const commentInput = screen.getByLabelText("Comment");
    await user.type(commentInput, "Gate 4 reopened after contractor sign-off.");
    await user.click(screen.getByRole("button", { name: /submit/i }));

    expect(commandRunner.addSiteComment).toHaveBeenCalledExactlyOnceWith(
      dublinSite.id,
      { body: "Gate 4 reopened after contractor sign-off." }
    );
    expect(screen.getByText("Comment pending")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /cork depot/i }));
    await screen.findByRole("heading", { name: "Cork Depot" });
    expect(screen.queryByText("Comment pending")).not.toBeInTheDocument();
    expect(screen.queryByText("Comment synced")).not.toBeInTheDocument();

    const corkCommentInput = screen.getByLabelText("Comment");
    await user.type(corkCommentInput, "Keep Cork draft while Dublin syncs.");

    await act(async () => {
      readModel.commentBodies.collection.upsert(dublinComment);
      readModel.siteCommentEdges.collection.upsert(dublinCommentEdge);
      commentCommand.resolve(makeCommentSuccess(dublinComment));
      await commentCommand.promise;
    });

    expect(screen.getByRole("heading", { name: "Cork Depot" })).toBeVisible();
    expect(screen.queryByText("Comment synced")).not.toBeInTheDocument();
    expect(screen.queryByText("Comment failed")).not.toBeInTheDocument();
    expect(corkCommentInput).toHaveValue("Keep Cork draft while Dublin syncs.");
    expect(
      screen.queryByText("Gate 4 reopened after contractor sign-off.")
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /dublin port/i }));

    await expect(
      screen.findByRole("heading", { name: "Dublin Port" })
    ).resolves.toBeInTheDocument();
    expect(screen.getByText("Comment synced")).toBeInTheDocument();
    expect(
      screen.getByText("Comment synced (observed by Electric)")
    ).toBeInTheDocument();
    expect(
      screen.getByText("Gate 4 reopened after contractor sign-off.")
    ).toBeInTheDocument();
  });

  it("keeps comment text retryable after add-comment failure", async () => {
    const user = userEvent.setup();
    const readModel = createReadyReadModelState({ sites: [dublinSite] });
    const commandRunner = createMockCommandRunner();
    const commentCommand = deferredCommentCommand();
    sitesDataPlaneMock.readModelState = readModel;
    sitesDataPlaneMock.commandRunner = commandRunner;
    commandRunner.addSiteComment.mockReturnValueOnce(commentCommand.promise);

    renderSitesWorkspace({ shellState: "ready" });
    await screen.findByRole("heading", { name: "Dublin Port" });

    const commentInput = screen.getByLabelText("Comment");
    await user.type(commentInput, "Please retry this comment.");
    await user.click(screen.getByRole("button", { name: /submit/i }));

    await act(async () => {
      commentCommand.resolve(await makeCommentFailure("Electric timed out"));
      await commentCommand.promise;
    });

    await expect(
      screen.findByText("Comment failed")
    ).resolves.toBeInTheDocument();
    expect(screen.getByText("Electric timed out")).toBeInTheDocument();
    expect(commentInput).toHaveValue("Please retry this comment.");
    expect(screen.getByRole("button", { name: /submit/i })).toBeEnabled();
  });

  it("renders live site comments from another session without manual refresh", async () => {
    const readModel = createReadyReadModelState({ sites: [dublinSite] });
    sitesDataPlaneMock.readModelState = readModel;
    sitesDataPlaneMock.commandRunner = createMockCommandRunner();

    renderSitesWorkspace({ shellState: "ready" });
    await screen.findByRole("heading", { name: "Dublin Port" });
    expect(
      screen.getByText("No comments are synced for this site yet.")
    ).toBeInTheDocument();

    act(() => {
      readModel.actors.collection.upsert(caseyActor);
      readModel.commentBodies.collection.upsert(dublinComment);
      readModel.siteCommentEdges.collection.upsert(dublinCommentEdge);
    });

    await expect(
      screen.findByText("Gate 4 reopened after contractor sign-off.")
    ).resolves.toBeInTheDocument();
    expect(screen.getByText("Casey Morgan · Operations")).toBeInTheDocument();
  });

  it("keeps the original row visible and edit form retryable after confirmation failure", async () => {
    const user = userEvent.setup();
    const readModel = createReadyReadModelState({
      labels: [maintenanceLabel],
      sites: [dublinSite],
    });
    const commandRunner = createMockCommandRunner();
    const updateCommand = deferredCommand();
    sitesDataPlaneMock.readModelState = readModel;
    sitesDataPlaneMock.commandRunner = commandRunner;
    commandRunner.updateSite.mockReturnValueOnce(updateCommand.promise);

    renderSitesWorkspace({ shellState: "ready" });
    await screen.findByRole("heading", { name: "Dublin Port" });

    await user.click(screen.getByRole("button", { name: /^edit$/i }));
    await user.clear(screen.getByLabelText("Name"));
    await user.type(screen.getByLabelText("Name"), "Dublin North");
    await user.click(screen.getByRole("button", { name: /save/i }));

    expect(screen.getByText("Site mutation pending")).toBeInTheDocument();

    await act(async () => {
      updateCommand.resolve(
        await makeFailure("Electric confirmation timed out")
      );
      await updateCommand.promise;
    });

    await expect(
      screen.findByText("Save site failed")
    ).resolves.toBeInTheDocument();
    expect(
      screen.getByText("Electric confirmation timed out")
    ).toBeInTheDocument();
    expect(screen.getByDisplayValue("Dublin North")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /save/i })).toBeEnabled();
    expect(
      screen.getByRole("button", { name: /dublin port/i })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /dublin north/i })
    ).not.toBeInTheDocument();
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

function renderStatefulSitesWorkspace({
  currentOrganizationRole = "owner",
  shellState = "unavailable",
  workspaceSearch = {},
}: Partial<React.ComponentProps<typeof SitesWorkspaceRouteContent>> = {}) {
  const queryClient = new QueryClient();

  function StatefulSitesWorkspace() {
    const [currentWorkspaceSearch, setCurrentWorkspaceSearch] =
      React.useState(workspaceSearch);
    const onWorkspaceSearchChange = React.useCallback<
      React.ComponentProps<
        typeof SitesWorkspaceRouteContent
      >["onWorkspaceSearchChange"]
    >((nextWorkspaceSearch) => {
      setCurrentWorkspaceSearch((current) => ({
        ...current,
        ...nextWorkspaceSearch,
      }));
    }, []);

    return (
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
              workspaceSearch={currentWorkspaceSearch}
              onWorkspaceSearchChange={onWorkspaceSearchChange}
              shellState={shellState}
            />
          </CommandBarProvider>
        </DataPlaneProvider>
      </HotkeysProvider>
    );
  }

  return render(<StatefulSitesWorkspace />);
}

function createReadyReadModelState({
  actors = [],
  activeJobSummaries = [],
  commentBodies = [],
  labels = [],
  relatedJobs = [],
  siteCommentEdges = [],
  siteLabelAssignments = [],
  sites = [],
}: {
  readonly activeJobSummaries?: readonly SiteActiveJobSummaryElectricRow[];
  readonly actors?: readonly SitesWorkspaceProductActorRow[];
  readonly commentBodies?: readonly SiteCommentBodyRow[];
  readonly labels?: readonly Label[];
  readonly relatedJobs?: readonly JobListItem[];
  readonly siteCommentEdges?: readonly SiteCommentEdgeRow[];
  readonly siteLabelAssignments?: readonly SiteLabelAssignmentElectricRow[];
  readonly sites?: readonly SiteOption[];
}) {
  const actorsCollection =
    createFakeHydratedCollection<SitesWorkspaceProductActorRow>(
      (actor) => actor.id
    );
  const activeJobSummariesCollection =
    createFakeHydratedCollection<SiteActiveJobSummaryElectricRow>(
      (summary) => summary.siteId
    );
  const commentBodiesCollection =
    createFakeHydratedCollection<SiteCommentBodyRow>((comment) => comment.id);
  const labelsCollection = createFakeHydratedCollection<Label>(
    (label) => label.id
  );
  const relatedJobsCollection = createFakeHydratedCollection<JobListItem>(
    (job) => job.id
  );
  const siteCommentEdgesCollection =
    createFakeHydratedCollection<SiteCommentEdgeRow>((edge) => edge.id);
  const siteLabelAssignmentsCollection =
    createFakeHydratedCollection<SiteLabelAssignmentElectricRow>(
      (assignment) => `${assignment.siteId}:${assignment.labelId}`
    );
  const sitesCollection = createFakeHydratedCollection<SiteOption>(
    (site) => site.id
  );

  for (const actor of actors) {
    actorsCollection.upsert(actor);
  }
  for (const summary of activeJobSummaries) {
    activeJobSummariesCollection.upsert(summary);
  }
  for (const comment of commentBodies) {
    commentBodiesCollection.upsert(comment);
  }
  for (const label of labels) {
    labelsCollection.upsert(label);
  }
  for (const job of relatedJobs) {
    relatedJobsCollection.upsert(job);
  }
  for (const edge of siteCommentEdges) {
    siteCommentEdgesCollection.upsert(edge);
  }
  for (const assignment of siteLabelAssignments) {
    siteLabelAssignmentsCollection.upsert(assignment);
  }
  for (const site of sites) {
    sitesCollection.upsert(site);
  }

  return {
    activeJobSummaries: collectionState(
      "site-active-job-summaries",
      activeJobSummariesCollection
    ),
    actors: collectionState("product-activity-actors", actorsCollection),
    commentBodies: collectionState(
      "site-comment-bodies",
      commentBodiesCollection
    ),
    labels: collectionState("labels", labelsCollection),
    relatedJobs: collectionState("site-related-jobs", relatedJobsCollection),
    siteCommentEdges: collectionState(
      "site-comments",
      siteCommentEdgesCollection
    ),
    siteLabelAssignments: collectionState(
      "site-label-assignments",
      siteLabelAssignmentsCollection
    ),
    sites: collectionState("sites", sitesCollection),
  };
}

function collectionState<Item extends object>(
  collection: Parameters<typeof collectionHealth>[0],
  fakeCollection: ReturnType<typeof createFakeHydratedCollection<Item>>
) {
  return {
    collection: fakeCollection,
    health: {
      current: collectionHealth(collection, "ready"),
      subscribe: () => () => null,
    },
  };
}

function createFakeHydratedCollection<Item extends object>(
  getKey: (item: Item) => string | number
) {
  const rows = new Map<string | number, Item>();
  const listeners = new Set<() => void>();
  const emit = () => {
    for (const listener of listeners) {
      listener();
    }
  };

  return {
    delete: (key: string | number) => {
      rows.delete(key);
      emit();
    },
    entries: () => rows.entries(),
    status: "ready",
    subscribeChanges: (callback: () => void) => {
      listeners.add(callback);
      return {
        requestSnapshot: callback,
        unsubscribe: () => {
          listeners.delete(callback);
        },
      };
    },
    upsert: (item: Item) => {
      rows.set(getKey(item), item);
      emit();
    },
  };
}

function createMockCommandRunner() {
  return {
    addSiteComment: vi.fn<SitesWorkspaceCommandRunner["addSiteComment"]>(),
    assignSiteLabel: vi.fn<SitesWorkspaceCommandRunner["assignSiteLabel"]>(),
    createSite: vi.fn<SitesWorkspaceCommandRunner["createSite"]>(),
    removeSiteLabel: vi.fn<SitesWorkspaceCommandRunner["removeSiteLabel"]>(),
    updateSite: vi.fn<SitesWorkspaceCommandRunner["updateSite"]>(),
  };
}

function deferredCommand() {
  return Promise.withResolvers<
    Exit.Exit<SitesWorkspaceCommandResult, unknown>
  >();
}

function deferredCommentCommand() {
  return Promise.withResolvers<
    Exit.Exit<SitesWorkspaceCommentCommandResult, unknown>
  >();
}

function makeSuccess(
  site: SiteOption,
  txid: number,
  collection: SitesWorkspaceCommandResult["electricObservation"]["collection"] = "sites"
): Exit.Exit<SitesWorkspaceCommandResult, unknown> {
  return Effect.runSync(
    Effect.exit(
      Effect.succeed({
        electricObservation: {
          collection,
          kind: "observed-change",
        },
        mutation: { txid },
        site,
      })
    )
  );
}

function makeCommentSuccess(
  comment: SiteCommentBodyRow
): Exit.Exit<SitesWorkspaceCommentCommandResult, unknown> {
  return Effect.runSync(
    Effect.exit(
      Effect.succeed({
        ...comment,
        actor: caseyActor,
        authorName: caseyActor.displayName,
        electricObservation: {
          commentBody: "observed-change",
          commentEdge: "observed-change",
        },
        siteId: dublinSite.id,
      } as SitesWorkspaceCommentCommandResult)
    )
  );
}

function makeFailure(
  message: string
): Promise<Exit.Exit<SitesWorkspaceCommandResult, unknown>> {
  return Effect.runPromiseExit<SitesWorkspaceCommandResult, Error>(
    Effect.fail(new Error(message))
  );
}

function makeCommentFailure(
  message: string
): Promise<Exit.Exit<SitesWorkspaceCommentCommandResult, unknown>> {
  return Effect.runPromiseExit<SitesWorkspaceCommentCommandResult, Error>(
    Effect.fail(new Error(message))
  );
}

const maintenanceLabel = {
  createdAt: "2026-06-01T00:00:00.000Z",
  id: "88888888-8888-4888-8888-888888888888",
  name: "Maintenance",
  updatedAt: "2026-06-01T00:00:00.000Z",
} as unknown as Label;

const dublinSite = makeSite({
  accessNotes: "Gate 4",
  displayLocation: "Dublin Port",
  id: "22222222-2222-4222-8222-222222222222",
  name: "Dublin Port",
  updatedAt: "2026-06-02T00:00:00.000Z",
});

const corkSite = makeSite({
  accessNotes: "Use side entrance",
  displayLocation: "Cork Depot",
  id: "33333333-3333-4333-8333-333333333333",
  name: "Cork Depot",
  updatedAt: "2026-06-02T01:00:00.000Z",
});

const caseyActor = {
  displayDetail: "Operations",
  displayName: "Casey Morgan",
  id: "99999999-1111-4111-8111-999999999999",
  kind: "member",
} as unknown as SitesWorkspaceProductActorRow;

const dublinComment = {
  actorId: caseyActor.id,
  body: "Gate 4 reopened after contractor sign-off.",
  createdAt: "2026-06-05T10:30:00.000Z",
  id: "77777777-7777-4777-8777-777777777777",
  updatedAt: "2026-06-05T10:30:00.000Z",
} as unknown as SiteCommentBodyRow;

const dublinCommentEdge = {
  commentId: dublinComment.id,
  createdAt: dublinComment.createdAt,
  id: `${dublinSite.id}:${dublinComment.id}`,
  siteId: dublinSite.id,
} satisfies SiteCommentEdgeRow;

function makeSite({
  accessNotes,
  displayLocation,
  id,
  name,
  updatedAt,
}: {
  readonly accessNotes?: string | undefined;
  readonly displayLocation: string;
  readonly id: string;
  readonly name: string;
  readonly updatedAt: string;
}): SiteOption {
  return {
    ...(accessNotes === undefined ? {} : { accessNotes }),
    displayLocation,
    hasUsableCoordinates: false,
    id,
    labels: [],
    locationStatus: "unverified",
    name,
    updatedAt,
  } as unknown as SiteOption;
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
