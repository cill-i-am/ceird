import { isJobsMapViewSearch } from "#/features/jobs/jobs-search";
import {
  decodeWorkspaceSheetSearch,
  getActiveWorkspaceSheet,
} from "#/features/workspace-sheets/workspace-sheet-search";

import type { HotkeyScope } from "./hotkey-registry";

export function getActiveShortcutScopes(
  pathname: string,
  search?: unknown
): readonly HotkeyScope[] {
  const baseScopes = getBaseShortcutScopes(pathname, search);
  const activeSheet = getActiveWorkspaceSheet(
    decodeWorkspaceSheetSearch(search)
  );

  if (!activeSheet) {
    return baseScopes;
  }

  switch (activeSheet.kind) {
    case "job.create": {
      return appendScopes(baseScopes, ["jobs", "job-create"]);
    }
    case "job.detail": {
      return appendScopes(baseScopes, ["jobs", "job-detail"]);
    }
    case "site.create":
    case "site.detail": {
      return appendScopes(baseScopes, ["sites"]);
    }
    default: {
      return baseScopes;
    }
  }
}

function getBaseShortcutScopes(
  pathname: string,
  search?: unknown
): readonly HotkeyScope[] {
  if (pathname === "/") {
    return ["global", "home"];
  }

  if (pathname === "/jobs") {
    return isJobsMapViewSearch(search)
      ? ["global", "jobs", "map"]
      : ["global", "jobs"];
  }

  if (pathname === "/jobs-workspace") {
    return ["global", "jobs-workspace"];
  }

  if (pathname === "/sites") {
    return ["global", "sites"];
  }

  if (pathname === "/sites-workspace") {
    return ["global", "sites-workspace"];
  }

  if (pathname === "/members") {
    return ["global", "members"];
  }

  if (pathname === "/activity") {
    return ["global"];
  }

  if (pathname === "/organization/settings/labels") {
    return ["global", "settings", "labels-settings"];
  }

  if (pathname === "/settings" || pathname === "/organization/settings") {
    return ["global", "settings"];
  }

  return ["global"];
}

function appendScopes(
  baseScopes: readonly HotkeyScope[],
  nextScopes: readonly HotkeyScope[]
): readonly HotkeyScope[] {
  return [...new Set([...baseScopes, ...nextScopes])];
}
