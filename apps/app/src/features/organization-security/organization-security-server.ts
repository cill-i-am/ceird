import type {
  OrganizationSecurityActivityListResponse,
  OrganizationSecurityActivityQuery,
  OrganizationSecurityActivityQueryInput,
} from "@ceird/identity-core";
import { createIsomorphicFn } from "@tanstack/react-start";
import { Effect } from "effect";

import { runBrowserAppApiRequest } from "#/features/api/app-api-client";
import type { AppApiClient } from "#/features/api/app-api-client";

import {
  DEFAULT_ORGANIZATION_SECURITY_ACTIVITY_QUERY,
  decodeOrganizationSecurityActivityQueryInput,
} from "./organization-security-query";

type OrganizationSecurityActivityQueryArgument =
  | OrganizationSecurityActivityQueryInput
  | OrganizationSecurityActivityQuery;

const importOrganizationSecurityServerSsr = () =>
  import("./organization-security-server-ssr");

const listCurrentServerOrganizationSecurityActivityIsomorphic =
  createIsomorphicFn()
    .server(
      async (
        query: OrganizationSecurityActivityQueryArgument = DEFAULT_ORGANIZATION_SECURITY_ACTIVITY_QUERY
      ) => {
        const decodedQuery =
          decodeOrganizationSecurityActivityQueryInput(query);
        const { listCurrentServerOrganizationSecurityActivityDirect } =
          await importOrganizationSecurityServerSsr();
        return await listCurrentServerOrganizationSecurityActivityDirect(
          decodedQuery
        );
      }
    )
    .client(
      (
        query: OrganizationSecurityActivityQueryArgument = DEFAULT_ORGANIZATION_SECURITY_ACTIVITY_QUERY
      ) =>
        listCurrentBrowserOrganizationSecurityActivity(
          decodeOrganizationSecurityActivityQueryInput(query)
        )
    );

function runBrowserAppApiClient<Response>(
  operation: string,
  execute: (client: AppApiClient) => Effect.Effect<Response, unknown>
): Promise<Response> {
  return Effect.runPromise(runBrowserAppApiRequest(operation, execute));
}

async function listCurrentBrowserOrganizationSecurityActivity(
  query: OrganizationSecurityActivityQueryArgument = DEFAULT_ORGANIZATION_SECURITY_ACTIVITY_QUERY
): Promise<OrganizationSecurityActivityListResponse> {
  const decodedQuery = decodeOrganizationSecurityActivityQueryInput(query);

  return await runBrowserAppApiClient(
    "OrganizationSecurityClient.listOrganizationSecurityActivity",
    (client) =>
      client.identity.listOrganizationSecurityActivity({
        query: decodedQuery,
      })
  );
}

export function listCurrentServerOrganizationSecurityActivity(
  query: OrganizationSecurityActivityQueryArgument = DEFAULT_ORGANIZATION_SECURITY_ACTIVITY_QUERY
): Promise<OrganizationSecurityActivityListResponse> {
  return listCurrentServerOrganizationSecurityActivityIsomorphic(
    decodeOrganizationSecurityActivityQueryInput(query)
  );
}
