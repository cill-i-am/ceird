"use client";

import { Link, useMatches, useRouterState } from "@tanstack/react-router";
import * as React from "react";

import ThemeToggle from "#/components/ThemeToggle";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "#/components/ui/breadcrumb";
import { SidebarTrigger } from "#/components/ui/sidebar";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "#/components/ui/tooltip";
import { isJobsMapViewSearch } from "#/features/jobs/jobs-search";
import { ShortcutHint } from "#/hotkeys/hotkey-display";
import { HOTKEYS } from "#/hotkeys/hotkey-registry";
import type { HotkeyScope } from "#/hotkeys/hotkey-registry";
import { RouteHotkeys } from "#/hotkeys/route-hotkeys";
import { ShortcutHelpOverlay } from "#/hotkeys/shortcut-help-overlay";
import { ShortcutIntroNotice } from "#/hotkeys/shortcut-intro-notice";

export function SiteHeader() {
  const breadcrumbs = useMatches({
    select: (matches) =>
      matches
        .map((match) => match.staticData.breadcrumb)
        .filter((breadcrumb) => breadcrumb !== undefined),
  });
  const activeScopes = useRouterState({
    select: (state) =>
      getActiveShortcutScopes(state.location.pathname, state.location.search),
  });

  return (
    <header className="sticky top-0 z-40 flex w-full items-center border-b border-border/60 bg-background/90 backdrop-blur">
      <RouteHotkeys />
      <div className="flex min-h-(--header-height) w-full flex-wrap items-center gap-3 px-3 py-3 sm:px-5">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <Tooltip>
            <TooltipTrigger
              render={
                <SidebarTrigger
                  className="size-10 rounded-lg border border-border/70 bg-background/80 sm:size-8 sm:rounded-md"
                  aria-label="Toggle navigation"
                />
              }
            />
            <TooltipContent>
              <span>Toggle navigation</span>
              <ShortcutHint
                hotkey={HOTKEYS.toggleSidebar.hotkey}
                label={HOTKEYS.toggleSidebar.label}
              />
            </TooltipContent>
          </Tooltip>
          <div className="min-w-0">
            {breadcrumbs.length > 0 ? (
              <Breadcrumb>
                <BreadcrumbList>
                  {breadcrumbs.map((breadcrumb, index) => {
                    const isCurrent = index === breadcrumbs.length - 1;

                    return (
                      <React.Fragment
                        key={breadcrumb.to ?? `current-${breadcrumb.label}`}
                      >
                        {index > 0 ? <BreadcrumbSeparator /> : null}
                        <BreadcrumbItem>
                          {isCurrent || breadcrumb.to === undefined ? (
                            <BreadcrumbPage>{breadcrumb.label}</BreadcrumbPage>
                          ) : (
                            <BreadcrumbLink
                              render={<Link to={breadcrumb.to} />}
                            >
                              {breadcrumb.label}
                            </BreadcrumbLink>
                          )}
                        </BreadcrumbItem>
                      </React.Fragment>
                    );
                  })}
                </BreadcrumbList>
              </Breadcrumb>
            ) : null}
          </div>
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-2 md:ml-0">
          <ShortcutHelpOverlay activeScopes={activeScopes} />
          <ThemeToggle />
        </div>
      </div>
      <ShortcutIntroNotice />
    </header>
  );
}

function getActiveShortcutScopes(
  pathname: string,
  search?: unknown
): readonly HotkeyScope[] {
  if (pathname === "/jobs/new") {
    return ["global", "jobs", "job-create"];
  }

  if (pathname.startsWith("/jobs/")) {
    return ["global", "jobs", "job-detail"];
  }

  if (pathname === "/jobs") {
    return isJobsMapViewSearch(search)
      ? ["global", "jobs", "map"]
      : ["global", "jobs"];
  }

  if (pathname === "/members") {
    return ["global", "members"];
  }

  if (pathname === "/settings" || pathname === "/organization/settings") {
    return ["global", "settings"];
  }

  return ["global"];
}
