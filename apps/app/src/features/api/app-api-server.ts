import type { LabelsResponse } from "@ceird/labels-core";
import type { SitesOptionsResponse } from "@ceird/sites-core";
import { createIsomorphicFn } from "@tanstack/react-start";
import { Effect } from "effect";

import { runBrowserAppApiRequest } from "#/features/api/app-api-client";
import type { AppApiClient } from "#/features/api/app-api-client";

const importAppApiServerSsr = () => import("./app-api-server-ssr");

const getCurrentServerLabelsIsomorphic = createIsomorphicFn()
  .server(async () => {
    const { getCurrentServerLabelsDirect } = await importAppApiServerSsr();
    return await getCurrentServerLabelsDirect();
  })
  .client(() => getCurrentBrowserLabels());

const getCurrentServerSiteOptionsIsomorphic = createIsomorphicFn()
  .server(async () => {
    const { getCurrentServerSiteOptionsDirect } = await importAppApiServerSsr();
    return await getCurrentServerSiteOptionsDirect();
  })
  .client(() => getCurrentBrowserSiteOptions());

function runBrowserAppApiClient<Response>(
  operation: string,
  execute: (client: AppApiClient) => Effect.Effect<Response, unknown>
): Promise<Response> {
  return Effect.runPromise(runBrowserAppApiRequest(operation, execute));
}

async function getCurrentBrowserLabels(): Promise<LabelsResponse> {
  return await runBrowserAppApiClient("LabelsClient.listLabels", (client) =>
    client.labels.listLabels()
  );
}

async function getCurrentBrowserSiteOptions(): Promise<SitesOptionsResponse> {
  return await runBrowserAppApiClient("SitesClient.getSiteOptions", (client) =>
    client.sites.getSiteOptions()
  );
}

export function getCurrentServerLabels(): Promise<LabelsResponse> {
  return getCurrentServerLabelsIsomorphic();
}

export function getCurrentServerSiteOptions(): Promise<SitesOptionsResponse> {
  return getCurrentServerSiteOptionsIsomorphic();
}
