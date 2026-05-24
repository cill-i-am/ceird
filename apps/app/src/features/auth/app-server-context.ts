import {
  OrganizationRole,
  OrganizationSummaryListSchema,
} from "@ceird/identity-core";
import { getGlobalStartContext } from "@tanstack/react-start";
import { Schema } from "effect";

import { ServerAuthSessionSchema } from "./app-context-types";

const AppServerContextSchema = Schema.Struct({
  authSession: Schema.optional(Schema.NullOr(ServerAuthSessionSchema)),
  currentOrganizationRole: Schema.optional(OrganizationRole),
  organizations: Schema.optional(OrganizationSummaryListSchema),
});

export type AppServerContext = Schema.Schema.Type<
  typeof AppServerContextSchema
>;

export function readAppServerContext(input: unknown): AppServerContext {
  if (typeof input !== "object" || input === null) {
    return {};
  }

  const record = input as Record<string, unknown>;

  try {
    return Schema.decodeUnknownSync(AppServerContextSchema)({
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
