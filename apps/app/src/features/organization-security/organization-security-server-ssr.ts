import type {
  OrganizationSecurityActivityListResponse,
  OrganizationSecurityActivityQuery,
} from "@ceird/identity-core";

import { runAppApiClient } from "#/features/api/app-api-client";
import { readServerAppApiRequestStrict } from "#/features/api/app-api-server-ssr";

export async function listCurrentServerOrganizationSecurityActivityDirect(
  query: OrganizationSecurityActivityQuery = {}
): Promise<OrganizationSecurityActivityListResponse> {
  const request = await readServerAppApiRequestStrict();

  return await runAppApiClient(
    request,
    "OrganizationSecurityServer.listOrganizationSecurityActivity",
    (client) =>
      client.identity.listOrganizationSecurityActivity({
        query,
      })
  );
}
