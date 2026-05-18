import { Config, Effect, Option } from "effect";

export const DEFAULT_MCP_RESOURCE_PATH = "/mcp" as const;

export interface McpResourceAuthConfig {
  readonly mcpResourceUrl: string;
  readonly oauthIssuerUrl: string;
}

const absoluteUrlConfig = (name: string) =>
  Config.string(name).pipe(
    Config.validate({
      message: `${name} must be a valid absolute URL`,
      validation: (value) => {
        try {
          const url = new URL(value);
          return url.protocol === "http:" || url.protocol === "https:";
        } catch {
          return false;
        }
      },
    })
  );

const mcpResourceUrlConfig = absoluteUrlConfig("MCP_RESOURCE_URL").pipe(
  Config.option
);
const oauthIssuerUrlConfig = absoluteUrlConfig("OAUTH_ISSUER_URL").pipe(
  Config.option
);

function isLoopbackHostname(hostname: string) {
  return (
    hostname === "localhost" ||
    hostname === "::1" ||
    hostname === "[::1]" ||
    hostname.startsWith("127.")
  );
}

export function normalizeOAuthIssuerUrl(value: string) {
  const url = new URL(value);

  if (url.protocol !== "https:" && !isLoopbackHostname(url.hostname)) {
    url.protocol = "https:";
  }

  url.search = "";
  url.hash = "";

  return url.toString().replace(/\/$/, "");
}

export function makeDefaultMcpResourceUrl(baseUrl: string) {
  const url = new URL(baseUrl);
  return new URL(DEFAULT_MCP_RESOURCE_PATH, url.origin).toString();
}

export function makeMcpResourceAuthConfig(input: {
  readonly baseUrl: string;
  readonly mcpResourceUrl?: string | undefined;
  readonly oauthIssuerUrl?: string | undefined;
}): McpResourceAuthConfig {
  return {
    mcpResourceUrl:
      input.mcpResourceUrl ?? makeDefaultMcpResourceUrl(input.baseUrl),
    oauthIssuerUrl: normalizeOAuthIssuerUrl(
      input.oauthIssuerUrl ?? input.baseUrl
    ),
  };
}

export const loadMcpResourceAuthConfig = (baseUrl: string) =>
  Effect.gen(function* () {
    const mcpResourceUrl = yield* mcpResourceUrlConfig;
    const oauthIssuerUrl = yield* oauthIssuerUrlConfig;

    return makeMcpResourceAuthConfig({
      baseUrl,
      mcpResourceUrl: Option.getOrUndefined(mcpResourceUrl),
      oauthIssuerUrl: Option.getOrUndefined(oauthIssuerUrl),
    });
  });
