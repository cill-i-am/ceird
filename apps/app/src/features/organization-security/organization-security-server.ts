import type {
  OrganizationSecurityActivityListResponse,
  OrganizationSecurityActivityQuery,
} from "@ceird/identity-core";
import { createIsomorphicFn } from "@tanstack/react-start";
import { Effect } from "effect";

import { runBrowserAppApiRequest } from "#/features/api/app-api-client";
import type { AppApiClient } from "#/features/api/app-api-client";

const importOrganizationSecurityServerSsr = () =>
  import("./organization-security-server-ssr");

const listCurrentServerOrganizationSecurityActivityIsomorphic =
  createIsomorphicFn()
    .server(async (query: OrganizationSecurityActivityQuery = {}) => {
      const { listCurrentServerOrganizationSecurityActivityDirect } =
        await importOrganizationSecurityServerSsr();
      return await listCurrentServerOrganizationSecurityActivityDirect(query);
    })
    .client((query: OrganizationSecurityActivityQuery = {}) =>
      listCurrentBrowserOrganizationSecurityActivity(query)
    );

function runBrowserAppApiClient<Response>(
  operation: string,
  execute: (client: AppApiClient) => Effect.Effect<Response, unknown>
): Promise<Response> {
  return Effect.runPromise(runBrowserAppApiRequest(operation, execute));
}

async function listCurrentBrowserOrganizationSecurityActivity(
  query: OrganizationSecurityActivityQuery = {}
): Promise<OrganizationSecurityActivityListResponse> {
  return await runBrowserAppApiClient(
    "OrganizationSecurityClient.listOrganizationSecurityActivity",
    (client) =>
      client.identity.listOrganizationSecurityActivity({
        query,
      })
  );
}

export function listCurrentServerOrganizationSecurityActivity(
  query: OrganizationSecurityActivityQuery = {}
): Promise<OrganizationSecurityActivityListResponse> {
  return listCurrentServerOrganizationSecurityActivityIsomorphic(query);
}
