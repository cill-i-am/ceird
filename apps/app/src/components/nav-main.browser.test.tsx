import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { cloneElement, isValidElement } from "react";
import type { ComponentProps, ReactNode } from "react";

import { getPrimaryNavItemsForRole } from "./app-navigation";
import { NavMain } from "./nav-main";

const { mockedPathname } = vi.hoisted(() => ({
  mockedPathname: {
    value: "/projects/alpha",
  },
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

vi.mock(import("#/components/ui/collapsible"), async () => {
  const React = await import("react");
  const openContextValue = Object.freeze({
    open: true,
  });
  const closedContextValue = Object.freeze({
    open: false,
  });

  const CollapsibleContext = React.createContext<{
    onOpenChange?: (open: boolean) => void;
    open: boolean;
  }>({
    onOpenChange: undefined,
    open: false,
  });

  return {
    Collapsible: (({
      children,
      defaultOpen,
      onOpenChange,
      open,
      render: renderSlot,
    }: {
      children?: ReactNode;
      defaultOpen?: boolean;
      onOpenChange?: (open: boolean) => void;
      open?: boolean;
      render?: ReactNode;
    }) => {
      const [uncontrolledOpen] = React.useState(Boolean(defaultOpen));
      const resolvedOpen = open ?? uncontrolledOpen;
      const content = (
        <CollapsibleContext.Provider
          value={{
            ...(resolvedOpen ? openContextValue : closedContextValue),
            onOpenChange,
          }}
        >
          {children}
        </CollapsibleContext.Provider>
      );

      if (isValidElement(renderSlot)) {
        return React.cloneElement(
          renderSlot as React.ReactElement<{
            "data-testid"?: string;
            "data-open"?: string;
          }>,
          {
            "data-testid": "collapsible",
            "data-open": String(resolvedOpen),
          },
          content
        );
      }

      return (
        <div data-testid="collapsible" data-open={String(resolvedOpen)}>
          {content}
        </div>
      );
    }) as never,
    CollapsibleTrigger: (({
      children,
      onClick,
      ...props
    }: ComponentProps<"button">) => {
      const { onOpenChange, open } = React.useContext(CollapsibleContext);

      return (
        <button
          type="button"
          aria-expanded={open}
          onClick={(event) => {
            onClick?.(event);
            onOpenChange?.(!open);
          }}
          {...props}
        >
          {children}
        </button>
      );
    }) as never,
    CollapsibleContent: (({ children }: { children?: ReactNode }) => {
      const { open } = React.useContext(CollapsibleContext);

      return open ? <div>{children}</div> : null;
    }) as never,
  };
});

vi.mock(import("#/components/ui/sidebar"), () => ({
  SidebarGroup: ({ children }: { children?: ReactNode }) => (
    <div>{children}</div>
  ),
  SidebarGroupLabel: ({ children }: { children?: ReactNode }) => (
    <div>{children}</div>
  ),
  SidebarMenu: ({ children }: { children?: ReactNode }) => <ul>{children}</ul>,
  SidebarMenuItem: ({
    children,
    ...props
  }: ComponentProps<"li"> & { children?: ReactNode }) => (
    <li {...props}>{children}</li>
  ),
  SidebarMenuButton: ({
    children,
    isActive,
    render: renderProp,
  }: {
    children?: ReactNode;
    isActive?: boolean;
    render?: unknown;
  }) => {
    const href = isValidElement<{ href?: string; to?: string }>(renderProp)
      ? (renderProp.props.to ?? renderProp.props.href)
      : undefined;

    return href ? (
      <a href={href} data-testid="menu-button" data-active={String(isActive)}>
        {children}
      </a>
    ) : (
      <button
        type="button"
        data-testid="menu-button"
        data-active={String(isActive)}
      >
        {children}
      </button>
    );
  },
  SidebarMenuAction: ({
    children,
    render: renderProp,
  }: {
    children?: ReactNode;
    render?: unknown;
  }) => {
    if (isValidElement<{ children?: ReactNode }>(renderProp)) {
      return cloneElement(renderProp, undefined, children);
    }

    return <button type="button">{children}</button>;
  },
  SidebarMenuSub: ({ children }: { children?: ReactNode }) => (
    <ul>{children}</ul>
  ),
  SidebarMenuSubItem: ({ children }: { children?: ReactNode }) => (
    <li>{children}</li>
  ),
  SidebarMenuSubButton: ({
    children,
    isActive,
    render: renderProp,
  }: {
    children?: ReactNode;
    isActive?: boolean;
    render?: unknown;
  }) => {
    const href = isValidElement<{ href?: string; to?: string }>(renderProp)
      ? (renderProp.props.to ?? renderProp.props.href)
      : undefined;

    return href ? (
      <a
        href={href}
        data-testid="submenu-button"
        data-active={String(isActive)}
      >
        {children}
      </a>
    ) : (
      <button
        type="button"
        data-testid="submenu-button"
        data-active={String(isActive)}
      >
        {children}
      </button>
    );
  },
}));

describe("nav main", () => {
  it(
    "filters primary navigation items by organization role",
    {
      timeout: 10_000,
    },
    () => {
      for (const role of ["owner", "admin"] as const) {
        expect(
          getPrimaryNavItemsForRole(role).map((item) => item.url)
        ).toStrictEqual([
          "/",
          "/jobs",
          "/jobs-workspace",
          "/sites",
          "/activity",
          "/organization/security",
          "/members",
        ]);
      }

      expect(
        getPrimaryNavItemsForRole("member").map((item) => item.url)
      ).toStrictEqual(["/", "/jobs", "/jobs-workspace", "/sites"]);
      expect(
        getPrimaryNavItemsForRole("external").map((item) => item.url)
      ).toStrictEqual(["/jobs"]);
      expect(getPrimaryNavItemsForRole().map((item) => item.url)).toStrictEqual(
        ["/jobs"]
      );
    }
  );

  it(
    "keeps submenu expansion and active state in sync with route changes",
    {
      timeout: 10_000,
    },
    () => {
      const items = [
        {
          title: "Projects",
          url: "/projects",
          icon: <span aria-hidden="true">P</span>,
          items: [
            {
              title: "Alpha",
              url: "/projects/alpha",
            },
          ],
        },
        {
          title: "Members",
          url: "/members",
          icon: <span aria-hidden="true">M</span>,
        },
      ];

      const { rerender } = render(<NavMain items={items} />);
      const [projectsSection] = screen.getAllByTestId("collapsible");

      expect(projectsSection).toHaveAttribute("data-open", "true");
      const projectsLink = screen.getByRole("link", { name: /projects/i });
      expect(projectsLink).toHaveAttribute("data-active", "true");
      expect(within(projectsLink).getByText("Projects")).not.toHaveClass(
        "sr-only"
      );
      expect(screen.getByRole("link", { name: /alpha/i })).toHaveAttribute(
        "data-active",
        "true"
      );

      mockedPathname.value = "/members";
      rerender(<NavMain items={items} />);

      expect(screen.getAllByTestId("collapsible")[0]).toHaveAttribute(
        "data-open",
        "false"
      );
      expect(
        screen.queryByRole("link", { name: /alpha/i })
      ).not.toBeInTheDocument();
      expect(screen.getByRole("link", { name: /projects/i })).toHaveAttribute(
        "data-active",
        "false"
      );
      const membersLink = screen.getByRole("link", { name: /members/i });
      expect(membersLink).toHaveAttribute("data-active", "true");
      expect(within(membersLink).getByText("Members")).not.toHaveClass(
        "sr-only"
      );
    }
  );

  it("honors explicit item active state", () => {
    mockedPathname.value = "/settings";

    render(
      <NavMain
        items={[
          {
            title: "Jobs",
            url: "/jobs",
            icon: <span aria-hidden="true">J</span>,
            isActive: true,
          },
        ]}
      />
    );

    expect(screen.getByRole("link", { name: /jobs/i })).toHaveAttribute(
      "data-active",
      "true"
    );
  });

  it("renders shortcut hints for primary navigation links", () => {
    mockedPathname.value = "/";

    render(
      <NavMain
        items={[
          {
            title: "Home",
            url: "/",
            icon: <span aria-hidden="true">Home icon</span>,
          },
          {
            title: "Jobs",
            url: "/jobs",
            icon: <span aria-hidden="true">Jobs icon</span>,
          },
        ]}
      />
    );

    const homeLink = screen.getByRole("link", { name: /home/i });
    const jobsLink = screen.getByRole("link", { name: /jobs/i });

    expect(within(homeLink).getByText("G")).toBeInTheDocument();
    expect(within(homeLink).getByText("H")).toBeInTheDocument();
    expect(within(jobsLink).getByText("G")).toBeInTheDocument();
    expect(within(jobsLink).getByText("J")).toBeInTheDocument();
  });

  it("does not reveal active route shortcut hints without hover or focus", () => {
    mockedPathname.value = "/jobs";

    render(
      <NavMain
        items={[
          {
            title: "Jobs",
            url: "/jobs",
            icon: <span aria-hidden="true">Jobs icon</span>,
          },
        ]}
      />
    );

    const jobsLink = screen.getByRole("link", { name: /jobs/i });
    const shortcutHint = jobsLink.querySelector('[data-slot="shortcut-hint"]');

    expect(jobsLink).toHaveAttribute("data-active", "true");
    expect(shortcutHint).toHaveClass("opacity-0");
    expect(shortcutHint).toHaveClass("group-hover/menu-button:opacity-100");
    expect(shortcutHint).toHaveClass(
      "group-focus-visible/menu-button:opacity-100"
    );
    expect(shortcutHint).not.toHaveClass(
      "group-data-active/menu-button:opacity-100"
    );
  });

  it("keys manual submenu expansion by URL", async () => {
    const user = userEvent.setup();
    mockedPathname.value = "/members";

    const items = [
      {
        title: "Projects",
        url: "/projects",
        icon: <span aria-hidden="true">P</span>,
        items: [
          {
            title: "Alpha",
            url: "/projects/alpha",
          },
        ],
      },
      {
        title: "Members",
        url: "/members",
        icon: <span aria-hidden="true">M</span>,
      },
    ];

    const { rerender } = render(<NavMain items={items} />);

    expect(screen.getAllByTestId("collapsible")[0]).toHaveAttribute(
      "data-open",
      "false"
    );

    await user.click(screen.getByRole("button", { name: /toggle/i }));

    expect(screen.getAllByTestId("collapsible")[0]).toHaveAttribute(
      "data-open",
      "true"
    );

    const [workItem, membersItem] = items;

    if (workItem === undefined || membersItem === undefined) {
      throw new Error("Expected navigation fixture to include two items");
    }

    rerender(
      <NavMain
        items={[
          {
            ...workItem,
            title: "Work",
          },
          membersItem,
        ]}
      />
    );

    expect(screen.getAllByTestId("collapsible")[0]).toHaveAttribute(
      "data-open",
      "true"
    );
    expect(screen.getByRole("link", { name: /alpha/i })).toBeInTheDocument();
  });
});
