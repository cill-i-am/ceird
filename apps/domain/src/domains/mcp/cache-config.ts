import { Config, Effect, Schema } from "effect";

export const MCP_AUTHORIZED_APP_CACHE_MAX_ENTRIES_CONFIG_KEY =
  "MCP_AUTHORIZED_APP_CACHE_MAX_ENTRIES";
export const MCP_AUTHORIZED_APP_CACHE_TTL_SECONDS_CONFIG_KEY =
  "MCP_AUTHORIZED_APP_CACHE_TTL_SECONDS";
export const DEFAULT_MCP_AUTHORIZED_APP_CACHE_MAX_ENTRIES = 512;
export const DEFAULT_MCP_AUTHORIZED_APP_CACHE_TTL_MS = 30 * 60 * 1000;
export const DEFAULT_MCP_AUTHORIZED_APP_CACHE_TTL_SECONDS =
  DEFAULT_MCP_AUTHORIZED_APP_CACHE_TTL_MS / 1000;

export interface McpAuthorizedAppCacheOptions {
  readonly maxEntries?: number | undefined;
  readonly ttlMs?: number | undefined;
}

export function decodeMcpAuthorizedAppCacheConfigInteger(configKey: string) {
  const schema = Schema.Int.check(
    Schema.isGreaterThanOrEqualTo(1, {
      message: `${configKey} must be a positive integer`,
    })
  );

  return (value: number) =>
    Schema.decodeUnknownEffect(schema)(value).pipe(
      Effect.mapError((error) => new Config.ConfigError(error))
    );
}

export const loadMcpAuthorizedAppCacheOptions = Config.all({
  maxEntries: Config.int(MCP_AUTHORIZED_APP_CACHE_MAX_ENTRIES_CONFIG_KEY).pipe(
    Config.withDefault(DEFAULT_MCP_AUTHORIZED_APP_CACHE_MAX_ENTRIES),
    Config.mapOrFail(
      decodeMcpAuthorizedAppCacheConfigInteger(
        MCP_AUTHORIZED_APP_CACHE_MAX_ENTRIES_CONFIG_KEY
      )
    )
  ),
  ttlSeconds: Config.int(MCP_AUTHORIZED_APP_CACHE_TTL_SECONDS_CONFIG_KEY).pipe(
    Config.withDefault(DEFAULT_MCP_AUTHORIZED_APP_CACHE_TTL_SECONDS),
    Config.mapOrFail(
      decodeMcpAuthorizedAppCacheConfigInteger(
        MCP_AUTHORIZED_APP_CACHE_TTL_SECONDS_CONFIG_KEY
      )
    )
  ),
}).pipe(
  Effect.map(
    ({ maxEntries, ttlSeconds }) =>
      ({
        maxEntries,
        ttlMs: ttlSeconds * 1000,
      }) satisfies McpAuthorizedAppCacheOptions
  )
);
