import { JobsApiGroup, RateCardsApiGroup } from "@ceird/jobs-core";
import { LabelsApiGroup } from "@ceird/labels-core";
import { ServiceAreasApiGroup, SitesApiGroup } from "@ceird/sites-core";
import {
  FetchHttpClient,
  HttpApi,
  HttpApiClient,
  HttpClient,
  HttpClientRequest,
} from "@effect/platform";
import { Cause, Effect, Exit, Layer } from "effect";

import { resolveApiOrigin } from "#/lib/api-origin";

import {
  AppApiOriginResolutionError,
  normalizeAppApiError,
} from "./app-api-errors";
import type { AppApiError } from "./app-api-errors";

const CeirdApi = HttpApi.make("CeirdApi")
  .add(JobsApiGroup)
  .add(RateCardsApiGroup)
  .add(LabelsApiGroup)
  .add(ServiceAreasApiGroup)
  .add(SitesApiGroup);

export interface AppApiClientOptions {
  readonly requestOrigin?: string | undefined;
  readonly apiOrigin?: string | undefined;
  readonly cookie?: string | undefined;
  readonly forwardedHeaders?:
    | {
        readonly "x-forwarded-host": string;
        readonly "x-forwarded-proto": "http" | "https";
      }
    | undefined;
}

export function resolveAppApiOrigin(
  options: AppApiClientOptions = {}
): string | undefined {
  return resolveApiOrigin(options.requestOrigin, options.apiOrigin);
}

export function makeAppApiClient(options: AppApiClientOptions = {}) {
  const apiOrigin = resolveAppApiOrigin(options);

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

export type AppApiClient = Effect.Effect.Success<
  ReturnType<typeof makeAppApiClient>
>;

export function makeBrowserAppApiClient(origin?: string | undefined) {
  const requestOrigin =
    origin ??
    (typeof window === "undefined" ? undefined : window.location.origin);

  return makeAppApiClient({ requestOrigin });
}

export function makeServerAppApiClient(options: AppApiClientOptions) {
  return makeAppApiClient(options);
}

export const BrowserAppApiHttpClientLive = Layer.mergeAll(
  FetchHttpClient.layer,
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
    Effect.provide(FetchHttpClient.layer)
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
