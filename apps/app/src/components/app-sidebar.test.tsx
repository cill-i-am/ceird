import { decodeOrganizationId } from "@ceird/identity-core";
import type { OrganizationId, OrganizationSummary } from "@ceird/identity-core";
import { render, screen, within } from "@testing-library/react";
import { isValidElement } from "react";
import type { ComponentProps, ReactElement, ReactNode } from "react";

import { AppSidebar } from "./app-sidebar";

const { mockedMatches, mockedNavigate } = vi.hoisted(() => ({
  mockedMatches: {
    value: [] as {
      context?: {
        activeOrganization?: OrganizationSummary | null;
        activeOrganizationId?: OrganizationId | null;
        currentOrganizationRole?: "owner" | "admin" | "member" | "external";
        organizations?: readonly OrganizationSummary[];
      };
      id?: string;
      routeId?: string;
    }[],
  },
  mockedNavigate: vi.fn<() => Promise<void>>(),
}));

const { mockedOrganizationSwitcher } = vi.hoisted(() => ({
  mockedOrganizationSwitcher: vi.fn<
    (props: {
      activeOrganization?: OrganizationSummary | null;
      activeOrganizationId?: OrganizationId | null;
      organizations?: readonly OrganizationSummary[];
    }) => ReactElement
  >(
    ({
      activeOrganization,
    }: {
      activeOrganization?: { id: string; name: string; slug: string } | null;
    }) => (
      <div data-testid="organization-switcher">
        {activeOrganization?.name ?? "missing organization"}
      </div>
    )
  ),
}));

function organization(input: {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
}): OrganizationSummary {
  return {
    id: decodeOrganizationId(input.id),
    name: input.name,
    slug: input.slug,
  };
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
    useNavigate: () => mockedNavigate,
    useMatch: ((options?: {
      select?: (match: (typeof mockedMatches.value)[number]) => unknown;
      shouldThrow?: boolean;
    }) => {
      const match = mockedMatches.value.find(
        (candidate) =>
          candidate.routeId === "/_app/_org" || candidate.id === "/_app/_org"
      );

      if (!match && options?.shouldThrow !== false) {
        throw new Error("Expected route match.");
      }

      return match && options?.select ? options.select(match) : match;
    }) as typeof actual.useMatch,
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

vi.mock(import("#/features/organizations/organization-switcher"), () => ({
  OrganizationSwitcher: mockedOrganizationSwitcher,
}));

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
    currentOrganizationRole,
    user,
  }: {
    currentOrganizationRole?: string;
    user: {
      name: string;
      email: string;
      image?: string | null;
    };
  }) => (
    <div data-testid="nav-user">
      {user.name} {user.email}
      {currentOrganizationRole ? ` ${currentOrganizationRole}` : ""}
    </div>
  ),
}));

describe("app sidebar", () => {
  beforeEach(() => {
    const acmeOrganization = organization({
      id: "org_acme",
      name: "Acme Field Ops",
      slug: "acme-field-ops",
    });

    mockedMatches.value = [
      {
        id: "/_app/_org",
        routeId: "/_app/_org",
        context: {
          activeOrganization: acmeOrganization,
          activeOrganizationId: acmeOrganization.id,
          currentOrganizationRole: "owner",
          organizations: [acmeOrganization],
        },
      },
    ];
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("shows the active organization in the sidebar header", () => {
    const acmeOrganization = organization({
      id: "org_acme",
      name: "Acme Field Ops",
      slug: "acme-field-ops",
    });

    render(<AppSidebar />);

    expect(screen.getByTestId("organization-switcher")).toHaveTextContent(
      "Acme Field Ops"
    );
    expect(mockedOrganizationSwitcher).toHaveBeenCalledWith(
      expect.objectContaining({
        activeOrganization: acmeOrganization,
        activeOrganizationId: acmeOrganization.id,
        organizations: [acmeOrganization],
      }),
      undefined
    );
  });

  it("passes app-level organization context outside organization routes", () => {
    mockedMatches.value = [];

    render(
      <AppSidebar
        activeOrganizationId={decodeOrganizationId("org_acme")}
        currentOrganizationRole="admin"
      />
    );

    expect(mockedOrganizationSwitcher).toHaveBeenCalledWith(
      expect.objectContaining({
        activeOrganization: null,
        activeOrganizationId: "org_acme",
        organizations: undefined,
      }),
      undefined
    );
    expect(screen.getByRole("link", { name: /activity/i })).toHaveAttribute(
      "href",
      "/activity"
    );
    expect(screen.getByRole("link", { name: /members/i })).toHaveAttribute(
      "href",
      "/members"
    );
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
        "Taylor Example person@example.com owner"
      );
      const brandLink = screen.getByRole("link", { name: /ceird/i });

      expect(brandLink).toHaveAttribute("href", "/");
      expect(within(brandLink).getByText("Ceird")).not.toHaveClass("sr-only");
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

  it(
    "shows only jobs navigation for external role",
    {
      timeout: 10_000,
    },
    () => {
      mockedMatches.value = [
        {
          id: "/_app/_org",
          routeId: "/_app/_org",
          context: {
            currentOrganizationRole: "external",
          },
        },
      ];

      render(<AppSidebar />);

      expect(screen.getByRole("link", { name: /jobs/i })).toHaveAttribute(
        "href",
        "/jobs"
      );
      expect(screen.getByRole("link", { name: /ceird/i })).toHaveAttribute(
        "href",
        "/jobs"
      );
      expect(
        screen.queryByRole("link", { name: /^home$/i })
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("link", { name: /sites/i })
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("link", { name: /activity/i })
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("link", { name: /members/i })
      ).not.toBeInTheDocument();
    }
  );

  it("keeps external users pointed at jobs while still showing the active organization", () => {
    const externalOrganization = organization({
      id: "org_external",
      name: "External Client",
      slug: "external-client",
    });

    mockedMatches.value = [
      {
        id: "/_app/_org",
        routeId: "/_app/_org",
        context: {
          activeOrganization: externalOrganization,
          activeOrganizationId: externalOrganization.id,
          currentOrganizationRole: "external",
        },
      },
    ];

    render(<AppSidebar />);

    expect(screen.getByTestId("organization-switcher")).toHaveTextContent(
      "External Client"
    );
    expect(screen.getByRole("link", { name: /ceird/i })).toHaveAttribute(
      "href",
      "/jobs"
    );
    expect(screen.getByRole("link", { name: /jobs/i })).toBeInTheDocument();
    expect(
      screen.queryByRole("link", { name: /members/i })
    ).not.toBeInTheDocument();
  });
});
