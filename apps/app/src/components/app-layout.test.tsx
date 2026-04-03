import { render, screen } from "@testing-library/react";
import { memo } from "react";
import type { ComponentProps } from "react";

import type { authClient as AuthClient } from "#/lib/auth-client";

import { AppLayout } from "./app-layout";

const { mockedUseSession } = vi.hoisted(() => ({
  mockedUseSession: vi.fn<
    () => {
      data: {
        user: {
          name: string;
          email: string;
          image: null;
        };
      };
      error: null;
      isPending: boolean;
      isRefetching: boolean;
      refetch: () => Promise<void>;
    }
  >(),
}));

vi.mock(import("@tanstack/react-router"), async (importActual) => {
  const actual = await importActual();

  return {
    ...actual,
    Outlet: memo(() => <div data-testid="app-layout-outlet" />),
  };
});

vi.mock(import("#/components/ui/sidebar"), async (importActual) => {
  const actual = await importActual();

  return {
    ...actual,
    SidebarInset: (({ children, ...props }: ComponentProps<"div">) => (
      <div data-testid="sidebar-inset" {...props}>
        {children}
      </div>
    )) as typeof actual.SidebarInset,
    SidebarProvider: (({ children, ...props }: ComponentProps<"div">) => (
      <div data-testid="sidebar-provider" {...props}>
        {children}
      </div>
    )) as typeof actual.SidebarProvider,
  };
});

vi.mock(import("#/lib/auth-client"), () => ({
  authClient: {
    useSession: mockedUseSession,
  } as unknown as typeof AuthClient,
}));

vi.mock(import("#/components/site-header"), () => ({
  SiteHeader: () => <header>Task Tracker Header</header>,
}));

vi.mock(import("#/components/app-sidebar"), () => ({
  AppSidebar: () => <aside>Workspace Sidebar</aside>,
}));

describe("app layout", () => {
  beforeEach(() => {
    mockedUseSession.mockReturnValue({
      data: {
        user: {
          name: "Taylor Example",
          email: "person@example.com",
          image: null,
        },
      },
      error: null,
      isPending: false,
      isRefetching: false,
      refetch: () => Promise.resolve(),
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it(
    "renders the shared app chrome",
    {
      timeout: 10_000,
    },
    () => {
      render(<AppLayout />);

      expect(screen.getByText(/task tracker/i)).toBeInTheDocument();
    }
  );
});
