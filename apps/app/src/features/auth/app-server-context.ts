import { getGlobalStartContext } from "@tanstack/react-start";

import type { AppAuthContextSnapshot } from "./app-context-types";

export type AppServerContext = Partial<
  Pick<AppAuthContextSnapshot, "currentOrganizationRole" | "organizations">
> & {
  readonly authSession?: AppAuthContextSnapshot["session"] | undefined;
};

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
