import { Effect } from "effect";

import type {
  AppApiClient,
  runBrowserAppApiRequest,
} from "#/features/api/app-api-client";

import {
  listAllCurrentBrowserJobs,
  listAllCurrentBrowserSites,
} from "./app-api-server";

const { mockedRunBrowserAppApiRequest } = vi.hoisted(() => ({
  mockedRunBrowserAppApiRequest:
    vi.fn<
      (
        operation: string,
        execute: (_client: AppApiClient) => Effect.Effect<unknown>
      ) => Effect.Effect<unknown>
    >(),
}));

vi.mock(import("#/features/api/app-api-client"), () => ({
  runBrowserAppApiRequest:
    mockedRunBrowserAppApiRequest as unknown as typeof runBrowserAppApiRequest,
}));

describe("shared browser app api all-pages helpers", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    mockedRunBrowserAppApiRequest.mockReset();
  });

  it("rejects repeated cursors while reading every browser jobs page", async () => {
    const listJobs = vi
      .fn<() => Effect.Effect<unknown>>()
      .mockReturnValueOnce(
        Effect.succeed({ items: [], nextCursor: "cursor-one" })
      )
      .mockReturnValueOnce(
        Effect.succeed({ items: [], nextCursor: "cursor-one" })
      );
    const client = {
      jobs: { listJobs },
    } as unknown as AppApiClient;
    mockedRunBrowserAppApiRequest.mockImplementation(
      (
        _operation: string,
        execute: (_client: AppApiClient) => Effect.Effect<unknown>
      ) => execute(client)
    );

    await expect(listAllCurrentBrowserJobs()).rejects.toMatchObject({
      message: "Job pagination returned a repeated cursor.",
    });

    expect(listJobs).toHaveBeenCalledTimes(2);
  }, 1000);

  it("rejects jobs browser pagination after the documented max page count", async () => {
    const listJobs = vi.fn<
      (request: { query: { cursor?: string } }) => Effect.Effect<unknown>
    >(({ query }) =>
      Effect.succeed({
        items: [],
        nextCursor: `cursor-${query.cursor ?? "initial"}`,
      })
    );
    const client = {
      jobs: { listJobs },
    } as unknown as AppApiClient;
    mockedRunBrowserAppApiRequest.mockImplementation(
      (
        _operation: string,
        execute: (_client: AppApiClient) => Effect.Effect<unknown>
      ) => execute(client)
    );

    await expect(listAllCurrentBrowserJobs()).rejects.toMatchObject({
      message: "Job pagination exceeded the maximum page count.",
    });

    expect(listJobs).toHaveBeenCalledTimes(1000);
  }, 1000);

  it("keeps the existing browser sites repeated-cursor guard stable", async () => {
    const listSites = vi
      .fn<() => Effect.Effect<unknown>>()
      .mockReturnValueOnce(
        Effect.succeed({ items: [], nextCursor: "cursor-one" })
      )
      .mockReturnValueOnce(
        Effect.succeed({ items: [], nextCursor: "cursor-one" })
      );
    const client = {
      sites: { listSites },
    } as unknown as AppApiClient;
    mockedRunBrowserAppApiRequest.mockImplementation(
      (
        _operation: string,
        execute: (_client: AppApiClient) => Effect.Effect<unknown>
      ) => execute(client)
    );

    await expect(listAllCurrentBrowserSites()).rejects.toMatchObject({
      message: "Site pagination returned a repeated cursor.",
    });
  }, 1000);
});
