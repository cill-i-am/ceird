import type * as SentryCloudflare from "@sentry/cloudflare";

import { makeAppCloudflareSentryOptions } from "./sentry-cloudflare";
import { SENTRY_DSN } from "./sentry-config";

const withSentry = vi.hoisted(() =>
  vi.fn<typeof SentryCloudflare.withSentry>(
    (_options, handler) => handler as never
  )
);

vi.mock(
  import("@sentry/cloudflare"),
  () =>
    ({
      withSentry,
    }) as unknown as typeof SentryCloudflare
);

vi.mock(import("@sentry/tanstackstart-react"), () => {
  throw new Error("App Worker imported the Node-backed TanStack Sentry SDK");
});

describe("server sentry boundary", () => {
  beforeEach(() => {
    vi.resetModules();
    withSentry.mockClear();
  });

  it("wraps the Cloudflare app server with the Worker-safe Sentry SDK", async () => {
    await expect(import("./server")).resolves.toBeDefined();

    expect(withSentry).toHaveBeenCalledExactlyOnceWith(
      expect.any(Function),
      expect.objectContaining({ fetch: expect.any(Function) })
    );

    const [makeOptions] = withSentry.mock.calls[0] ?? [];
    if (typeof makeOptions !== "function") {
      throw new TypeError("Expected Sentry options factory");
    }

    expect(
      makeOptions({
        SENTRY_ENVIRONMENT: "production",
        SENTRY_RELEASE: "release-sha",
      })
    ).toMatchObject({
      dsn: SENTRY_DSN,
      enableLogs: true,
      environment: "production",
      release: "release-sha",
      tracesSampleRate: 1,
    });
  });

  it("uses development defaults when the app server has no Cloudflare env", () => {
    expect(makeAppCloudflareSentryOptions()).toMatchObject({
      dsn: SENTRY_DSN,
      enableLogs: true,
      environment: "development",
      tracesSampleRate: 1,
    });
  });

  it("sets the document policy required for browser profiling", async () => {
    const { createServerEntry } = await import("./server");
    const entry = createServerEntry({
      fetch: vi.fn<() => Response>(() => new Response("ok")) as never,
    });

    const response = await entry.fetch(new Request("https://app.ceird.app"));

    expect(response.headers.get("Document-Policy")).toBe("js-profiling");
  });
});
