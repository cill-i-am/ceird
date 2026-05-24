import {
  OrganizationRole,
  OrganizationSummaryListSchema,
} from "@ceird/identity-core";
import type {
  OrganizationRole as OrganizationRoleType,
  OrganizationSummary,
} from "@ceird/identity-core";
import { getGlobalStartContext } from "@tanstack/react-start";
import { Schema } from "effect";

import type { ServerAuthSession } from "./app-context-types";
import { ServerAuthSessionSchema } from "./app-context-types";

function createAppServerContextSchema() {
  return Schema.Struct({
    authSession: Schema.optional(Schema.NullOr(ServerAuthSessionSchema)),
    currentOrganizationRole: Schema.optional(OrganizationRole),
    organizations: Schema.optional(OrganizationSummaryListSchema),
  });
}

export interface AppServerContext {
  readonly authSession?: ServerAuthSession | null;
  readonly currentOrganizationRole?: OrganizationRoleType;
  readonly organizations?: readonly OrganizationSummary[];
}

export function readAppServerContext(input: unknown): AppServerContext {
  if (typeof input !== "object" || input === null) {
    return {};
  }

  const record = input as Record<string, unknown>;

  try {
    return Schema.decodeUnknownSync(createAppServerContextSchema())({
      authSession: record.authSession,
      currentOrganizationRole: record.currentOrganizationRole,
      organizations: record.organizations,
    });
  } catch (error) {
    console.warn("Invalid app server context discarded.", {
      cause: formatUnknownCause(error),
      fields: {
        authSession: "authSession" in record,
        currentOrganizationRole: "currentOrganizationRole" in record,
        organizations: "organizations" in record,
      },
    });
    return {};
  }
}

export function readGlobalAppServerContext(): AppServerContext {
  try {
    return readAppServerContext(getGlobalStartContext());
  } catch {
    return {};
  }
}

function formatUnknownCause(cause: unknown) {
  if (cause instanceof Error) {
    return cause.message;
  }

  return String(cause);
}
