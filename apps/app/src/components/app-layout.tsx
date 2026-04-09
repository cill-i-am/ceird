"use client";

import { Outlet } from "@tanstack/react-router";

import { AppSidebar } from "#/components/app-sidebar";
import type { NavUserAccount } from "#/components/nav-user";
import { SiteHeader } from "#/components/site-header";
import { SidebarInset, SidebarProvider } from "#/components/ui/sidebar";
import { EmailVerificationBanner } from "#/features/auth/email-verification-banner";

export type AppLayoutUser =
  | (NavUserAccount & {
      emailVerified: boolean;
    })
  | null;

export interface AppLayoutProps {
  user: AppLayoutUser;
}

export function AppLayout({ user }: AppLayoutProps) {
  return (
    <SidebarProvider className="flex flex-col [--header-height:calc(--spacing(14))]">
      <SiteHeader />
      <div className="flex flex-1">
        <AppSidebar user={user} />
        <SidebarInset>
          <div className="flex flex-1 flex-col">
            {user && !user.emailVerified ? (
              <EmailVerificationBanner
                email={user.email}
                emailVerified={user.emailVerified}
              />
            ) : null}
            <Outlet />
          </div>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
