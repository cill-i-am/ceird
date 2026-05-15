import { isJobsMapViewSearch } from "#/features/jobs/jobs-search";

import type { HotkeyScope } from "./hotkey-registry";

export function getActiveShortcutScopes(
  pathname: string,
  search?: unknown
): readonly HotkeyScope[] {
  if (pathname === "/") {
    return ["global", "home"];
  }

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

  if (pathname === "/sites") {
    return ["global", "sites"];
  }

  if (pathname === "/sites/new" || pathname.startsWith("/sites/")) {
    return ["global", "sites"];
  }

  if (pathname === "/members") {
    return ["global", "members"];
  }

  if (pathname === "/activity") {
    return ["global"];
  }

  if (pathname === "/settings" || pathname === "/organization/settings") {
    return ["global", "settings"];
  }

  return ["global"];
}
