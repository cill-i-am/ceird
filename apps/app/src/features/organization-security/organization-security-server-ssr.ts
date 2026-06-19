import type {
  OrganizationSecurityActivityListResponse,
  OrganizationSecurityActivityQuery,
  OrganizationSecurityActivityQueryInput,
} from "@ceird/identity-core";

import { runAppApiClient } from "#/features/api/app-api-client";
import { readServerAppApiRequestStrict } from "#/features/api/app-api-server-ssr";

import {
  DEFAULT_ORGANIZATION_SECURITY_ACTIVITY_QUERY,
  decodeOrganizationSecurityActivityQueryInput,
} from "./organization-security-query";

type OrganizationSecurityActivityQueryArgument =
  | OrganizationSecurityActivityQueryInput
  | OrganizationSecurityActivityQuery;

export async function listCurrentServerOrganizationSecurityActivityDirect(
  query: OrganizationSecurityActivityQueryArgument = DEFAULT_ORGANIZATION_SECURITY_ACTIVITY_QUERY
): Promise<OrganizationSecurityActivityListResponse> {
  const request = await readServerAppApiRequestStrict();
  const decodedQuery = decodeOrganizationSecurityActivityQueryInput(query);

  return await runAppApiClient(
    request,
    "OrganizationSecurityServer.listOrganizationSecurityActivity",
    (client) =>
      client.identity.listOrganizationSecurityActivity({
        query: decodedQuery,
      })
  );
}
