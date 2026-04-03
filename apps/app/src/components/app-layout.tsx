import { Outlet } from "@tanstack/react-router";

import { AppSidebar } from "#/components/app-sidebar";
import { SiteHeader } from "#/components/site-header";
import { SidebarInset, SidebarProvider } from "#/components/ui/sidebar";

export function AppLayout() {
  return (
    <SidebarProvider className="flex flex-col [--header-height:calc(--spacing(14))]">
      <SiteHeader />
      <div className="flex flex-1">
        <AppSidebar />
        <SidebarInset>
          <div className="flex flex-1 flex-col">
            <Outlet />
          </div>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
