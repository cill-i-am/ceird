import { CEIRD_REQUEST_ID_HEADER } from "@ceird/observability-core";
import {
  FetchHttpClient,
  HttpClient,
  HttpClientRequest,
} from "@effect/platform";
import { Cause, Effect, Exit } from "effect";

import type { ServerApiForwardedHeaders } from "#/lib/server-api-forwarded-headers";

import { makeAppApiClient, resolveAppApiOrigin } from "./app-api-client-core";
import type {
  AppApiClient,
  AppApiClientOriginOptions,
} from "./app-api-client-core";
import { AppApiRequestError, normalizeAppApiError } from "./app-api-errors";
import type { AppApiError } from "./app-api-errors";
import {
  makeAppServerOperationContext,
  observeAppServerOperation,
} from "./app-server-observability";

export interface ServerAppApiClientOptions extends AppApiClientOriginOptions {
  readonly cookie?: string | undefined;
  readonly forwardedHeaders?: ServerApiForwardedHeaders | undefined;
  readonly onResponseStatus?: ((status: number) => void) | undefined;
}

function makeServerAppApiClient(options: ServerAppApiClientOptions) {
  return makeAppApiClient({
    apiOrigin: options.apiOrigin,
    requestOrigin: options.requestOrigin,
    transformClient: (httpClient) => {
      const withHeaders = withServerRequestHeaders(httpClient, options);

      if (!options.onResponseStatus) {
        return withHeaders;
      }

      return withHeaders.pipe(
        HttpClient.tap((response) =>
          Effect.sync(() => {
            options.onResponseStatus?.(response.status);
          })
        )
      );
    },
  });
}

function makeServerAppApiRequest<Response, RequestError>(
  options: ServerAppApiClientOptions,
  operation: string,
  execute: (client: AppApiClient) => Effect.Effect<Response, RequestError>
): Effect.Effect<Response, AppApiError, HttpClient.HttpClient> {
  return Effect.gen(function* () {
    yield* Effect.annotateCurrentSpan("app-api.operation", operation);
    const client = yield* makeServerAppApiClient(options);
    return yield* execute(client);
  }).pipe(Effect.withSpan(operation), Effect.mapError(normalizeAppApiError));
}

export async function runAppApiClient<Response, RequestError>(
  options: ServerAppApiClientOptions,
  operation: string,
  execute: (client: AppApiClient) => Effect.Effect<Response, RequestError>
): Promise<Response> {
  let lastResponseStatus: number | undefined;

  return await observeAppServerOperation(
    makeAppServerOperationContext({
      operation,
      requestId: options.forwardedHeaders?.[CEIRD_REQUEST_ID_HEADER],
      targetOrigin: resolveAppApiOrigin(options),
    }),
    async () => {
      const program = makeServerAppApiRequest(
        {
          ...options,
          onResponseStatus: (status) => {
            lastResponseStatus = status;
          },
        },
        operation,
        execute
      ).pipe(Effect.provide(FetchHttpClient.layer));
      const exit = await Effect.runPromiseExit(program);

      if (Exit.isSuccess(exit)) {
        return exit.value;
      }

      throw restoreAppApiRequestStatus(
        Cause.squash(exit.cause),
        lastResponseStatus
      );
    }
  );
}

function restoreAppApiRequestStatus(
  error: unknown,
  status: number | undefined
) {
  if (
    error instanceof AppApiRequestError &&
    error.status === undefined &&
    status !== undefined &&
    status >= 400 &&
    status <= 599
  ) {
    return new AppApiRequestError({
      message: error.message,
      status,
    });
  }

  return error;
}

function withServerRequestHeaders(
  httpClient: HttpClient.HttpClient,
  options: ServerAppApiClientOptions
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
        if (options.forwardedHeaders[CEIRD_REQUEST_ID_HEADER]) {
          nextRequest = HttpClientRequest.setHeader(
            nextRequest,
            CEIRD_REQUEST_ID_HEADER,
            options.forwardedHeaders[CEIRD_REQUEST_ID_HEADER]
          );
        }
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
