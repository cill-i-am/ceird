import { mcpHandler } from "@better-auth/oauth-provider";
import { SessionId, UserId } from "@ceird/identity-core";
import { Effect, Layer, Option, Schema } from "effect";
import { McpServer } from "effect/unstable/ai";
import { HttpRouter } from "effect/unstable/http";
import { SqlClient } from "effect/unstable/sql";

import { CommentsRepository } from "../comments/repository.js";
import type { AuthenticationConfig } from "../identity/authentication/config.js";
import { JobsActivityRecorder } from "../jobs/activity-recorder.js";
import { JobsAuthorization } from "../jobs/authorization.js";
import { JobsRepositoriesLive } from "../jobs/repositories.js";
import { JobsService } from "../jobs/service.js";
import { LabelsRepository } from "../labels/repositories.js";
import { LabelsService } from "../labels/service.js";
import { OrganizationAuthorization } from "../organizations/authorization.js";
import { SiteGeocoder } from "../sites/geocoder.js";
import {
  SiteLabelAssignmentsRepository,
  SitesRepository,
} from "../sites/repositories.js";
import { SitesService } from "../sites/service.js";
import type { McpSessionIdentity } from "./actor.js";
import { makeCurrentOrganizationActorFromMcpSessionLayer } from "./actor.js";
import type { McpAuthorizedAppCacheOptions } from "./cache-config.js";
import {
  DEFAULT_MCP_AUTHORIZED_APP_CACHE_MAX_ENTRIES,
  DEFAULT_MCP_AUTHORIZED_APP_CACHE_TTL_MS,
  loadMcpAuthorizedAppCacheOptions,
} from "./cache-config.js";
import {
  CeirdMcpToolkit,
  CeirdMcpToolkitLayer,
  McpToolDomainRuntime,
  McpToolRequestRuntime,
} from "./tools.js";

const MCP_PATH = "/mcp";
const OAUTH_PROTECTED_RESOURCE_PATH = "/.well-known/oauth-protected-resource";
const MCP_DISPOSAL_URL_WITH_QUERY_PATTERN = /\bhttps?:\/\/[^\s<>()"']+/g;
const MCP_DISPOSAL_SECRET_ASSIGNMENT_PATTERN =
  /\b(token|code|secret|password|key)=([^&\s<>()"']+)/gi;
type McpPath = `/${string}`;

type McpBaseLayer = Layer.Layer<never, never, never>;
type McpRuntimeServices = SqlClient.SqlClient | SiteGeocoder;
interface McpLayerOptions<ERuntime> {
  readonly baseLive?: McpBaseLayer | undefined;
  readonly authorizedAppCache?: McpAuthorizedAppCache | undefined;
  readonly authorizedAppCacheOptions?: McpAuthorizedAppCacheOptions | undefined;
  readonly runtimeLive?:
    | Layer.Layer<McpRuntimeServices, ERuntime, never>
    | undefined;
}
interface AuthorizedMcpApp {
  readonly dispose: () => Promise<void>;
  readonly handler: (request: Request) => Promise<Response>;
  nextClientId: number;
  fallbackSessionId?: string | undefined;
}
interface AuthorizedMcpAppCacheEntry {
  readonly app: AuthorizedMcpApp;
  expiresAtMs: number;
  lastUsedAtMs: number;
}
interface McpAuthorizedClientIdentity {
  readonly clientId: string;
  readonly session: McpSessionIdentity;
}

export class McpAuthorizedAppCache {
  private readonly apps = new Map<string, AuthorizedMcpAppCacheEntry>();
  private readonly pendingApps = new Map<string, Promise<AuthorizedMcpApp>>();
  private readonly maxEntries: number;
  private readonly ttlMs: number;

  constructor(options: McpAuthorizedAppCacheOptions = {}) {
    this.maxEntries = Math.max(
      1,
      Math.floor(
        options.maxEntries ?? DEFAULT_MCP_AUTHORIZED_APP_CACHE_MAX_ENTRIES
      )
    );
    this.ttlMs = Math.max(
      1,
      Math.floor(options.ttlMs ?? DEFAULT_MCP_AUTHORIZED_APP_CACHE_TTL_MS)
    );
  }

  async getOrCreate(
    key: string,
    createApp: () => AuthorizedMcpApp
  ): Promise<AuthorizedMcpApp> {
    const nowMs = Date.now();
    const cached = this.apps.get(key);

    if (cached !== undefined && cached.expiresAtMs > nowMs) {
      cached.lastUsedAtMs = nowMs;
      cached.expiresAtMs = nowMs + this.ttlMs;
      return cached.app;
    }

    const pending = this.pendingApps.get(key);

    if (pending !== undefined) {
      return pending;
    }

    const next = this.createAndStore(key, cached, createApp, nowMs);
    this.pendingApps.set(key, next);

    try {
      return await next;
    } finally {
      if (this.pendingApps.get(key) === next) {
        this.pendingApps.delete(key);
      }
    }
  }

  async dispose(): Promise<void> {
    await Promise.allSettled(this.pendingApps.values());
    this.pendingApps.clear();
    const entries = [...this.apps.values()];
    this.apps.clear();
    await disposeAuthorizedMcpAppEntries(entries);
  }

  private async createAndStore(
    key: string,
    stale: AuthorizedMcpAppCacheEntry | undefined,
    createApp: () => AuthorizedMcpApp,
    nowMs: number
  ) {
    if (stale !== undefined) {
      this.apps.delete(key);
      await disposeAuthorizedMcpAppEntries([stale]);
    }

    await this.evictExpired(nowMs);
    await this.evictLeastRecentlyUsed(
      Math.max(0, this.apps.size - this.maxEntries + 1)
    );

    const app = createApp();
    this.apps.set(key, {
      app,
      expiresAtMs: nowMs + this.ttlMs,
      lastUsedAtMs: nowMs,
    });

    return app;
  }

  private async evictExpired(nowMs: number) {
    const expired: AuthorizedMcpAppCacheEntry[] = [];

    for (const [key, entry] of this.apps) {
      if (entry.expiresAtMs <= nowMs) {
        this.apps.delete(key);
        expired.push(entry);
      }
    }

    await disposeAuthorizedMcpAppEntries(expired);
  }

  private async evictLeastRecentlyUsed(count: number) {
    if (count <= 0) {
      return;
    }

    const entries = [...this.apps.entries()]
      .toSorted(([, left], [, right]) => left.lastUsedAtMs - right.lastUsedAtMs)
      .slice(0, count);

    for (const [key] of entries) {
      this.apps.delete(key);
    }

    await disposeAuthorizedMcpAppEntries(entries.map(([, entry]) => entry));
  }
}

export interface McpWebHandler {
  (request: Request): Response | Promise<Response | null> | null;
  readonly dispose: () => Promise<void>;
}

export function makeMcpAuthorizedAppCache(
  options?: McpAuthorizedAppCacheOptions
) {
  return new McpAuthorizedAppCache(options);
}

export function disposeMcpAuthorizedAppCache(cache: McpAuthorizedAppCache) {
  return cache.dispose();
}

export function makeMcpWebHandler<ERuntime>(
  options: {
    readonly authConfig: AuthenticationConfig;
  } & McpLayerOptions<ERuntime>
): McpWebHandler {
  const baseLive = options.baseLive ?? Layer.empty;
  const runtimeLive = options.runtimeLive ?? MissingMcpRuntimeLive;
  const mcpPath = getMcpPathname(options.authConfig.mcpResourceUrl);
  const mcpProtectedResourcePath =
    makeMcpProtectedResourceMetadataPathname(mcpPath);
  const ownsAuthorizedAppCache = options.authorizedAppCache === undefined;
  const authorizedAppCache =
    options.authorizedAppCache ??
    makeMcpAuthorizedAppCache(
      options.authorizedAppCacheOptions ??
        Effect.runSync(
          loadMcpAuthorizedAppCacheOptions.pipe(Effect.provide(baseLive))
        )
    );

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
        authorizedAppCache,
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

  const handler = (
    request: Request
  ): Response | Promise<Response | null> | null => {
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

  return Object.assign(handler, {
    dispose: () =>
      ownsAuthorizedAppCache ? authorizedAppCache.dispose() : Promise.resolve(),
  });
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
    readonly authorizedAppCache: McpAuthorizedAppCache;
    readonly baseLive: McpBaseLayer;
    readonly mcpPath: McpPath;
    readonly runtimeLive: Layer.Layer<McpRuntimeServices, ERuntime, never>;
  }
) {
  const tokenPayload = Schema.decodeUnknownOption(TokenPayloadSchema)(jwt);
  const tokenPayloadValue = Option.getOrUndefined(tokenPayload);
  const identity =
    tokenPayloadValue === undefined
      ? undefined
      : toMcpAuthorizedClientIdentity(tokenPayloadValue);

  if (tokenPayloadValue === undefined || identity === undefined) {
    return new Response(null, {
      headers: { "WWW-Authenticate": 'Bearer error="invalid_token"' },
      status: 401,
    });
  }

  const scopes = decodeScopes(tokenPayloadValue.scope);
  const app = await getOrCreateAuthorizedMcpApp(runtime.authorizedAppCache, {
    baseLive: runtime.baseLive,
    clientId: identity.clientId,
    mcpPath: runtime.mcpPath,
    runtimeLive: runtime.runtimeLive,
    scopes,
    session: identity.session,
  });
  const requestWithSession =
    app.fallbackSessionId === undefined || request.headers.has("mcp-session-id")
      ? request
      : withMcpSessionId(request, app.fallbackSessionId);
  const normalizedRequest = await normalizeMcpRequest(requestWithSession);
  const clientId = app.nextClientId;
  app.nextClientId += 1;
  const response = await app.handler(normalizedRequest.request);

  if (normalizedRequest.isInitializeRequest && response.status === 200) {
    const sessionId =
      response.headers.get("mcp-session-id") ?? String(clientId);
    app.fallbackSessionId = sessionId;

    if (!response.headers.has("mcp-session-id")) {
      return withMcpSessionResponseHeaders(response, sessionId);
    }
  }

  return response;
}

function getOrCreateAuthorizedMcpApp<ERuntime>(
  cache: McpAuthorizedAppCache,
  options: {
    readonly baseLive: McpBaseLayer;
    readonly clientId: string;
    readonly mcpPath: McpPath;
    readonly runtimeLive: Layer.Layer<McpRuntimeServices, ERuntime, never>;
    readonly scopes: readonly string[];
    readonly session: McpSessionIdentity;
  }
) {
  const key = makeAuthorizedMcpAppCacheKey(options);

  return cache.getOrCreate(key, () => {
    const appLayer = createMcpAppLayer(options);
    const { dispose, handler } = HttpRouter.toWebHandler(appLayer, {
      disableLogger: true,
    });

    return {
      dispose,
      handler,
      nextClientId: 0,
    };
  });
}

function makeAuthorizedMcpAppCacheKey(options: {
  readonly clientId: string;
  readonly scopes: readonly string[];
  readonly session: McpSessionIdentity;
}) {
  return JSON.stringify([
    options.session.sessionId,
    options.session.userId,
    options.clientId,
    options.scopes,
  ]);
}

function createMcpAppLayer<ERuntime>(options: {
  readonly baseLive: McpBaseLayer;
  readonly mcpPath: McpPath;
  readonly runtimeLive: Layer.Layer<McpRuntimeServices, ERuntime, never>;
  readonly scopes: readonly string[];
  readonly session: McpSessionIdentity;
}) {
  const requestRuntimeLayer = Layer.succeed(
    McpToolRequestRuntime,
    McpToolRequestRuntime.of({
      scopes: options.scopes,
    })
  );
  const toolDomainRuntimeLayer = Layer.succeed(
    McpToolDomainRuntime,
    McpToolDomainRuntime.of({
      run: (effect) =>
        effect.pipe(
          Effect.provide(
            makeMcpToolLayer(options.session, options.runtimeLive)
          ),
          Effect.provide(options.baseLive)
        ),
    })
  );

  return Layer.effectDiscard(McpServer.registerToolkit(CeirdMcpToolkit)).pipe(
    Layer.provide(CeirdMcpToolkitLayer),
    Layer.provide(Layer.mergeAll(requestRuntimeLayer, toolDomainRuntimeLayer)),
    Layer.provide(
      McpServer.layerHttp({
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
    return { isInitializeRequest: false, request };
  }

  const rawBody = await request.text();
  if (rawBody.length === 0) {
    return {
      isInitializeRequest: false,
      request: makeMcpRequestWithBody(request, rawBody),
    };
  }

  try {
    const payload = JSON.parse(rawBody);

    return {
      isInitializeRequest: containsMcpInitialize(payload),
      request: makeMcpRequestWithBody(
        request,
        JSON.stringify(normalizeMcpPayload(payload))
      ),
    };
  } catch {
    return {
      isInitializeRequest: false,
      request: makeMcpRequestWithBody(request, rawBody),
    };
  }
}

function containsMcpInitialize(payload: unknown): boolean {
  if (Array.isArray(payload)) {
    return payload.some(containsMcpInitialize);
  }

  return isJsonObject(payload) && payload.method === "initialize";
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

function withMcpSessionId(request: Request, sessionId: string) {
  const headers = new Headers(request.headers);
  headers.set("mcp-session-id", sessionId);

  return new Request(request, { headers });
}

function withMcpSessionResponseHeaders(response: Response, sessionId: string) {
  const headers = new Headers(response.headers);
  headers.set("mcp-session-id", sessionId);

  if (!headers.has("mcp-protocol-version")) {
    headers.set("mcp-protocol-version", "2025-06-18");
  }

  return new Response(response.body, {
    headers,
    status: response.status,
    statusText: response.statusText,
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

  const sessionId = Schema.decodeUnknownOption(SessionId)(jwt.sid);
  const userId = Schema.decodeUnknownOption(UserId)(jwt.sub);

  return Option.all({
    sessionId,
    userId,
  }).pipe(Option.getOrUndefined);
}

function toMcpAuthorizedClientIdentity(
  jwt: TokenPayload
): McpAuthorizedClientIdentity | undefined {
  const session = toMcpSessionIdentity(jwt);
  const clientId =
    typeof jwt.client_id === "string" ? jwt.client_id.trim() : "";

  if (session === undefined || clientId.length === 0) {
    return undefined;
  }

  return { clientId, session };
}

function decodeScopes(scope: unknown): string[] {
  if (typeof scope !== "string") {
    return [];
  }

  return [
    ...new Set(
      scope
        .split(/\s+/)
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0)
    ),
  ].toSorted();
}

async function disposeAuthorizedMcpAppEntries(
  entries: readonly AuthorizedMcpAppCacheEntry[]
) {
  const results = await Promise.allSettled(
    entries.map((entry) => entry.app.dispose())
  );
  const failures = results.filter(
    (result): result is PromiseRejectedResult => result.status === "rejected"
  );

  if (failures.length > 0) {
    Effect.runFork(
      Effect.logWarning("MCP authorized app disposal failed").pipe(
        Effect.annotateLogs({
          mcpAuthorizedAppDisposalFailureCount: failures.length,
          mcpAuthorizedAppDisposalFailureCauseType: typeof failures[0]?.reason,
          mcpAuthorizedAppDisposalFailureMessage:
            serializeMcpDisposalFailureReason(failures[0]?.reason),
        })
      )
    );
  }
}

function serializeMcpDisposalFailureReason(reason: unknown) {
  const message = reason instanceof Error ? reason.message : String(reason);

  return sanitizeMcpDisposalFailureMessage(message);
}

function sanitizeMcpDisposalFailureMessage(message: string) {
  return message
    .replaceAll(MCP_DISPOSAL_URL_WITH_QUERY_PATTERN, (value) =>
      sanitizeMcpDisposalFailureUrl(value)
    )
    .replaceAll(MCP_DISPOSAL_SECRET_ASSIGNMENT_PATTERN, "$1=[redacted]");
}

function sanitizeMcpDisposalFailureUrl(value: string) {
  try {
    const url = new URL(value);

    if (url.search.length > 0) {
      url.search = "?[redacted]";
    }

    url.username = "";
    url.password = "";
    return url.toString();
  } catch {
    return value.replaceAll(
      MCP_DISPOSAL_SECRET_ASSIGNMENT_PATTERN,
      "$1=[redacted]"
    );
  }
}

function makeMcpToolLayer<ERuntime>(
  session: McpSessionIdentity,
  runtimeLive: Layer.Layer<McpRuntimeServices, ERuntime, never>
) {
  const domainServiceLayer = Layer.mergeAll(
    LabelsService.DefaultWithoutDependencies,
    JobsService.DefaultWithoutDependencies,
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
