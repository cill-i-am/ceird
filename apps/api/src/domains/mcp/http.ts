import { mcpHandler } from "@better-auth/oauth-provider";
import { McpServer } from "@effect/ai";
import { HttpLayerRouter } from "@effect/platform";
import { SqlClient } from "@effect/sql";
import { Effect, Layer, Option, Schema } from "effect";

import { CommentsRepository } from "../comments/repository.js";
import type { AuthenticationConfig } from "../identity/authentication/config.js";
import { JobsActivityRecorder } from "../jobs/activity-recorder.js";
import { JobsAuthorization } from "../jobs/authorization.js";
import { ConfigurationService } from "../jobs/configuration-service.js";
import { JobsRepositoriesLive } from "../jobs/repositories.js";
import { JobsService } from "../jobs/service.js";
import { LabelsRepository } from "../labels/repositories.js";
import { LabelsService } from "../labels/service.js";
import { OrganizationAuthorization } from "../organizations/authorization.js";
import { SiteGeocoder } from "../sites/geocoder.js";
import {
  ServiceAreasRepository,
  SiteLabelAssignmentsRepository,
  SitesRepository,
} from "../sites/repositories.js";
import { SitesService } from "../sites/service.js";
import type { McpSessionIdentity } from "./actor.js";
import { makeCurrentOrganizationActorFromMcpSessionLayer } from "./actor.js";
import {
  CeirdMcpToolkit,
  CeirdMcpToolkitLayer,
  McpToolRequestRuntime,
} from "./tools.js";

const MCP_PATH = "/mcp";
const OAUTH_PROTECTED_RESOURCE_PATH = "/.well-known/oauth-protected-resource";
type McpPath = `/${string}`;

type McpBaseLayer = Layer.Layer<never, never, never>;
type McpRuntimeServices = SqlClient.SqlClient | SiteGeocoder;
interface McpLayerOptions<ERuntime> {
  readonly baseLive?: McpBaseLayer | undefined;
  readonly runtimeLive?:
    | Layer.Layer<McpRuntimeServices, ERuntime, never>
    | undefined;
}

export function makeMcpWebHandler<ERuntime>(
  options: {
    readonly authConfig: AuthenticationConfig;
  } & McpLayerOptions<ERuntime>
) {
  const baseLive = options.baseLive ?? Layer.empty;
  const runtimeLive = options.runtimeLive ?? MissingMcpRuntimeLive;
  const mcpPath = getMcpPathname(options.authConfig.mcpResourceUrl);
  const mcpProtectedResourcePath =
    makeMcpProtectedResourceMetadataPathname(mcpPath);

  const authorizedMcpHandler = mcpHandler(
    {
      jwksUrl: makeMcpJwksUrl(options.authConfig.oauthIssuerUrl),
      verifyOptions: {
        audience: options.authConfig.mcpResourceUrl,
        issuer: options.authConfig.oauthIssuerUrl,
      },
    },
    (request, jwt) =>
      handleAuthorizedMcpRequest(request, jwt, {
        baseLive,
        mcpPath,
        runtimeLive,
      }),
    {
      resourceMetadataMappings: {
        [options.authConfig.mcpResourceUrl]: mcpProtectedResourcePath,
      },
    }
  );

  return (request: Request): Response | Promise<Response | null> | null => {
    const url = new URL(request.url);

    if (url.pathname === OAUTH_PROTECTED_RESOURCE_PATH) {
      return Response.json(
        makeProtectedResourceMetadata(options.authConfig.mcpResourceUrl, {
          authorizationServer: options.authConfig.oauthIssuerUrl,
        })
      );
    }

    if (url.pathname === mcpProtectedResourcePath) {
      return Response.json(
        makeProtectedResourceMetadata(options.authConfig.mcpResourceUrl, {
          authorizationServer: options.authConfig.oauthIssuerUrl,
        })
      );
    }

    if (url.pathname !== mcpPath) {
      return null;
    }

    const authorization = request.headers.get("authorization");

    if (!authorization?.trim().toLowerCase().startsWith("bearer ")) {
      return new Response(null, {
        headers: {
          "WWW-Authenticate": `Bearer resource_metadata="${makeMcpProtectedResourceMetadataUrl(
            options.authConfig.mcpResourceUrl,
            mcpProtectedResourcePath
          )}"`,
        },
        status: 401,
      });
    }

    return authorizedMcpHandler(request);
  };
}

function makeProtectedResourceMetadata(
  resource: string,
  options: { readonly authorizationServer: string }
) {
  return {
    resource,
    authorization_servers: [options.authorizationServer],
    bearer_methods_supported: ["header"],
  };
}

function getMcpPathname(resourceUrl: string): McpPath {
  const pathname = new URL(resourceUrl).pathname.replace(/\/+$/, "");
  return (pathname.length > 0 ? pathname : MCP_PATH) as McpPath;
}

function makeMcpProtectedResourceMetadataPathname(mcpPathname: string) {
  return `${OAUTH_PROTECTED_RESOURCE_PATH}${mcpPathname}`;
}

function makeMcpProtectedResourceMetadataUrl(
  resourceUrl: string,
  metadataPathname: string
) {
  return new URL(metadataPathname, new URL(resourceUrl).origin).toString();
}

function makeMcpJwksUrl(oauthIssuerUrl: string) {
  return `${oauthIssuerUrl.replace(/\/+$/, "")}/jwks`;
}

const TokenPayloadSchema = Schema.Struct({
  client_id: Schema.optional(Schema.String),
  exp: Schema.optional(Schema.Number),
  scope: Schema.optional(Schema.Unknown),
  sid: Schema.optional(Schema.String),
  sub: Schema.optional(Schema.String),
});
type TokenPayload = Schema.Schema.Type<typeof TokenPayloadSchema>;

async function handleAuthorizedMcpRequest<ERuntime>(
  request: Request,
  jwt: unknown,
  runtime: {
    readonly baseLive: McpBaseLayer;
    readonly mcpPath: McpPath;
    readonly runtimeLive: Layer.Layer<McpRuntimeServices, ERuntime, never>;
  }
) {
  const tokenPayload = Schema.decodeUnknownOption(TokenPayloadSchema)(jwt);
  const tokenPayloadValue = Option.getOrUndefined(tokenPayload);
  const session =
    tokenPayloadValue === undefined
      ? undefined
      : toMcpSessionIdentity(tokenPayloadValue);

  if (session === undefined) {
    return new Response(null, {
      headers: { "WWW-Authenticate": 'Bearer error="invalid_token"' },
      status: 401,
    });
  }

  const appLayer = createMcpAppLayer({
    baseLive: runtime.baseLive,
    mcpPath: runtime.mcpPath,
    runtimeLive: runtime.runtimeLive,
    scopes:
      tokenPayloadValue === undefined
        ? []
        : decodeScopes(tokenPayloadValue.scope),
    session,
  });
  const { dispose, handler } = HttpLayerRouter.toWebHandler(appLayer, {
    disableLogger: true,
  });

  try {
    return await handler(await normalizeMcpRequest(request));
  } finally {
    await dispose();
  }
}

function createMcpAppLayer<ERuntime>(options: {
  readonly baseLive: McpBaseLayer;
  readonly mcpPath: McpPath;
  readonly runtimeLive: Layer.Layer<McpRuntimeServices, ERuntime, never>;
  readonly scopes: readonly string[];
  readonly session: McpSessionIdentity;
}) {
  const toolLive = makeMcpToolLayer(options.session, options.runtimeLive).pipe(
    Layer.provide(options.baseLive)
  );
  const requestRuntimeLayer = Layer.succeed(
    McpToolRequestRuntime,
    McpToolRequestRuntime.of({
      scopes: options.scopes,
    })
  );

  return Layer.effectDiscard(McpServer.registerToolkit(CeirdMcpToolkit)).pipe(
    Layer.provide(CeirdMcpToolkitLayer),
    Layer.provide(Layer.mergeAll(requestRuntimeLayer, toolLive)),
    Layer.provide(
      McpServer.layerHttpRouter({
        name: "ceird-api",
        path: options.mcpPath,
        version: "0.0.0",
      })
    )
  );
}

async function normalizeMcpRequest(request: Request) {
  if (
    request.method !== "POST" ||
    !request.headers.get("content-type")?.includes("application/json")
  ) {
    return request;
  }

  const rawBody = await request.text();
  if (rawBody.length === 0) {
    return makeMcpRequestWithBody(request, rawBody);
  }

  try {
    return makeMcpRequestWithBody(
      request,
      JSON.stringify(normalizeMcpPayload(JSON.parse(rawBody)))
    );
  } catch {
    return makeMcpRequestWithBody(request, rawBody);
  }
}

function normalizeMcpPayload(payload: unknown): unknown {
  if (Array.isArray(payload)) {
    return payload.map(normalizeMcpPayload);
  }

  if (!isJsonObject(payload)) {
    return payload;
  }

  if (payload.method !== "tools/call" || !isJsonObject(payload.params)) {
    return payload;
  }

  if ("arguments" in payload.params) {
    return payload;
  }

  return {
    ...payload,
    params: {
      ...payload.params,
      arguments: {},
    },
  };
}

function makeMcpRequestWithBody(request: Request, body: string) {
  const headers = new Headers(request.headers);
  headers.delete("content-length");

  return new Request(request.url, {
    body,
    headers,
    method: request.method,
    signal: request.signal,
  });
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toMcpSessionIdentity(
  jwt: TokenPayload
): McpSessionIdentity | undefined {
  if (
    typeof jwt.sid !== "string" ||
    typeof jwt.sub !== "string" ||
    jwt.sid.length === 0 ||
    jwt.sub.length === 0
  ) {
    return undefined;
  }

  return {
    sessionId: jwt.sid,
    userId: jwt.sub,
  };
}

function decodeScopes(scope: unknown): string[] {
  if (typeof scope !== "string") {
    return [];
  }

  return scope
    .split(" ")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}

function makeMcpToolLayer<ERuntime>(
  session: McpSessionIdentity,
  runtimeLive: Layer.Layer<McpRuntimeServices, ERuntime, never>
) {
  const domainServiceLayer = Layer.mergeAll(
    LabelsService.DefaultWithoutDependencies,
    JobsService.DefaultWithoutDependencies,
    ConfigurationService.DefaultWithoutDependencies,
    SitesService.DefaultWithoutDependencies
  ).pipe(
    Layer.provide(
      Layer.mergeAll(
        OrganizationAuthorization.Default,
        LabelsRepository.Default,
        JobsAuthorization.Default,
        JobsActivityRecorder.Default,
        JobsRepositoriesLive,
        CommentsRepository.Default,
        ServiceAreasRepository.Default,
        SiteLabelAssignmentsRepository.Default,
        SitesRepository.Default,
        makeCurrentOrganizationActorFromMcpSessionLayer(session)
      )
    )
  );

  return domainServiceLayer.pipe(Layer.provide(runtimeLive));
}

const MissingMcpRuntimeLive = Layer.mergeAll(
  Layer.effect(
    SqlClient.SqlClient,
    Effect.die(new Error("MCP runtime is missing SqlClient; pass runtimeLive"))
  ),
  Layer.effect(
    SiteGeocoder,
    Effect.die(
      new Error("MCP runtime is missing SiteGeocoder; pass runtimeLive")
    )
  )
);
