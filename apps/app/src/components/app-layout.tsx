"use client";
import type { OrganizationId, OrganizationRole } from "@ceird/identity-core";
import { Outlet } from "@tanstack/react-router";

import { AppSidebar } from "#/components/app-sidebar";
import type { NavUserAccount } from "#/components/nav-user";
import { SiteHeader } from "#/components/site-header";
import { SidebarInset, SidebarProvider } from "#/components/ui/sidebar";
import { EmailVerificationBanner } from "#/features/auth/email-verification-banner";
import { AppGlobalCommandActions } from "#/features/command-bar/app-global-command-actions";
import { CommandBarProvider } from "#/features/command-bar/command-bar";

export type AppLayoutUser =
  | (NavUserAccount & {
      emailVerified: boolean;
    })
  | null;

export interface AppLayoutProps {
  activeOrganizationId?: OrganizationId | null | undefined;
  currentOrganizationRole?: OrganizationRole | undefined;
  user: AppLayoutUser;
}

export function AppLayout({
  activeOrganizationId,
  currentOrganizationRole,
  user,
}: AppLayoutProps) {
  return (
    <CommandBarProvider>
      <AppGlobalCommandActions />
      <SidebarProvider className="[--header-height:calc(--spacing(15))]">
        <AppSidebar
          activeOrganizationId={activeOrganizationId}
          currentOrganizationRole={currentOrganizationRole}
          user={user}
        />
        <SidebarInset className="min-h-svh overflow-hidden border border-border/60 bg-background/94 shadow-[0_1px_0_color-mix(in_oklab,var(--border)_65%,transparent)] supports-[backdrop-filter]:bg-background/88">
          <SiteHeader currentOrganizationRole={currentOrganizationRole} />
          <div className="flex flex-1 flex-col overflow-x-clip">
            {user && !user.emailVerified ? (
              <EmailVerificationBanner
                email={user.email}
                emailVerified={user.emailVerified}
              />
            ) : null}
            <Outlet />
          </div>
        </SidebarInset>
      </SidebarProvider>
    </CommandBarProvider>
  );
}
