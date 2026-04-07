"use client";

import { Outlet } from "@tanstack/react-router";

import { AppSidebar } from "#/components/app-sidebar";
import type { NavUserAccount } from "#/components/nav-user";
import { SiteHeader } from "#/components/site-header";
import { SidebarInset, SidebarProvider } from "#/components/ui/sidebar";
import { EmailVerificationBanner } from "#/features/auth/email-verification-banner";

export interface AppLayoutProps {
  email?: string;
  emailVerified?: boolean;
  user: NavUserAccount | null;
}

export function AppLayout({ user, email, emailVerified }: AppLayoutProps) {
  return (
    <SidebarProvider className="flex flex-col [--header-height:calc(--spacing(14))]">
      <SiteHeader />
      <div className="flex flex-1">
        <AppSidebar user={user} />
        <SidebarInset>
          <div className="flex flex-1 flex-col">
            {email ? (
              <EmailVerificationBanner
                email={email}
                emailVerified={Boolean(emailVerified)}
              />
            ) : null}
            <Outlet />
          </div>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
