import {
  Briefcase01Icon,
  CommandIcon,
  ComputerTerminalIcon,
  Location01Icon,
} from "@hugeicons/core-free-icons";
import type { HugeiconsIcon } from "@hugeicons/react";
import type * as React from "react";

type AppNavigationIcon = React.ComponentProps<typeof HugeiconsIcon>["icon"];

export interface AppNavigationItem {
  readonly icon: AppNavigationIcon;
  readonly id: string;
  readonly keywords: readonly string[];
  readonly title: string;
  readonly url: "/" | "/jobs" | "/sites" | "/members";
}

export const APP_PRIMARY_NAV_ITEMS = [
  {
    icon: ComputerTerminalIcon,
    id: "home",
    keywords: ["dashboard", "overview"],
    title: "Home",
    url: "/",
  },
  {
    icon: Briefcase01Icon,
    id: "jobs",
    keywords: ["queue", "work"],
    title: "Jobs",
    url: "/jobs",
  },
  {
    icon: Location01Icon,
    id: "sites",
    keywords: ["locations", "places"],
    title: "Sites",
    url: "/sites",
  },
  {
    icon: CommandIcon,
    id: "members",
    keywords: ["team", "access"],
    title: "Members",
    url: "/members",
  },
] as const satisfies readonly AppNavigationItem[];
