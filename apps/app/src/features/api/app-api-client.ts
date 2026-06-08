import { AgentActionsApiGroup, AgentThreadsApiGroup } from "@ceird/agents-core";
import {
  IdentityApiGroup,
  UserPreferencesApiGroup,
} from "@ceird/identity-core";
import { JobsApiGroup } from "@ceird/jobs-core";
import { LabelsApiGroup } from "@ceird/labels-core";
import { ProximityApiGroup } from "@ceird/proximity-core";
import { SitesApiGroup } from "@ceird/sites-core";
import { Cause, Effect, Exit, Layer } from "effect";
import {
  FetchHttpClient,
  HttpClient,
  HttpClientRequest,
} from "effect/unstable/http";
import { HttpApi, HttpApiClient } from "effect/unstable/httpapi";

import {
  resolveApiOrigin,
  resolveBrowserAppApiBaseURL,
} from "#/lib/api-origin";
import type { ServerApiForwardedHeaders } from "#/lib/server-api-forwarded-headers";

import {
  AppApiOriginResolutionError,
  normalizeAppApiError,
} from "./app-api-errors";
import type { AppApiError } from "./app-api-errors";

const CeirdApi = HttpApi.make("CeirdApi")
  .add(AgentThreadsApiGroup)
  .add(AgentActionsApiGroup)
  .add(IdentityApiGroup)
  .add(JobsApiGroup)
  .add(UserPreferencesApiGroup)
  .add(LabelsApiGroup)
  .add(ProximityApiGroup)
  .add(SitesApiGroup);

const currentGlobalFetch: typeof globalThis.fetch = (input, init) =>
  globalThis.fetch(input, init);

const AppApiHttpClientLive = Layer.mergeAll(
  FetchHttpClient.layer,
  Layer.succeed(FetchHttpClient.Fetch, currentGlobalFetch)
);

export interface AppApiClientOptions {
  readonly apiBaseUrl?: string | undefined;
  readonly requestOrigin?: string | undefined;
  readonly apiOrigin?: string | undefined;
  readonly cookie?: string | undefined;
  readonly forwardedHeaders?: ServerApiForwardedHeaders | undefined;
}

function resolveAppApiOrigin(
  options: AppApiClientOptions = {}
): string | undefined {
  return resolveApiOrigin(options.requestOrigin, options.apiOrigin);
}

function makeAppApiClient(options: AppApiClientOptions = {}) {
  const apiOrigin = options.apiBaseUrl ?? resolveAppApiOrigin(options);

  if (!apiOrigin) {
    return Effect.fail(
      new AppApiOriginResolutionError({
        message: "Cannot resolve the Ceird API origin.",
      })
    );
  }

  return HttpApiClient.make(CeirdApi, {
    baseUrl: apiOrigin,
    transformClient: (httpClient) => withOptionalCookie(httpClient, options),
  });
}

export type AppApiClient = Effect.Success<ReturnType<typeof makeAppApiClient>>;

export function makeBrowserAppApiClient(origin?: string | undefined) {
  const requestOrigin =
    origin ??
    (typeof window === "undefined" ? undefined : window.location.origin);

  return makeAppApiClient({
    apiBaseUrl: resolveBrowserAppApiBaseURL(requestOrigin),
    requestOrigin,
  });
}

const BrowserAppApiHttpClientLive = Layer.mergeAll(
  AppApiHttpClientLive,
  Layer.succeed(FetchHttpClient.RequestInit, {
    credentials: "include" as const,
  })
);

export function provideBrowserAppApiHttp<A, E>(
  effect: Effect.Effect<
    A,
    E,
    HttpClient.HttpClient | FetchHttpClient.RequestInit
  >
): Effect.Effect<A, E, never> {
  return effect.pipe(Effect.provide(BrowserAppApiHttpClientLive));
}

export function runBrowserAppApiRequest<Response, RequestError>(
  operation: string,
  execute: (client: AppApiClient) => Effect.Effect<Response, RequestError>
): Effect.Effect<Response, AppApiError, never> {
  return Effect.gen(function* () {
    yield* Effect.annotateCurrentSpan("app-api.operation", operation);
    const client = yield* makeBrowserAppApiClient();

    return yield* execute(client);
  }).pipe(
    Effect.withSpan(operation),
    Effect.mapError(normalizeAppApiError),
    provideBrowserAppApiHttp
  );
}

export async function runAppApiClient<Response, RequestError>(
  options: AppApiClientOptions,
  operation: string,
  execute: (client: AppApiClient) => Effect.Effect<Response, RequestError>
): Promise<Response> {
  const program = Effect.gen(function* () {
    yield* Effect.annotateCurrentSpan("app-api.operation", operation);
    const client = yield* makeAppApiClient(options);
    return yield* execute(client);
  }).pipe(
    Effect.withSpan(operation),
    Effect.mapError(normalizeAppApiError),
    Effect.provide(AppApiHttpClientLive)
  );
  const exit = await Effect.runPromiseExit(program);

  if (Exit.isSuccess(exit)) {
    return exit.value;
  }

  throw Cause.squash(exit.cause);
}

function withOptionalCookie(
  httpClient: HttpClient.HttpClient,
  options: AppApiClientOptions
): HttpClient.HttpClient {
  if (!options.cookie && !options.forwardedHeaders) {
    return httpClient;
  }

  return httpClient.pipe(
    HttpClient.mapRequest((request) => {
      let nextRequest = request;

      if (options.cookie) {
        nextRequest = HttpClientRequest.setHeader(
          nextRequest,
          "cookie",
          options.cookie
        );
      }

      if (options.forwardedHeaders) {
        nextRequest = HttpClientRequest.setHeader(
          nextRequest,
          "origin",
          options.forwardedHeaders.origin
        );
        nextRequest = HttpClientRequest.setHeader(
          nextRequest,
          "x-forwarded-host",
          options.forwardedHeaders["x-forwarded-host"]
        );
        nextRequest = HttpClientRequest.setHeader(
          nextRequest,
          "x-forwarded-proto",
          options.forwardedHeaders["x-forwarded-proto"]
        );
      }

      return nextRequest;
    })
  );
}
