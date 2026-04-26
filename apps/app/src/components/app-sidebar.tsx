"use client";

import {
  Briefcase01Icon,
  CommandIcon,
  ComputerTerminalIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Link, useNavigate } from "@tanstack/react-router";
import * as React from "react";

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

const data = {
  navMain: [
    {
      title: "Home",
      url: "/",
      icon: <HugeiconsIcon icon={ComputerTerminalIcon} strokeWidth={2} />,
      isActive: true,
    },
    {
      title: "Jobs",
      url: "/jobs",
      icon: <HugeiconsIcon icon={Briefcase01Icon} strokeWidth={2} />,
    },
    {
      title: "Members",
      url: "/members",
      icon: <HugeiconsIcon icon={CommandIcon} strokeWidth={2} />,
    },
  ],
};

export function AppSidebar({
  user,
  ...props
}: React.ComponentProps<typeof Sidebar> & {
  user?: NavUserAccount | null;
}) {
  const navigate = useNavigate();

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
              render={<Link to="/" />}
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
        <NavMain items={data.navMain} />
      </SidebarContent>
      {user ? (
        <SidebarFooter className="border-t border-sidebar-border/70 px-2 py-2.5">
          <NavUser user={user} navigate={navigate} />
        </SidebarFooter>
      ) : null}
    </Sidebar>
  );
}
