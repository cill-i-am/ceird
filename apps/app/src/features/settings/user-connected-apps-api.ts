import type {
  ConnectedAppGrantId,
  ConnectedAppGrantListResponse,
  DisconnectConnectedAppGrantResponse,
} from "@ceird/identity-core";
import { Effect } from "effect";

import type { AppApiClient } from "#/features/api/app-api-client";
import { runBrowserAppApiRequest } from "#/features/api/app-api-client";

function runBrowserAppApiClient<Response>(
  operation: string,
  execute: (client: AppApiClient) => Effect.Effect<Response, unknown>
): Promise<Response> {
  return Effect.runPromise(runBrowserAppApiRequest(operation, execute));
}

export async function listConnectedAppGrants(): Promise<ConnectedAppGrantListResponse> {
  return await runBrowserAppApiClient(
    "ConnectedAppsClient.listConnectedAppGrants",
    (client) => client.identity.listConnectedAppGrants()
  );
}

export async function disconnectConnectedAppGrant(input: {
  readonly grantId: ConnectedAppGrantId;
}): Promise<DisconnectConnectedAppGrantResponse> {
  return await runBrowserAppApiClient(
    "ConnectedAppsClient.disconnectConnectedAppGrant",
    (client) =>
      client.identity.disconnectConnectedAppGrant({
        params: { grantId: input.grantId },
      })
  );
}
