import type { LabelsResponse } from "@ceird/labels-core";
import type { SitesOptionsResponse } from "@ceird/sites-core";

import { runAppApiClient } from "#/features/api/app-api-client";
import { AppApiRequestError } from "#/features/api/app-api-errors";
import { readConfiguredServerApiOrigin } from "#/lib/api-origin.server";
import {
  normalizeServerApiCookieHeader,
  readServerApiForwardedHeaders,
} from "#/lib/server-api-forwarded-headers";

export interface ServerAppApiRequest {
  readonly cookie: string;
  readonly apiOrigin: string;
  readonly forwardedHeaders?: ReturnType<typeof readServerApiForwardedHeaders>;
}

export async function readServerAppApiRequestStrict(): Promise<ServerAppApiRequest> {
  const { getRequestHeader } = await import("@tanstack/react-start/server");
  const cookie = getRequestHeader("cookie");
  const apiOrigin = readConfiguredServerApiOrigin();

  if (!cookie) {
    throw new AppApiRequestError({
      message: "Cannot query the Ceird API without the current auth cookie.",
    });
  }

  if (!apiOrigin) {
    throw new AppApiRequestError({
      message: "Cannot resolve the Ceird API origin for server requests.",
    });
  }

  return {
    apiOrigin,
    cookie: normalizeServerApiCookieHeader(cookie, apiOrigin),
    forwardedHeaders: readServerApiForwardedHeaders({
      host: getRequestHeader("host"),
      forwardedProto: getRequestHeader("x-forwarded-proto"),
    }),
  };
}

export async function getCurrentServerLabelsDirect(): Promise<LabelsResponse> {
  const request = await readServerAppApiRequestStrict();

  return await runAppApiClient(request, "LabelsServer.listLabels", (client) =>
    client.labels.listLabels()
  );
}

export async function getCurrentServerSiteOptionsDirect(): Promise<SitesOptionsResponse> {
  const request = await readServerAppApiRequestStrict();

  return await runAppApiClient(
    request,
    "SitesServer.getSiteOptions",
    (client) => client.sites.getSiteOptions()
  );
}
