import {
  Activity01Icon,
  Briefcase01Icon,
  CommandIcon,
  ComputerTerminalIcon,
  Location01Icon,
} from "@hugeicons/core-free-icons";
import type { HugeiconsIcon } from "@hugeicons/react";
import { isAdministrativeOrganizationRole } from "@task-tracker/identity-core";
import type { OrganizationRole } from "@task-tracker/identity-core";
import type * as React from "react";

type AppNavigationIcon = React.ComponentProps<typeof HugeiconsIcon>["icon"];

export type AppNavigationAccess = "all" | "administrators";

export interface AppNavigationItem {
  readonly access?: AppNavigationAccess;
  readonly icon: AppNavigationIcon;
  readonly id: string;
  readonly keywords: readonly string[];
  readonly title: string;
  readonly url: "/" | "/jobs" | "/sites" | "/activity" | "/members";
}

export const APP_PRIMARY_NAV_ITEMS = [
  {
    access: "all",
    icon: ComputerTerminalIcon,
    id: "home",
    keywords: ["dashboard", "overview"],
    title: "Home",
    url: "/",
  },
  {
    access: "all",
    icon: Briefcase01Icon,
    id: "jobs",
    keywords: ["queue", "work"],
    title: "Jobs",
    url: "/jobs",
  },
  {
    access: "all",
    icon: Location01Icon,
    id: "sites",
    keywords: ["locations", "places"],
    title: "Sites",
    url: "/sites",
  },
  {
    access: "administrators",
    icon: Activity01Icon,
    id: "activity",
    keywords: ["audit", "history", "changes"],
    title: "Activity",
    url: "/activity",
  },
  {
    access: "administrators",
    icon: CommandIcon,
    id: "members",
    keywords: ["team", "access"],
    title: "Members",
    url: "/members",
  },
] as const satisfies readonly AppNavigationItem[];

export function getPrimaryNavItemsForRole(
  role?: OrganizationRole | null
): readonly AppNavigationItem[] {
  return APP_PRIMARY_NAV_ITEMS.filter((item) => {
    if (item.access !== "administrators") {
      return true;
    }

    return role ? isAdministrativeOrganizationRole(role) : false;
  });
}
