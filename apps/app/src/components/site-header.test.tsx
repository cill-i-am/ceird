import { HotkeysProvider } from "@tanstack/react-hotkeys";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";

import { SiteHeader } from "./site-header";

const {
  mockedActiveScopes,
  mockedNavigate,
  mockedPathname,
  mockedRole,
  mockedSearch,
  mockedUseMatches,
} = vi.hoisted(() => ({
  mockedActiveScopes: [] as unknown[],
  mockedNavigate: vi.fn<() => Promise<void>>(),
  mockedPathname: {
    value: "/jobs",
  },
  mockedRole: {
    value: undefined as "owner" | "admin" | "member" | "external" | undefined,
  },
  mockedSearch: {
    value: {} as Record<string, unknown>,
  },
  mockedUseMatches:
    vi.fn<(input: { select: (matches: unknown[]) => unknown }) => unknown>(),
}));

function setOrgMatches(
  currentOrganizationRole?: "owner" | "admin" | "member" | "external"
) {
  mockedRole.value = currentOrganizationRole;
  mockedUseMatches.mockImplementation(({ select }) =>
    select([
      { id: "__root__", staticData: {} },
      { id: "/_app", staticData: {} },
      {
        context: {
          currentOrganizationRole,
        },
        id: "/_app/_org",
        routeId: "/_app/_org",
        staticData: {},
      },
      {
        id: "/_app/_org/jobs",
        staticData: {
          breadcrumb: {
            label: "Jobs",
            to: "/jobs",
          },
        },
      },
    ])
  );
}

vi.mock(import("@tanstack/react-router"), async (importActual) => {
  const actual = await importActual();

  return {
    ...actual,
    Link: (({
      children,
      to,
      ...props
    }: ComponentProps<"a"> & { to?: string }) => (
      <a href={to} {...props}>
        {children}
      </a>
    )) as typeof actual.Link,
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
    useMatches: mockedUseMatches as typeof actual.useMatches,
    useRouterState: ((options?: {
      select?: (state: { location: { pathname: string } }) => unknown;
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

vi.mock(import("#/components/ThemeToggle"), () => ({
  default: () => <button type="button">Theme mode</button>,
}));

vi.mock(import("#/hotkeys/shortcut-help-overlay"), () => ({
  ShortcutHelpOverlay: ({
    activeScopes,
  }: {
    activeScopes: readonly string[];
  }) => {
    mockedActiveScopes.push(activeScopes);

    return <button type="button">Keyboard shortcuts</button>;
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
  };
});

describe("site header", () => {
  beforeEach(() => {
    mockedActiveScopes.length = 0;
    mockedPathname.value = "/jobs";
    mockedSearch.value = {};
    setOrgMatches();
  });

  afterEach(() => {
    if (typeof window.localStorage.clear === "function") {
      window.localStorage.clear();
    }
    vi.clearAllMocks();
  });

  it(
    "keeps navigation, route breadcrumbs, and theme controls available",
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
      expect(screen.getByText("Jobs")).toBeInTheDocument();
      expect(screen.queryByText("Ceird")).not.toBeInTheDocument();
      expect(screen.queryByText("Your work")).not.toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /theme mode/i })
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: /keyboard shortcuts/i })
      ).toBeInTheDocument();
    }
  );

  it(
    "activates job drawer shortcut scopes for job drawer routes",
    { timeout: 10_000 },
    () => {
      mockedPathname.value = "/jobs/new";

      const { rerender } = render(
        <HotkeysProvider>
          <SiteHeader />
        </HotkeysProvider>
      );

      expect(
        screen.getByRole("button", { name: /keyboard shortcuts/i })
      ).toBeInTheDocument();
      expect(mockedActiveScopes.at(-1)).toStrictEqual([
        "global",
        "jobs",
        "job-create",
      ]);

      mockedPathname.value = "/jobs/11111111-1111-4111-8111-111111111111";

      rerender(
        <HotkeysProvider>
          <SiteHeader />
        </HotkeysProvider>
      );

      expect(
        screen.getByRole("button", { name: /keyboard shortcuts/i })
      ).toBeInTheDocument();
      expect(mockedActiveScopes.at(-1)).toStrictEqual([
        "global",
        "jobs",
        "job-detail",
      ]);
    }
  );

  it(
    "activates members, settings, and map shortcut scopes on matching routes",
    { timeout: 10_000 },
    () => {
      mockedPathname.value = "/members";

      const { rerender } = render(
        <HotkeysProvider>
          <SiteHeader />
        </HotkeysProvider>
      );

      expect(mockedActiveScopes.at(-1)).toStrictEqual(["global", "members"]);

      mockedPathname.value = "/settings";

      rerender(
        <HotkeysProvider>
          <SiteHeader />
        </HotkeysProvider>
      );

      expect(mockedActiveScopes.at(-1)).toStrictEqual(["global", "settings"]);

      mockedPathname.value = "/organization/settings";

      rerender(
        <HotkeysProvider>
          <SiteHeader />
        </HotkeysProvider>
      );

      expect(mockedActiveScopes.at(-1)).toStrictEqual(["global", "settings"]);

      mockedPathname.value = "/jobs";
      mockedSearch.value = { view: "map" };

      rerender(
        <HotkeysProvider>
          <SiteHeader />
        </HotkeysProvider>
      );

      expect(mockedActiveScopes.at(-1)).toStrictEqual([
        "global",
        "jobs",
        "map",
      ]);

      mockedSearch.value = {};

      rerender(
        <HotkeysProvider>
          <SiteHeader />
        </HotkeysProvider>
      );

      expect(mockedActiveScopes.at(-1)).toStrictEqual(["global", "jobs"]);
    }
  );

  it(
    "uses only global shortcut scope on the activity route",
    { timeout: 10_000 },
    () => {
      mockedPathname.value = "/activity";

      render(
        <HotkeysProvider>
          <SiteHeader />
        </HotkeysProvider>
      );

      expect(mockedActiveScopes.at(-1)).toStrictEqual(["global"]);
    }
  );

  it.each(["owner", "admin"] as const)(
    "enables the activity route hotkey for %s role",
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
          actorUserId: undefined,
          eventType: undefined,
          fromDate: undefined,
          jobTitle: undefined,
          toDate: undefined,
        },
        to: "/activity",
      });
    }
  );

  it.each(["member", undefined] as const)(
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
