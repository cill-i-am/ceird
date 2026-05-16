import { mcpHandler } from "@better-auth/oauth-provider";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { Effect, Layer } from "effect";

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
import {
  ServiceAreasRepository,
  SitesRepository,
} from "../sites/repositories.js";
import { SitesService } from "../sites/service.js";
import type { McpSessionIdentity } from "./actor.js";
import { makeCurrentOrganizationActorFromMcpSessionLayer } from "./actor.js";
import { registerMcpTools } from "./tools.js";

const MCP_PATH = "/mcp";
const OAUTH_PROTECTED_RESOURCE_PATH = "/.well-known/oauth-protected-resource";

type McpBaseLayer = Layer.Layer<never, never, never>;
type McpLayerOptions<RRuntime, ERuntime> = {
  readonly baseLive?: McpBaseLayer | undefined;
  readonly runtimeLive?: Layer.Layer<RRuntime, ERuntime, never> | undefined;
};

export function makeMcpWebHandler<RRuntime, ERuntime>(
  options: {
    readonly authConfig: AuthenticationConfig;
  } & McpLayerOptions<RRuntime, ERuntime>
) {
  const baseLive = options.baseLive ?? Layer.empty;
  const runtimeLive = options.runtimeLive ?? Layer.empty;
  const mcpPath = getMcpPathname(options.authConfig.mcpResourceUrl);
  const mcpProtectedResourcePath =
    makeMcpProtectedResourceMetadataPathname(mcpPath);

  const authorizedMcpHandler = mcpHandler(
    {
      verifyOptions: {
        audience: options.authConfig.mcpResourceUrl,
        issuer: options.authConfig.oauthIssuerUrl,
      },
    },
    async (request, jwt) =>
      handleAuthorizedMcpRequest(request, jwt, {
        baseLive,
        runtimeLive,
      }),
    {
      resourceMetadataMappings: {
        [options.authConfig.mcpResourceUrl]: mcpProtectedResourcePath,
      },
    }
  );

  return async (request: Request): Promise<Response | null> => {
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

function getMcpPathname(resourceUrl: string) {
  const pathname = new URL(resourceUrl).pathname.replace(/\/+$/, "");
  return pathname.length > 0 ? pathname : MCP_PATH;
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

interface TokenPayload {
  readonly client_id?: string;
  readonly exp?: number;
  readonly scope?: unknown;
  readonly sid?: string;
  readonly sub?: string;
}

async function handleAuthorizedMcpRequest<RRuntime, ERuntime>(
  request: Request,
  jwt: TokenPayload,
  runtime: {
    readonly baseLive: McpBaseLayer;
    readonly runtimeLive: Layer.Layer<RRuntime, ERuntime, never>;
  }
) {
  const authInfo = toMcpAuthInfo(request, jwt);
  const transport = new WebStandardStreamableHTTPServerTransport({
    enableJsonResponse: true,
    sessionIdGenerator: undefined,
  });
  const server = createMcpServer({
    baseLive: runtime.baseLive,
    runtimeLive: runtime.runtimeLive,
  });
  await server.connect(transport);

  try {
    return await transport.handleRequest(request, { authInfo });
  } finally {
    await server.close();
  }
}

function createMcpServer<RRuntime, ERuntime>(options: {
  readonly baseLive: McpBaseLayer;
  readonly runtimeLive: Layer.Layer<RRuntime, ERuntime, never>;
}) {
  const server = new McpServer({
    name: "ceird-api",
    version: "0.0.0",
  });

  registerMcpTools(server, {
    runWithMcpSession: async <A, E, R>(
      session: McpSessionIdentity,
      effect: Effect.Effect<A, E, R>
    ) => {
      const runnable = effect.pipe(
        Effect.provide(makeMcpToolLayer(session, options.runtimeLive)),
        Effect.provide(options.baseLive)
      ) as Effect.Effect<A, E, never>;

      return Effect.runPromise(runnable);
    },
  });

  return server;
}

function toMcpAuthInfo(request: Request, jwt: TokenPayload) {
  return {
    token: request.headers.get("authorization")?.replace(/^Bearer /i, "") ?? "",
    clientId: String(jwt.client_id ?? ""),
    scopes: decodeScopes(jwt.scope),
    expiresAt: typeof jwt.exp === "number" ? jwt.exp : undefined,
    resource: new URL(request.url),
    extra: {
      sessionId: jwt.sid,
      subject: jwt.sub,
    },
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

function makeMcpToolLayer<RRuntime, ERuntime>(
  session: McpSessionIdentity,
  runtimeLive: Layer.Layer<RRuntime, ERuntime, never>
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
        SitesRepository.Default,
        makeCurrentOrganizationActorFromMcpSessionLayer(session)
      )
    )
  );

  return Layer.mergeAll(runtimeLive, domainServiceLayer);
}
