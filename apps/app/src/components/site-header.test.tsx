import { render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";

import { SiteHeader } from "./site-header";

const { mockedUseMatches } = vi.hoisted(() => ({
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
    useMatches: mockedUseMatches as typeof actual.useMatches,
  };
});

vi.mock(import("#/components/ThemeToggle"), () => ({
  default: () => <button type="button">Theme mode</button>,
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
    vi.clearAllMocks();
  });

  it(
    "keeps navigation, route breadcrumbs, and theme controls available",
    {
      timeout: 10_000,
    },
    () => {
      render(<SiteHeader />);

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
    }
  );
});
