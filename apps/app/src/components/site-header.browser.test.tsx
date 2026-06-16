import { HotkeysProvider } from "@tanstack/react-hotkeys";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { SiteHeader } from "./site-header";

const {
  mockedIsMobile,
  mockedNavigate,
  mockedPathname,
  mockedRole,
  mockedSearch,
  mockedShortcutOverlayCalls,
} = vi.hoisted(() => ({
  mockedIsMobile: {
    value: false,
  },
  mockedNavigate: vi.fn<() => Promise<void>>(),
  mockedPathname: {
    value: "/",
  },
  mockedRole: {
    value: undefined as "owner" | "admin" | "member" | "external" | undefined,
  },
  mockedSearch: {
    value: {} as Record<string, unknown>,
  },
  mockedShortcutOverlayCalls: [] as { activeScopes: readonly string[] }[],
}));

function setOrgMatches(
  currentOrganizationRole?: "owner" | "admin" | "member" | "external"
) {
  mockedRole.value = currentOrganizationRole;
}

vi.mock(import("@tanstack/react-router"), async (importActual) => {
  const actual = await importActual();

  return {
    ...actual,
    useMatch: ((options?: {
      select?: (match: {
        context: {
          currentOrganizationRole?: "owner" | "admin" | "member" | "external";
        };
        id?: string;
        routeId?: string;
      }) => unknown;
      shouldThrow?: boolean;
    }) => {
      const match = {
        context: {
          currentOrganizationRole: mockedRole.value,
        },
        id: "/_app/_org",
        routeId: "/_app/_org",
      };

      return options?.select ? options.select(match) : match;
    }) as typeof actual.useMatch,
    useNavigate: () => mockedNavigate,
    useRouterState: ((options?: {
      select?: (state: {
        location: { pathname: string; search: Record<string, unknown> };
      }) => unknown;
    }) => {
      const state = {
        location: {
          pathname: mockedPathname.value,
          search: mockedSearch.value,
        },
      };

      return options?.select ? options.select(state) : state;
    }) as typeof actual.useRouterState,
  };
});

vi.mock(import("#/hotkeys/shortcut-help-overlay"), () => ({
  ShortcutHelpOverlay: ({
    activeScopes,
    buttonClassName,
    labelClassName,
  }: {
    activeScopes: readonly string[];
    buttonClassName?: string;
    labelClassName?: string;
  }) => {
    mockedShortcutOverlayCalls.push({ activeScopes });

    return (
      <button
        type="button"
        aria-label="Keyboard shortcuts"
        className={buttonClassName}
        data-label-class-name={labelClassName}
      >
        Keyboard shortcuts
      </button>
    );
  },
}));

vi.mock(import("#/components/ui/sidebar"), async (importActual) => {
  const actual = await importActual();

  return {
    ...actual,
    SidebarTrigger: (({
      className,
      "aria-label": ariaLabel,
    }: Parameters<typeof actual.SidebarTrigger>[0]) => (
      <button
        type="button"
        data-testid="sidebar-trigger"
        data-class-name={typeof className === "string" ? className : undefined}
        aria-label={ariaLabel}
      />
    )) as typeof actual.SidebarTrigger,
    useSidebar: () => ({
      state: "expanded" as const,
      open: true,
      setOpen: () => {},
      openMobile: false,
      setOpenMobile: () => {},
      isMobile: mockedIsMobile.value,
      toggleSidebar: () => {},
    }),
  };
});

describe("site header", () => {
  beforeEach(() => {
    mockedIsMobile.value = false;
    mockedPathname.value = "/";
    setOrgMatches();
    mockedSearch.value = {};
    mockedShortcutOverlayCalls.length = 0;
  });

  afterEach(() => {
    if (typeof window.localStorage?.clear === "function") {
      window.localStorage.clear();
    }
    vi.clearAllMocks();
  });

  it(
    "keeps the sidebar trigger available without duplicating page actions",
    {
      timeout: 10_000,
    },
    () => {
      render(
        <HotkeysProvider>
          <SiteHeader />
        </HotkeysProvider>
      );

      expect(
        screen.getByRole("button", { name: /toggle navigation/i })
      ).toBeInTheDocument();
      expect(screen.queryByRole("search")).not.toBeInTheDocument();
      expect(screen.queryByText("Workspace")).not.toBeInTheDocument();
      expect(screen.queryByText("Jobs")).not.toBeInTheDocument();
      expect(screen.queryByText("Ceird")).not.toBeInTheDocument();
      expect(screen.queryByText("Your work")).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: /theme mode/i })
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: /keyboard shortcuts/i })
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: /ask ceird/i })
      ).not.toBeInTheDocument();
    }
  );

  it("shows an accessible Ask Ceird shell action when agent access is available", async () => {
    const user = userEvent.setup();
    const onOpenAgentChat = vi.fn<() => void>();

    render(
      <HotkeysProvider>
        <SiteHeader
          canUseAgent
          agentChatOpen={false}
          currentOrganizationRole="owner"
          onOpenAgentChat={onOpenAgentChat}
        />
      </HotkeysProvider>
    );

    const button = screen.getByRole("button", { name: "Ask Ceird" });
    expect(button).toHaveAttribute("aria-haspopup", "dialog");
    expect(button).toHaveAttribute("aria-expanded", "false");

    await user.hover(button);

    await expect(screen.findByText("Ask Ceird")).resolves.toBeVisible();
    await expect(
      screen.findByLabelText(/ask ceird shortcut/i)
    ).resolves.toBeVisible();

    await user.click(button);

    expect(onOpenAgentChat).toHaveBeenCalledOnce();
  });

  it("reflects the expanded state for the Ask Ceird shell action", () => {
    render(
      <HotkeysProvider>
        <SiteHeader
          canUseAgent
          agentChatOpen
          currentOrganizationRole="owner"
          onOpenAgentChat={vi.fn<() => void>()}
        />
      </HotkeysProvider>
    );

    expect(screen.getByRole("button", { name: "Ask Ceird" })).toHaveAttribute(
      "aria-expanded",
      "true"
    );
  });

  it("keeps the Ask Ceird shell action disabled until shell controls are ready", async () => {
    const user = userEvent.setup();
    const onOpenAgentChat = vi.fn<() => void>();
    const { rerender } = render(
      <HotkeysProvider>
        <SiteHeader
          canUseAgent
          agentChatControlsReady={false}
          currentOrganizationRole="owner"
          onOpenAgentChat={onOpenAgentChat}
        />
      </HotkeysProvider>
    );

    const button = screen.getByRole("button", { name: "Ask Ceird" });
    expect(button).toBeDisabled();

    await user.click(button);

    expect(onOpenAgentChat).not.toHaveBeenCalled();

    rerender(
      <HotkeysProvider>
        <SiteHeader
          canUseAgent
          agentChatControlsReady
          currentOrganizationRole="owner"
          onOpenAgentChat={onOpenAgentChat}
        />
      </HotkeysProvider>
    );

    await user.click(screen.getByRole("button", { name: "Ask Ceird" }));

    expect(onOpenAgentChat).toHaveBeenCalledOnce();
  });

  it("exposes shortcut help directly in the mobile header", () => {
    mockedIsMobile.value = true;
    mockedPathname.value = "/jobs";
    mockedSearch.value = { view: "map" };

    render(
      <HotkeysProvider>
        <SiteHeader />
      </HotkeysProvider>
    );

    expect(
      screen.getByRole("button", { name: /keyboard shortcuts/i })
    ).toBeInTheDocument();
    expect(mockedShortcutOverlayCalls.at(-1)?.activeScopes).toStrictEqual([
      "global",
      "jobs-workspace",
    ]);
  });

  it.each(["owner", "admin", "member"] as const)(
    "enables the activity route hotkey for internal %s role",
    { timeout: 10_000 },
    async (role) => {
      const user = userEvent.setup();
      setOrgMatches(role);

      render(
        <HotkeysProvider>
          <SiteHeader />
        </HotkeysProvider>
      );

      await user.keyboard("ga");

      expect(mockedNavigate).toHaveBeenCalledWith({
        search: {
          eventType: undefined,
          status: undefined,
          targetType: undefined,
        },
        to: "/activity",
      });
    }
  );

  it.each([undefined] as const)(
    "does not enable the activity route hotkey for %s role",
    { timeout: 10_000 },
    async (role) => {
      const user = userEvent.setup();
      setOrgMatches(role);

      render(
        <HotkeysProvider>
          <SiteHeader />
        </HotkeysProvider>
      );

      await user.keyboard("ga");

      expect(mockedNavigate).not.toHaveBeenCalled();
    }
  );

  it.each(["owner", "admin", "member"] as const)(
    "enables the sites route hotkey for internal %s role",
    { timeout: 10_000 },
    async (role) => {
      const user = userEvent.setup();
      setOrgMatches(role);

      render(
        <HotkeysProvider>
          <SiteHeader />
        </HotkeysProvider>
      );

      await user.keyboard("gs");

      expect(mockedNavigate).toHaveBeenCalledWith({ to: "/sites" });
    }
  );

  it("does not enable the sites route hotkey for external role", async () => {
    const user = userEvent.setup();
    setOrgMatches("external");

    render(
      <HotkeysProvider>
        <SiteHeader />
      </HotkeysProvider>
    );

    await user.keyboard("gs");

    expect(mockedNavigate).not.toHaveBeenCalled();
  }, 10_000);
});
