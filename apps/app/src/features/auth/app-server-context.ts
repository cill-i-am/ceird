import type {
  OrganizationRole,
  OrganizationSummary,
} from "@ceird/identity-core";
import { getGlobalStartContext } from "@tanstack/react-start";

import type { ServerAuthSession } from "./server-session-types";

export interface AppServerContext {
  readonly authSession?: ServerAuthSession | null | undefined;
  readonly currentOrganizationRole?: OrganizationRole | undefined;
  readonly organizations?: readonly OrganizationSummary[] | undefined;
}

export function readAppServerContext(input: unknown): AppServerContext {
  return isAppServerContext(input) ? input : {};
}

export function readGlobalAppServerContext(): AppServerContext {
  try {
    return readAppServerContext(getGlobalStartContext());
  } catch {
    return {};
  }
}

function isAppServerContext(input: unknown): input is AppServerContext {
  return typeof input === "object" && input !== null;
}
