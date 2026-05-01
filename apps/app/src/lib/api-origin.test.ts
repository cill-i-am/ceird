import { resolveApiOrigin } from "./api-origin";
import { readConfiguredServerApiOrigin } from "./api-origin.server";

describe("api origin resolution", () => {
  let originalApiOrigin: string | undefined;

  beforeEach(() => {
    originalApiOrigin = process.env.API_ORIGIN;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    if (originalApiOrigin === undefined) {
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
      delete process.env.API_ORIGIN;
    } else {
      process.env.API_ORIGIN = originalApiOrigin;
    }
  });

  it("prefers an injected API origin when one is provided", () => {
    expect(
      resolveApiOrigin("http://127.0.0.1:4300", "http://127.0.0.1:4301")
    ).toBe("http://127.0.0.1:4301");
  }, 1000);

  it("maps the app portless origin to the API origin", () => {
    expect(
      resolveApiOrigin("https://agent-one.app.task-tracker.localhost:1355")
    ).toBe("https://agent-one.api.task-tracker.localhost:1355");
  }, 1000);

  it("maps the raw local app dev origin to the local API origin", () => {
    expect(resolveApiOrigin("http://127.0.0.1:3000")).toBe(
      "http://127.0.0.1:3001"
    );
  }, 1000);

  it("returns undefined when no origin is available", () => {
    expect(resolveApiOrigin()).toBeUndefined();
  }, 1000);

  it("returns undefined for an invalid origin", () => {
    expect(resolveApiOrigin("not-a-url")).toBeUndefined();
  }, 1000);

  it("falls back to host-based mapping when the injected API origin is invalid", () => {
    expect(
      resolveApiOrigin(
        "https://agent-one.app.task-tracker.localhost:1355",
        "not-a-url"
      )
    ).toBe("https://agent-one.api.task-tracker.localhost:1355");
  }, 1000);

  it("maps conventional app subdomains to matching API subdomains", () => {
    expect(resolveApiOrigin("https://app.task-tracker.example.com")).toBe(
      "https://api.task-tracker.example.com"
    );
  }, 1000);

  it("falls back to conventional app subdomain mapping when the injected API origin is invalid", () => {
    expect(
      resolveApiOrigin("https://app.task-tracker.example.com", "not-a-url")
    ).toBe("https://api.task-tracker.example.com");
  }, 1000);

  it("reads the injected server API origin", () => {
    process.env.API_ORIGIN = "http://tt-sbx-api:4301";

    expect(readConfiguredServerApiOrigin()).toBe("http://tt-sbx-api:4301");
  }, 1000);

  it("returns undefined when no server API origin is injected", () => {
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
    delete process.env.API_ORIGIN;

    expect(readConfiguredServerApiOrigin()).toBeUndefined();
  }, 1000);
});
