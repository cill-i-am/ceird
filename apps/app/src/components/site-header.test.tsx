import { HotkeysProvider } from "@tanstack/react-hotkeys";
import { render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";

import { SiteHeader } from "./site-header";

const { mockedActiveScopes, mockedNavigate, mockedPathname, mockedUseMatches } =
  vi.hoisted(() => ({
    mockedActiveScopes: [] as unknown[],
    mockedNavigate: vi.fn<() => Promise<void>>(),
    mockedPathname: {
      value: "/jobs",
    },
    mockedUseMatches:
      vi.fn<(input: { select: (matches: unknown[]) => unknown }) => unknown>(),
  }));

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
    useNavigate: () => mockedNavigate,
    useMatches: mockedUseMatches as typeof actual.useMatches,
    useRouterState: ((options?: {
      select?: (state: { location: { pathname: string } }) => unknown;
    }) => {
      const state = {
        location: {
          pathname: mockedPathname.value,
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
    mockedUseMatches.mockImplementation(({ select }) =>
      select([
        { id: "__root__", staticData: {} },
        { id: "/_app", staticData: {} },
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
      expect(screen.queryByText("Task Tracker")).not.toBeInTheDocument();
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
});
