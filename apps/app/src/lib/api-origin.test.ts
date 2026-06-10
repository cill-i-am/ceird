import {
  resolveApiOrigin,
  resolveBrowserApiOrigin,
  resolveBrowserAppApiBaseURL,
} from "./api-origin";
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

  it("uses explicit API origin for tenant hosts", () => {
    expect(
      resolveApiOrigin(
        "https://acme-field-ops--pr-123.ceird.app",
        "https://api.pr-123.ceird.app"
      )
    ).toBe("https://api.pr-123.ceird.app");
  }, 1000);

  it("does not infer API origins from removed sandbox worktree aliases", () => {
    expect(
      resolveApiOrigin("https://agent-one.app.ceird.localhost:1355")
    ).toBeUndefined();
  }, 1000);

  it("maps the raw local app dev origin to the local API origin", () => {
    expect(resolveApiOrigin("http://127.0.0.1:3000")).toBe(
      "http://127.0.0.1:3001"
    );
  }, 1000);

  it("maps the stage-scoped Portless app origin to the matching local API origin", () => {
    expect(resolveApiOrigin("https://app.codex-portless.ceird.localhost")).toBe(
      "https://api.codex-portless.ceird.localhost"
    );
    expect(
      resolveApiOrigin("http://app.codex-portless.ceird.localhost:1355")
    ).toBe("http://api.codex-portless.ceird.localhost:1355");
  }, 1000);

  it("keeps browser requests same-origin for stage-scoped Portless app hosts", () => {
    expect(
      resolveBrowserApiOrigin(
        "https://app.codex-portless.ceird.localhost",
        "https://api.codex-portless.ceird.localhost"
      )
    ).toBe("https://app.codex-portless.ceird.localhost");
  }, 1000);

  it("does not treat local app hosts without a stage as the Portless browser contract", () => {
    expect(
      resolveBrowserApiOrigin(
        "https://app.ceird.localhost",
        "https://api.ceird.localhost"
      )
    ).toBe("https://api.ceird.localhost");
  }, 1000);

  it("uses the app proxy base path for stage-scoped Portless browser API requests", () => {
    expect(
      resolveBrowserAppApiBaseURL(
        "https://app.codex-portless.ceird.localhost",
        "https://api.codex-portless.ceird.localhost"
      )
    ).toBe("https://app.codex-portless.ceird.localhost/api");
  }, 1000);

  it("uses the configured browser API origin outside the local app proxy", () => {
    expect(
      resolveBrowserApiOrigin(
        "https://app.ceird.example.com",
        "https://api.ceird.example.com"
      )
    ).toBe("https://api.ceird.example.com");
    expect(
      resolveBrowserAppApiBaseURL(
        "https://app.ceird.example.com",
        "https://api.ceird.example.com"
      )
    ).toBe("https://api.ceird.example.com");
  }, 1000);

  it("returns undefined when no origin is available", () => {
    expect(resolveApiOrigin()).toBeUndefined();
  }, 1000);

  it("returns undefined for an invalid origin", () => {
    expect(resolveApiOrigin("not-a-url")).toBeUndefined();
  }, 1000);

  it("falls back to host-based mapping when the injected API origin is invalid", () => {
    expect(resolveApiOrigin("https://app.ceird.example.com", "not-a-url")).toBe(
      "https://api.ceird.example.com"
    );
  }, 1000);

  it("maps conventional app subdomains to matching API subdomains", () => {
    expect(resolveApiOrigin("https://app.ceird.example.com")).toBe(
      "https://api.ceird.example.com"
    );
  }, 1000);

  it("maps nested stage app hostnames to nested stage API hostnames", () => {
    expect(resolveApiOrigin("https://app.main.ceird.app")).toBe(
      "https://api.main.ceird.app"
    );
  }, 1000);

  it("maps legacy stage-prefixed app hostnames to stage-prefixed API hostnames", () => {
    expect(resolveApiOrigin("https://app-main.ceird.app")).toBe(
      "https://api-main.ceird.app"
    );
  }, 1000);

  it("falls back to conventional app subdomain mapping when the injected API origin is invalid", () => {
    expect(resolveApiOrigin("https://app.ceird.example.com", "not-a-url")).toBe(
      "https://api.ceird.example.com"
    );
  }, 1000);

  it("reads the injected server API origin", () => {
    process.env.API_ORIGIN = "https://api.example.com";

    expect(readConfiguredServerApiOrigin()).toBe("https://api.example.com");
  }, 1000);

  it("prefers the Cloudflare Worker env binding for server API origin", () => {
    process.env.API_ORIGIN = "https://api.process.example.com";

    expect(
      readConfiguredServerApiOrigin({
        API_ORIGIN: "https://api.worker.example.com",
      })
    ).toBe("https://api.worker.example.com");
  }, 1000);

  it("returns undefined when no server API origin is injected", () => {
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
    delete process.env.API_ORIGIN;

    expect(readConfiguredServerApiOrigin()).toBeUndefined();
  }, 1000);
});
