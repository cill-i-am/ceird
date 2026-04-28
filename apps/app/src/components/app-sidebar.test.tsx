import { render, screen, within } from "@testing-library/react";
import { isValidElement } from "react";
import type { ComponentProps, ReactNode } from "react";

import { AppSidebar } from "./app-sidebar";

const { mockedMatches, mockedNavigate } = vi.hoisted(() => ({
  mockedMatches: {
    value: [] as {
      context?: {
        currentOrganizationRole?: "owner" | "admin" | "member";
      };
      id?: string;
      routeId?: string;
    }[],
  },
  mockedNavigate: vi.fn<() => Promise<void>>(),
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
    useMatches: ((options?: {
      select?: (matches: typeof mockedMatches.value) => unknown;
    }) =>
      options?.select
        ? options.select(mockedMatches.value)
        : mockedMatches.value) as typeof actual.useMatches,
    useRouterState: ((options?: {
      select?: (state: { location: { pathname: string } }) => unknown;
    }) => {
      const state = {
        location: {
          pathname: "/",
        },
      };

      return options?.select ? options.select(state) : state;
    }) as typeof actual.useRouterState,
  };
});

vi.mock(import("#/components/ui/sidebar"), async (importActual) => {
  const actual = await importActual();

  return {
    ...actual,
    Sidebar: (({ children, ...props }: ComponentProps<"div">) => (
      <div data-testid="sidebar" {...props}>
        {children}
      </div>
    )) as typeof actual.Sidebar,
    SidebarContent: (({ children, ...props }: ComponentProps<"div">) => (
      <div data-testid="sidebar-content" {...props}>
        {children}
      </div>
    )) as typeof actual.SidebarContent,
    SidebarFooter: (({ children, ...props }: ComponentProps<"div">) => (
      <div data-testid="sidebar-footer" {...props}>
        {children}
      </div>
    )) as typeof actual.SidebarFooter,
    SidebarHeader: (({ children, ...props }: ComponentProps<"div">) => (
      <div data-testid="sidebar-header" {...props}>
        {children}
      </div>
    )) as typeof actual.SidebarHeader,
    SidebarMenu: (({ children, ...props }: ComponentProps<"div">) => (
      <div data-testid="sidebar-menu" {...props}>
        {children}
      </div>
    )) as typeof actual.SidebarMenu,
    SidebarMenuButton: (({
      children,
      render: renderProp,
    }: {
      children?: ReactNode;
      render?: unknown;
    }) => {
      const href = isValidElement<{ href?: string; to?: string }>(renderProp)
        ? (renderProp.props.to ?? renderProp.props.href)
        : undefined;

      return href ? (
        <a href={href} data-testid="sidebar-menu-button">
          {children}
        </a>
      ) : (
        <button type="button" data-testid="sidebar-menu-button">
          {children}
        </button>
      );
    }) as typeof actual.SidebarMenuButton,
    SidebarMenuItem: (({ children, ...props }: ComponentProps<"div">) => (
      <div data-testid="sidebar-menu-item" {...props}>
        {children}
      </div>
    )) as typeof actual.SidebarMenuItem,
    SidebarGroup: (({ children, ...props }: ComponentProps<"div">) => (
      <div data-testid="sidebar-group" {...props}>
        {children}
      </div>
    )) as typeof actual.SidebarGroup,
    SidebarGroupContent: (({ children, ...props }: ComponentProps<"div">) => (
      <div data-testid="sidebar-group-content" {...props}>
        {children}
      </div>
    )) as typeof actual.SidebarGroupContent,
    SidebarGroupLabel: (({ children, ...props }: ComponentProps<"div">) => (
      <div data-testid="sidebar-group-label" {...props}>
        {children}
      </div>
    )) as typeof actual.SidebarGroupLabel,
    SidebarMenuAction: (({ children, ...props }: ComponentProps<"button">) => (
      <button type="button" data-testid="sidebar-menu-action" {...props}>
        {children}
      </button>
    )) as typeof actual.SidebarMenuAction,
    SidebarMenuSub: (({ children, ...props }: ComponentProps<"div">) => (
      <div data-testid="sidebar-menu-sub" {...props}>
        {children}
      </div>
    )) as typeof actual.SidebarMenuSub,
    SidebarMenuSubButton: (({
      children,
      render: renderProp,
    }: {
      children?: ReactNode;
      render?: unknown;
    }) => {
      const href = isValidElement<{ href?: string; to?: string }>(renderProp)
        ? (renderProp.props.to ?? renderProp.props.href)
        : undefined;

      return href ? (
        <a href={href} data-testid="sidebar-menu-sub-button">
          {children}
        </a>
      ) : (
        <button type="button" data-testid="sidebar-menu-sub-button">
          {children}
        </button>
      );
    }) as typeof actual.SidebarMenuSubButton,
    SidebarMenuSubItem: (({ children, ...props }: ComponentProps<"div">) => (
      <div data-testid="sidebar-menu-sub-item" {...props}>
        {children}
      </div>
    )) as typeof actual.SidebarMenuSubItem,
    useSidebar: () => ({
      state: "expanded" as const,
      open: true,
      setOpen: () => {},
      openMobile: false,
      setOpenMobile: () => {},
      isMobile: false,
      toggleSidebar: () => {},
    }),
  };
});

vi.mock(import("#/components/nav-user"), () => ({
  NavUser: ({
    user,
  }: {
    user: {
      name: string;
      email: string;
      image?: string | null;
    };
  }) => (
    <div data-testid="nav-user">
      {user.name} {user.email}
    </div>
  ),
}));

describe("app sidebar", () => {
  beforeEach(() => {
    mockedMatches.value = [
      {
        id: "/_app/_org",
        routeId: "/_app/_org",
        context: {
          currentOrganizationRole: "owner",
        },
      },
    ];
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it(
    "shows the real session user and hides starter text",
    {
      timeout: 10_000,
    },
    () => {
      render(
        <AppSidebar
          user={{
            name: "Taylor Example",
            email: "person@example.com",
            image: null,
          }}
        />
      );

      expect(screen.getByTestId("nav-user")).toHaveTextContent(
        "Taylor Example person@example.com"
      );
      const brandLink = screen.getByRole("link", { name: /task tracker/i });

      expect(brandLink).toHaveAttribute("href", "/");
      expect(within(brandLink).getByText("Task Tracker")).not.toHaveClass(
        "sr-only"
      );
      expect(screen.getByRole("link", { name: /jobs/i })).toHaveAttribute(
        "href",
        "/jobs"
      );
      expect(screen.getByRole("link", { name: /activity/i })).toHaveAttribute(
        "href",
        "/activity"
      );
      const membersLink = screen.getByRole("link", { name: /members/i });

      expect(membersLink).toHaveAttribute("href", "/members");
      expect(within(membersLink).getByText("Members")).not.toHaveClass(
        "sr-only"
      );
      expect(screen.queryByText(/starter workspace/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/shadcn starter/i)).not.toBeInTheDocument();
    }
  );

  it.each(["owner", "admin"] as const)(
    "shows administrator navigation for %s role",
    {
      timeout: 10_000,
    },
    (role) => {
      mockedMatches.value = [
        {
          id: "/_app/_org",
          routeId: "/_app/_org",
          context: {
            currentOrganizationRole: role,
          },
        },
      ];

      render(<AppSidebar />);

      expect(screen.getByRole("link", { name: /activity/i })).toHaveAttribute(
        "href",
        "/activity"
      );
      expect(screen.getByRole("link", { name: /members/i })).toHaveAttribute(
        "href",
        "/members"
      );
    }
  );

  it(
    "hides administrator navigation for member role",
    {
      timeout: 10_000,
    },
    () => {
      mockedMatches.value = [
        {
          id: "/_app/_org",
          routeId: "/_app/_org",
          context: {
            currentOrganizationRole: "member",
          },
        },
      ];

      render(<AppSidebar />);

      expect(screen.getByRole("link", { name: /jobs/i })).toHaveAttribute(
        "href",
        "/jobs"
      );
      expect(screen.getByRole("link", { name: /sites/i })).toHaveAttribute(
        "href",
        "/sites"
      );
      expect(
        screen.queryByRole("link", { name: /activity/i })
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("link", { name: /members/i })
      ).not.toBeInTheDocument();
    }
  );
});
