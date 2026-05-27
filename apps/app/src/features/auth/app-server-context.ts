import {
  OrganizationId,
  OrganizationRole,
  OrganizationSummaryListSchema,
} from "@ceird/identity-core";
import type {
  OrganizationId as OrganizationIdType,
  OrganizationRole as OrganizationRoleType,
  OrganizationSummary,
} from "@ceird/identity-core";
import { getGlobalStartContext } from "@tanstack/react-start";
import { Schema } from "effect";

import type { ServerAuthSession } from "./app-context-types";
import { ServerAuthSessionSchema } from "./app-context-types";

function createAppServerContextSchema() {
  return Schema.Struct({
    activeOrganizationId: Schema.optional(Schema.NullOr(OrganizationId)),
    authSession: Schema.optional(Schema.NullOr(ServerAuthSessionSchema)),
    currentOrganizationRole: Schema.optional(OrganizationRole),
    organizations: Schema.optional(OrganizationSummaryListSchema),
    requestedOrganizationSlug: Schema.optional(Schema.String),
  });
}

export interface AppServerContext {
  readonly activeOrganizationId?: OrganizationIdType | null;
  readonly authSession?: ServerAuthSession | null;
  readonly currentOrganizationRole?: OrganizationRoleType;
  readonly organizations?: readonly OrganizationSummary[];
  readonly requestedOrganizationSlug?: string | undefined;
}

export function readAppServerContext(input: unknown): AppServerContext {
  if (typeof input !== "object" || input === null) {
    return {};
  }

  const record = input as Record<string, unknown>;

  try {
    return Schema.decodeUnknownSync(createAppServerContextSchema())({
      activeOrganizationId: record.activeOrganizationId,
      authSession: record.authSession,
      currentOrganizationRole: record.currentOrganizationRole,
      organizations: record.organizations,
      requestedOrganizationSlug: record.requestedOrganizationSlug,
    });
  } catch (error) {
    console.warn("Invalid app server context discarded.", {
      cause: formatUnknownCause(error),
      fields: {
        activeOrganizationId: "activeOrganizationId" in record,
        authSession: "authSession" in record,
        currentOrganizationRole: "currentOrganizationRole" in record,
        organizations: "organizations" in record,
        requestedOrganizationSlug: "requestedOrganizationSlug" in record,
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
