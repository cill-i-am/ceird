"use client";

import { CommandIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Link, useNavigate } from "@tanstack/react-router";
import { isExternalOrganizationRole } from "@task-tracker/identity-core";
import type { OrganizationRole } from "@task-tracker/identity-core";
import * as React from "react";

import { getPrimaryNavItemsForRole } from "#/components/app-navigation";
import { NavMain } from "#/components/nav-main";
import { NavUser } from "#/components/nav-user";
import type { NavUserAccount } from "#/components/nav-user";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "#/components/ui/sidebar";
import {
  useCurrentOrganizationRoleFromMatches,
  useIsInOrganizationRoute,
} from "#/features/organizations/organization-route-context";

export function AppSidebar({
  currentOrganizationRole: appCurrentOrganizationRole,
  user,
  ...props
}: React.ComponentProps<typeof Sidebar> & {
  currentOrganizationRole?: OrganizationRole | undefined;
  user?: NavUserAccount | null;
}) {
  const navigate = useNavigate();
  const isInOrganizationRoute = useIsInOrganizationRoute();
  const matchedOrganizationRole = useCurrentOrganizationRoleFromMatches();
  const currentOrganizationRole =
    matchedOrganizationRole ??
    (isInOrganizationRoute ? undefined : appCurrentOrganizationRole);
  const primaryNavItems = getPrimaryNavItemsForRole(currentOrganizationRole);
  const homeTarget =
    currentOrganizationRole !== undefined &&
    isExternalOrganizationRole(currentOrganizationRole)
      ? "/jobs"
      : "/";

  return (
    <Sidebar
      variant="inset"
      collapsible="icon"
      className="border-r-0"
      {...props}
    >
      <SidebarHeader className="p-3">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              className="rounded-xl px-2.5 py-2.5"
              render={<Link to={homeTarget} />}
            >
              <div className="flex aspect-square size-9 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground shadow-[inset_0_1px_0_color-mix(in_oklab,var(--sidebar-primary-foreground)_30%,transparent)]">
                <HugeiconsIcon
                  icon={CommandIcon}
                  strokeWidth={2}
                  className="size-4"
                />
              </div>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">Task Tracker</span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent className="px-1 pb-2">
        <NavMain
          items={primaryNavItems.map((item) => ({
            icon: <HugeiconsIcon icon={item.icon} strokeWidth={2} />,
            title: item.title,
            url: item.url,
          }))}
        />
      </SidebarContent>
      {user ? (
        <SidebarFooter className="border-t border-sidebar-border/70 px-2 py-2.5">
          <NavUser
            currentOrganizationRole={currentOrganizationRole}
            user={user}
            navigate={navigate}
          />
        </SidebarFooter>
      ) : null}
    </Sidebar>
  );
}
