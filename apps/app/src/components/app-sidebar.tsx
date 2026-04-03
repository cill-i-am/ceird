"use client";

import {
  BookOpen02Icon,
  ChartRingIcon,
  CommandIcon,
  ComputerTerminalIcon,
  CropIcon,
  SentIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Link } from "@tanstack/react-router";
import * as React from "react";

import { NavMain } from "#/components/nav-main";
import { NavProjects } from "#/components/nav-projects";
import { NavSecondary } from "#/components/nav-secondary";
import { NavUser } from "#/components/nav-user";
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
  user: {
    name: "Task Tracker",
    email: "starter workspace",
    avatar: "",
  },
  navMain: [
    {
      title: "Overview",
      url: "/",
      icon: <HugeiconsIcon icon={ComputerTerminalIcon} strokeWidth={2} />,
      isActive: true,
      items: [
        {
          title: "Home",
          url: "/",
        },
        {
          title: "Health",
          url: "/health",
        },
      ],
    },
    {
      title: "Documentation",
      url: "https://tanstack.com/start/latest/docs/framework/react/overview",
      icon: <HugeiconsIcon icon={BookOpen02Icon} strokeWidth={2} />,
      items: [
        {
          title: "TanStack Start",
          url: "https://tanstack.com/start/latest/docs/framework/react/overview",
        },
        {
          title: "TanStack Router",
          url: "https://tanstack.com/router/latest",
        },
        {
          title: "shadcn/ui",
          url: "https://ui.shadcn.com",
        },
      ],
    },
    {
      title: "Status",
      url: "/health",
      icon: <HugeiconsIcon icon={ChartRingIcon} strokeWidth={2} />,
    },
  ],
  navSecondary: [
    {
      title: "TanStack GitHub",
      url: "https://github.com/TanStack",
      icon: <HugeiconsIcon icon={ChartRingIcon} strokeWidth={2} />,
    },
    {
      title: "Follow on X",
      url: "https://x.com/tan_stack",
      icon: <HugeiconsIcon icon={SentIcon} strokeWidth={2} />,
    },
  ],
  projects: [
    {
      name: "Auth Screens",
      url: "/",
      icon: <HugeiconsIcon icon={CropIcon} strokeWidth={2} />,
    },
    {
      name: "Form Patterns",
      url: "https://ui.shadcn.com/docs/forms/tanstack-form",
      icon: <HugeiconsIcon icon={BookOpen02Icon} strokeWidth={2} />,
    },
  ],
};

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  return (
    <Sidebar
      className="top-(--header-height) h-[calc(100svh-var(--header-height))]!"
      {...props}
    >
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              size="lg"
              render={
                <Link to="/">
                  <span className="sr-only">Task Tracker</span>
                </Link>
              }
            >
              <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                <HugeiconsIcon
                  icon={CommandIcon}
                  strokeWidth={2}
                  className="size-4"
                />
              </div>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-medium">Task Tracker</span>
                <span className="truncate text-xs">shadcn starter</span>
              </div>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <NavMain items={data.navMain} />
        <NavProjects projects={data.projects} />
        <NavSecondary items={data.navSecondary} className="mt-auto" />
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={data.user} />
      </SidebarFooter>
    </Sidebar>
  );
}
