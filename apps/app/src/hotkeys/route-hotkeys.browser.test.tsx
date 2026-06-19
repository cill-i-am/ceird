import { HotkeysProvider } from "@tanstack/react-hotkeys";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { RouteHotkeys } from "./route-hotkeys";
import { ShortcutHelpOverlay } from "./shortcut-help-overlay";

const { mockedNavigate } = vi.hoisted(() => ({
  mockedNavigate: vi.fn<() => Promise<void>>(),
}));

vi.mock(import("@tanstack/react-router"), async (importActual) => {
  const actual = await importActual();

  return {
    ...actual,
    useNavigate: () => mockedNavigate,
  };
});

describe("route hotkeys", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it.each(["owner", "admin"] as const)(
    "registers activity navigation for %s role in the shortcut overlay",
    async (role) => {
      const user = userEvent.setup();

      render(
        <HotkeysProvider>
          <RouteHotkeys currentOrganizationRole={role} />
          <ShortcutHelpOverlay activeScopes={["global"]} />
        </HotkeysProvider>
      );

      await user.click(
        screen.getByRole("button", { name: /keyboard shortcuts/i })
      );

      const dialog = await screen.findByRole("dialog", {
        name: /keyboard shortcuts/i,
      });

      expect(within(dialog).getByText("Go to Home")).toBeVisible();
      expect(within(dialog).getByText("Go to Jobs")).toBeVisible();
      expect(within(dialog).getByText("Go to Sites")).toBeVisible();
      expect(within(dialog).getByText("Go to Activity")).toBeVisible();
      expect(within(dialog).getByText("Go to Security activity")).toBeVisible();
      expect(within(dialog).getByText("Go to Members")).toBeVisible();
      expect(
        within(dialog).getByText("Go to organization settings")
      ).toBeVisible();
      expect(within(dialog).getByText("Go to Labels settings")).toBeVisible();
      expect(within(dialog).getByText("Go to user settings")).toBeVisible();
      expect(within(dialog).queryByText("Go to Map")).not.toBeInTheDocument();
    },
    10_000
  );

  it("hides administrator navigation for member role in the shortcut overlay", async () => {
    const user = userEvent.setup();

    render(
      <HotkeysProvider>
        <RouteHotkeys currentOrganizationRole="member" />
        <ShortcutHelpOverlay activeScopes={["global"]} />
      </HotkeysProvider>
    );

    await user.click(
      screen.getByRole("button", { name: /keyboard shortcuts/i })
    );

    const dialog = await screen.findByRole("dialog", {
      name: /keyboard shortcuts/i,
    });

    expect(within(dialog).getByText("Go to Jobs")).toBeVisible();
    expect(within(dialog).getByText("Go to Home")).toBeVisible();
    expect(within(dialog).getByText("Go to Sites")).toBeVisible();
    expect(within(dialog).getByText("Go to Activity")).toBeVisible();
    expect(
      within(dialog).queryByText("Go to Security activity")
    ).not.toBeInTheDocument();
    expect(within(dialog).queryByText("Go to Members")).not.toBeInTheDocument();
    expect(
      within(dialog).queryByText("Go to organization settings")
    ).not.toBeInTheDocument();
    expect(
      within(dialog).queryByText("Go to Labels settings")
    ).not.toBeInTheDocument();
    expect(within(dialog).getByText("Go to user settings")).toBeVisible();
    expect(within(dialog).queryByText("Go to Map")).not.toBeInTheDocument();
  }, 10_000);

  it.each(["external", undefined] as const)(
    "hides internal navigation for %s role in the shortcut overlay",
    async (role) => {
      const user = userEvent.setup();

      render(
        <HotkeysProvider>
          <RouteHotkeys currentOrganizationRole={role} />
          <ShortcutHelpOverlay activeScopes={["global"]} />
        </HotkeysProvider>
      );

      await user.click(
        screen.getByRole("button", { name: /keyboard shortcuts/i })
      );

      const dialog = await screen.findByRole("dialog", {
        name: /keyboard shortcuts/i,
      });

      expect(within(dialog).queryByText("Go to Home")).not.toBeInTheDocument();
      expect(within(dialog).queryByText("Go to Jobs")).not.toBeInTheDocument();
      expect(
        within(dialog).queryByText("Go to Jobs Workspace")
      ).not.toBeInTheDocument();
      expect(within(dialog).queryByText("Go to Sites")).not.toBeInTheDocument();
      expect(
        within(dialog).queryByText("Go to Activity")
      ).not.toBeInTheDocument();
      expect(
        within(dialog).queryByText("Go to Security activity")
      ).not.toBeInTheDocument();
      expect(
        within(dialog).queryByText("Go to Members")
      ).not.toBeInTheDocument();
      expect(
        within(dialog).queryByText("Go to organization settings")
      ).not.toBeInTheDocument();
      expect(
        within(dialog).queryByText("Go to Labels settings")
      ).not.toBeInTheDocument();
      expect(within(dialog).getByText("Go to user settings")).toBeVisible();
      expect(within(dialog).queryByText("Go to Map")).not.toBeInTheDocument();
    },
    10_000
  );

  it("registers live global navigation sequences in the shortcut overlay", async () => {
    const user = userEvent.setup();

    render(
      <HotkeysProvider>
        <RouteHotkeys currentOrganizationRole="owner" />
        <ShortcutHelpOverlay activeScopes={["global"]} />
      </HotkeysProvider>
    );

    await user.click(
      screen.getByRole("button", { name: /keyboard shortcuts/i })
    );

    const dialog = await screen.findByRole("dialog", {
      name: /keyboard shortcuts/i,
    });

    expect(within(dialog).getByText("Go to Home")).toBeVisible();
    expect(within(dialog).getByText("Go to Jobs")).toBeVisible();
    expect(within(dialog).getByText("Go to Sites")).toBeVisible();
    expect(within(dialog).getByText("Go to Activity")).toBeVisible();
    expect(within(dialog).getByText("Go to Security activity")).toBeVisible();
    expect(within(dialog).getByText("Go to Members")).toBeVisible();
    expect(
      within(dialog).getByText("Go to organization settings")
    ).toBeVisible();
    expect(within(dialog).getByText("Go to Labels settings")).toBeVisible();
    expect(within(dialog).getByText("Go to user settings")).toBeVisible();
    expect(within(dialog).queryByText("Go to Map")).not.toBeInTheDocument();
  }, 10_000);

  it.each(["owner", "admin"] as const)(
    "navigates with administrator global navigation sequences for %s role",
    async (role) => {
      const user = userEvent.setup();

      render(
        <HotkeysProvider>
          <RouteHotkeys currentOrganizationRole={role} />
        </HotkeysProvider>
      );

      await user.keyboard("gj");
      await user.keyboard("gh");
      await user.keyboard("gs");
      await user.keyboard("ga");
      await user.keyboard("gy");
      await user.keyboard("gm");
      await user.keyboard("gw");
      await user.keyboard("gl");
      await user.keyboard("gt");

      expect(mockedNavigate).toHaveBeenNthCalledWith(1, { to: "/jobs" });
      expect(mockedNavigate).toHaveBeenNthCalledWith(2, { to: "/" });
      expect(mockedNavigate).toHaveBeenNthCalledWith(3, { to: "/sites" });
      expect(mockedNavigate).toHaveBeenNthCalledWith(4, {
        search: {
          eventType: undefined,
          status: undefined,
          targetType: undefined,
        },
        to: "/activity",
      });
      expect(mockedNavigate).toHaveBeenNthCalledWith(5, {
        search: {
          actorUserId: undefined,
          cursor: undefined,
          eventType: undefined,
          fromDate: undefined,
          limit: 50,
          targetSearch: undefined,
          targetType: undefined,
          toDate: undefined,
        },
        to: "/organization/security",
      });
      expect(mockedNavigate).toHaveBeenNthCalledWith(6, { to: "/members" });
      expect(mockedNavigate).toHaveBeenNthCalledWith(7, {
        to: "/organization/settings",
      });
      expect(mockedNavigate).toHaveBeenNthCalledWith(8, {
        to: "/organization/settings/labels",
      });
      expect(mockedNavigate).toHaveBeenNthCalledWith(9, { to: "/settings" });
    },
    10_000
  );

  it("navigates to internal routes but not administrator routes for member role", async () => {
    const user = userEvent.setup();

    render(
      <HotkeysProvider>
        <RouteHotkeys currentOrganizationRole="member" />
      </HotkeysProvider>
    );

    await user.keyboard("ga");
    await user.keyboard("gy");
    await user.keyboard("gm");
    await user.keyboard("gw");
    await user.keyboard("gl");
    await user.keyboard("gh");
    await user.keyboard("gj");
    await user.keyboard("gs");

    expect(mockedNavigate).toHaveBeenNthCalledWith(1, {
      search: {
        eventType: undefined,
        status: undefined,
        targetType: undefined,
      },
      to: "/activity",
    });
    expect(mockedNavigate).toHaveBeenNthCalledWith(2, { to: "/" });
    expect(mockedNavigate).toHaveBeenNthCalledWith(3, { to: "/jobs" });
    expect(mockedNavigate).toHaveBeenNthCalledWith(4, { to: "/sites" });
  }, 10_000);

  it.each(["external", undefined] as const)(
    "does not navigate to internal or administrator routes for %s role",
    async (role) => {
      const user = userEvent.setup();

      render(
        <HotkeysProvider>
          <RouteHotkeys currentOrganizationRole={role} />
        </HotkeysProvider>
      );

      await user.keyboard("ga");
      await user.keyboard("gy");
      await user.keyboard("gm");
      await user.keyboard("gw");
      await user.keyboard("gl");
      await user.keyboard("gh");
      await user.keyboard("gj");
      await user.keyboard("gr");

      expect(mockedNavigate).not.toHaveBeenCalled();
    },
    10_000
  );

  it.each(["external", undefined] as const)(
    "does not navigate to map for %s role",
    async (role) => {
      const user = userEvent.setup();

      render(
        <HotkeysProvider>
          <RouteHotkeys currentOrganizationRole={role} />
        </HotkeysProvider>
      );

      await user.keyboard("gp");
      await user.keyboard("gj");

      expect(mockedNavigate).not.toHaveBeenCalled();
    },
    10_000
  );
});
