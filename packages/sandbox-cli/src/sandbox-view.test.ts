import {
  buildSandboxUrls,
  makeComposeProjectName,
  validateHostnameSlug,
  validateSandboxName,
} from "@ceird/sandbox-core";

import {
  formatSandboxJsonLines,
  formatSandboxStartupProgressLine,
  formatSandboxStartupTimeoutLines,
  formatSandboxViewLines,
} from "./sandbox-view.js";
import { detectSandboxTerminalStyle } from "./terminal-style.js";

describe("formatSandboxViewLines()", () => {
  it("formats sandbox URLs and the compose project with explicit labels", () => {
    expect(
      formatSandboxViewLines(
        "Sandbox ready",
        {
          sandboxName: validateSandboxName("feature-branch"),
          composeProjectName: makeComposeProjectName(
            validateSandboxName("feature-branch")
          ),
          status: "ready",
        },
        buildSandboxUrls(
          {
            hostnameSlug: validateHostnameSlug("feature-branch"),
            ports: {
              app: 4300,
              api: 4301,
              postgres: 5439,
            },
          },
          { aliasesHealthy: true, proxyPort: 1355 }
        )
      )
    ).toStrictEqual([
      "Sandbox ready",
      "  sandbox: feature-branch",
      "  compose project: ceird-sbx-feature-branch",
      "  status: ready",
      "  app url: https://feature-branch.app.ceird.localhost:1355",
      "  api url: https://feature-branch.api.ceird.localhost:1355",
      "  postgres url: postgresql://postgres:postgres@127.0.0.1:5439/ceird",
      "  app fallback url: http://127.0.0.1:4300",
      "  api fallback url: http://127.0.0.1:4301",
    ]);
  }, 10_000);
});

describe("formatSandboxJsonLines()", () => {
  it("formats sandbox URLs as a stable machine-readable payload", () => {
    const lines = formatSandboxJsonLines(
      {
        sandboxName: validateSandboxName("feature-branch"),
        composeProjectName: makeComposeProjectName(
          validateSandboxName("feature-branch")
        ),
        status: "ready",
      },
      buildSandboxUrls(
        {
          hostnameSlug: validateHostnameSlug("feature-branch"),
          ports: {
            app: 4300,
            api: 4301,
            postgres: 5439,
          },
        },
        { aliasesHealthy: true, proxyPort: 1355 }
      )
    );

    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0] ?? "")).toStrictEqual({
      sandbox: "feature-branch",
      composeProject: "ceird-sbx-feature-branch",
      status: "ready",
      urls: {
        app: "https://feature-branch.app.ceird.localhost:1355",
        api: "https://feature-branch.api.ceird.localhost:1355",
        postgres: "postgresql://postgres:postgres@127.0.0.1:5439/ceird",
        fallbackApp: "http://127.0.0.1:4300",
        fallbackApi: "http://127.0.0.1:4301",
      },
    });
  }, 10_000);
});

describe("formatSandboxStartupTimeoutLines()", () => {
  it("surfaces the fallback URLs, readiness snapshot, and next debug step", () => {
    expect(
      formatSandboxStartupTimeoutLines({
        sandboxName: validateSandboxName("feature-branch"),
        composeProjectName: makeComposeProjectName(
          validateSandboxName("feature-branch")
        ),
        timeoutMs: 60_000,
        readiness: {
          postgres: true,
          api: false,
          app: false,
        },
        urls: buildSandboxUrls(
          {
            hostnameSlug: validateHostnameSlug("feature-branch"),
            ports: {
              app: 4300,
              api: 4301,
              postgres: 5439,
            },
          },
          { aliasesHealthy: true, proxyPort: 1355 }
        ),
      })
    ).toStrictEqual([
      "Sandbox startup timed out after 60 seconds.",
      "  sandbox: feature-branch",
      "  compose project: ceird-sbx-feature-branch",
      "  postgres ready: yes",
      "  api ready: no",
      "  app ready: no",
      "  postgres url: postgresql://postgres:postgres@127.0.0.1:5439/ceird",
      "  app fallback url: http://127.0.0.1:4300",
      "  api fallback url: http://127.0.0.1:4301",
      "  next step: pnpm sandbox:logs -- --name feature-branch --service api",
    ]);
  }, 10_000);
});

describe("formatSandboxStartupProgressLine()", () => {
  it("formats running health checks with a Vite-style symbol and compact label", () => {
    expect(
      formatSandboxStartupProgressLine(
        {
          step: "app",
          status: "running",
          detail: "waiting for dev server...",
        },
        { color: false, unicode: true }
      )
    ).toBe("● App        waiting for dev server...");
  }, 10_000);

  it("falls back to ASCII-safe markers when Unicode is disabled", () => {
    expect(
      formatSandboxStartupProgressLine(
        {
          step: "portless",
          status: "warning",
          detail: "aliases unavailable, fallback URLs will be used",
        },
        { color: false, unicode: false }
      )
    ).toBe("! Portless   aliases unavailable, fallback URLs will be used");
  }, 10_000);

  it("adds ANSI color when terminal styling is enabled", () => {
    expect(
      formatSandboxStartupProgressLine(
        {
          step: "compose",
          status: "done",
          detail: "containers started",
        },
        { color: true, unicode: true }
      )
    ).toContain("\u001B[32m");
  }, 10_000);

  it("does not leave trailing padding on lines without detail", () => {
    expect(
      formatSandboxStartupProgressLine(
        {
          step: "api",
          status: "done",
        },
        { color: false, unicode: true }
      )
    ).toBe("✓ API");
  }, 10_000);
});

describe("detectSandboxTerminalStyle()", () => {
  it("disables color when NO_COLOR is set", () => {
    expect(
      detectSandboxTerminalStyle({
        env: {
          NO_COLOR: "1",
          TERM: "xterm-256color",
        },
        stdoutIsTTY: true,
      })
    ).toStrictEqual({
      color: false,
      unicode: true,
    });
  }, 10_000);

  it("enables color when FORCE_COLOR is set even outside a TTY", () => {
    expect(
      detectSandboxTerminalStyle({
        env: {
          FORCE_COLOR: "1",
          TERM: "dumb",
        },
        stdoutIsTTY: false,
      })
    ).toStrictEqual({
      color: true,
      unicode: true,
    });
  }, 10_000);

  it("allows explicitly forcing ASCII-only output", () => {
    expect(
      detectSandboxTerminalStyle({
        env: {
          CEIRD_SANDBOX_ASCII: "1",
        },
        stdoutIsTTY: true,
      })
    ).toStrictEqual({
      color: false,
      unicode: false,
    });
  }, 10_000);
});
