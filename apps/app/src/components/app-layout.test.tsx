import { render, screen } from "@testing-library/react";
import { memo } from "react";
import type { ComponentProps } from "react";

import { AppLayout } from "./app-layout";

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
  AppSidebar: () => <aside>Workspace Sidebar</aside>,
}));

describe("app layout", () => {
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
