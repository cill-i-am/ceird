import {
  isAdministrativeOrganizationRole,
  isInternalOrganizationRole,
} from "@ceird/identity-core";
import type { OrganizationRole } from "@ceird/identity-core";
import {
  Activity01Icon,
  Briefcase01Icon,
  CommandIcon,
  ComputerTerminalIcon,
  Location01Icon,
} from "@hugeicons/core-free-icons";
import type { HugeiconsIcon } from "@hugeicons/react";
import type * as React from "react";

import { HOTKEYS } from "#/hotkeys/hotkey-registry";
import type { HotkeyDefinition } from "#/hotkeys/hotkey-registry";

type AppNavigationIcon = React.ComponentProps<typeof HugeiconsIcon>["icon"];

type AppNavigationAccess = "all" | "internal" | "administrators";

export interface AppNavigationItem {
  readonly access?: AppNavigationAccess;
  readonly icon: AppNavigationIcon;
  readonly id: string;
  readonly keywords: readonly string[];
  readonly title: string;
  readonly url: "/" | "/jobs" | "/sites" | "/activity" | "/members";
}

const APP_PRIMARY_NAV_ITEMS = [
  {
    access: "internal",
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
    access: "internal",
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

const APP_PRIMARY_NAV_SHORTCUTS_BY_URL = {
  "/": HOTKEYS.goHome,
  "/activity": HOTKEYS.goActivity,
  "/jobs": HOTKEYS.goJobs,
  "/members": HOTKEYS.goMembers,
  "/sites": HOTKEYS.goSites,
} as const satisfies Readonly<
  Record<AppNavigationItem["url"], HotkeyDefinition>
>;

export function getPrimaryNavItemsForRole(
  role?: OrganizationRole | null
): readonly AppNavigationItem[] {
  return APP_PRIMARY_NAV_ITEMS.filter((item) => {
    if (item.access === "all") {
      return true;
    }

    if (!role) {
      return false;
    }

    if (item.access === "internal") {
      return isInternalOrganizationRole(role);
    }

    return isAdministrativeOrganizationRole(role);
  });
}

export function getPrimaryNavShortcut(
  url: string
): HotkeyDefinition | undefined {
  return hasPrimaryNavShortcut(url)
    ? APP_PRIMARY_NAV_SHORTCUTS_BY_URL[url]
    : undefined;
}

function hasPrimaryNavShortcut(
  url: string
): url is keyof typeof APP_PRIMARY_NAV_SHORTCUTS_BY_URL {
  return url in APP_PRIMARY_NAV_SHORTCUTS_BY_URL;
}
