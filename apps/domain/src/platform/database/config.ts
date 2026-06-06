import { Config, Effect, Schema } from "effect";

export const DEFAULT_APP_DATABASE_URL =
  "postgresql://postgres:postgres@127.0.0.1:5439/ceird";

const postgresDatabaseUrlPattern = /^postgres(?:ql)?:\/\/\S+$/;

export const AppDatabaseUrlString = Schema.NonEmptyString.check(
  Schema.isPattern(postgresDatabaseUrlPattern, {
    message: "DATABASE_URL must be a non-empty Postgres connection URL",
  })
).pipe(Schema.brand("@ceird/platform/database/AppDatabaseUrl"));
export type AppDatabaseUrlString = Schema.Schema.Type<
  typeof AppDatabaseUrlString
>;

export function decodeAppDatabaseUrlString(value: string) {
  return Schema.decodeUnknownEffect(AppDatabaseUrlString)(value.trim()).pipe(
    Effect.mapError((error) => new Config.ConfigError(error))
  );
}

export const appDatabaseUrlConfig = Config.string("DATABASE_URL").pipe(
  Config.withDefault(DEFAULT_APP_DATABASE_URL),
  Config.mapOrFail(decodeAppDatabaseUrlString)
);
