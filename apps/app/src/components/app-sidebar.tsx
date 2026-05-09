"use client";
import type { OrganizationId, OrganizationRole } from "@ceird/identity-core";
import { HugeiconsIcon } from "@hugeicons/react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import * as React from "react";

import { getPrimaryNavItemsForRole } from "#/components/app-navigation";
import { NavMain } from "#/components/nav-main";
import { NavUser } from "#/components/nav-user";
import type { NavUserAccount } from "#/components/nav-user";
import ThemeToggle from "#/components/ThemeToggle";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
} from "#/components/ui/sidebar";
import {
  useActiveOrganizationFromMatches,
  useActiveOrganizationIdFromMatches,
  useCurrentOrganizationRoleFromMatches,
  useIsInOrganizationRoute,
  useOrganizationsFromMatches,
} from "#/features/organizations/organization-route-context";
import { OrganizationSwitcher } from "#/features/organizations/organization-switcher";
import { getActiveShortcutScopes } from "#/hotkeys/active-shortcut-scopes";
import { ShortcutHelpOverlay } from "#/hotkeys/shortcut-help-overlay";

export function AppSidebar({
  activeOrganizationId: appActiveOrganizationId,
  currentOrganizationRole: appCurrentOrganizationRole,
  user,
  ...props
}: React.ComponentProps<typeof Sidebar> & {
  activeOrganizationId?: OrganizationId | null | undefined;
  currentOrganizationRole?: OrganizationRole | undefined;
  user?: NavUserAccount | null;
}) {
  const navigate = useNavigate({ from: "/" });
  const isInOrganizationRoute = useIsInOrganizationRoute();
  const activeOrganization = useActiveOrganizationFromMatches();
  const matchedActiveOrganizationId = useActiveOrganizationIdFromMatches();
  const organizations = useOrganizationsFromMatches();
  const matchedOrganizationRole = useCurrentOrganizationRoleFromMatches();
  const currentOrganizationRole =
    matchedOrganizationRole ??
    (isInOrganizationRoute ? undefined : appCurrentOrganizationRole);
  const primaryNavItems = getPrimaryNavItemsForRole(currentOrganizationRole);
  const activeOrganizationId =
    matchedActiveOrganizationId ??
    (isInOrganizationRoute ? null : (appActiveOrganizationId ?? null));

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
            <OrganizationSwitcher
              activeOrganization={activeOrganization ?? null}
              activeOrganizationId={activeOrganizationId}
              organizations={organizations}
            />
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
      <SidebarFooter className="border-t border-sidebar-border/70 px-2 py-2.5">
        <SidebarUtilities />
        {user ? (
          <NavUser
            currentOrganizationRole={currentOrganizationRole}
            user={user}
            navigate={navigate}
          />
        ) : null}
      </SidebarFooter>
    </Sidebar>
  );
}

function SidebarUtilities() {
  const activeScopes = useRouterState({
    select: (state) =>
      getActiveShortcutScopes(state.location.pathname, state.location.search),
  });
  const utilityButtonClassName =
    "h-9 w-full justify-start rounded-md border-transparent bg-transparent px-2 text-sidebar-foreground shadow-none hover:bg-sidebar-accent hover:text-sidebar-accent-foreground group-data-[collapsible=icon]:size-8 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0";
  const utilityLabelClassName = "group-data-[collapsible=icon]:hidden";

  return (
    <div className="flex flex-col gap-1 border-b border-sidebar-border/70 pb-2 group-data-[collapsible=icon]:items-center">
      <ShortcutHelpOverlay
        activeScopes={activeScopes}
        buttonClassName={utilityButtonClassName}
        labelClassName={utilityLabelClassName}
      />
      <ThemeToggle
        className={utilityButtonClassName}
        labelClassName={utilityLabelClassName}
        contentAlign="start"
      />
    </div>
  );
}
