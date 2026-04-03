import { render, screen } from "@testing-library/react";
import { memo } from "react";
import type { ComponentProps, ReactElement } from "react";

import { AppLayout } from "./app-layout";

const { mockedAppSidebar } = vi.hoisted(() => ({
  mockedAppSidebar: vi.fn<
    ({
      user,
    }: {
      user?: {
        name: string;
        email: string;
        image?: string | null;
      } | null;
    } & ComponentProps<"div">) => ReactElement
  >(
    ({
      user,
      ...props
    }: {
      user?: {
        name: string;
        email: string;
        image?: string | null;
      } | null;
    } & ComponentProps<"div">) => (
      <aside data-testid="app-sidebar" {...props}>
        {user?.name ?? "missing user"}
      </aside>
    )
  ),
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

vi.mock(import("#/components/site-header"), () => ({
  SiteHeader: () => <header>Task Tracker Header</header>,
}));

vi.mock(import("#/components/app-sidebar"), () => ({
  AppSidebar: mockedAppSidebar,
}));

describe("app layout", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it(
    "passes the provided session user into the app sidebar",
    {
      timeout: 10_000,
    },
    () => {
      render(
        <AppLayout
          user={{
            name: "Taylor Example",
            email: "person@example.com",
            image: null,
          }}
        />
      );

      expect(mockedAppSidebar).toHaveBeenCalledOnce();
      expect(mockedAppSidebar.mock.calls[0]?.[0]).toStrictEqual({
        user: {
          name: "Taylor Example",
          email: "person@example.com",
          image: null,
        },
      });
      expect(screen.getByTestId("app-sidebar")).toHaveTextContent(
        "Taylor Example"
      );
    }
  );
});
