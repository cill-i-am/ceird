import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Redacted from "effect/Redacted";
import * as Schema from "effect/Schema";

import { NeonDirectDatabaseUrl } from "./neon.ts";

export const InfraStage = Schema.Literals(["preview", "production"]);
export type InfraStage = Schema.Schema.Type<typeof InfraStage>;

const domainNamePattern = /^[a-z0-9.-]+$/;
const emailAddressPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const DomainName = Schema.NonEmptyString.check(
  Schema.isPattern(domainNamePattern, {
    message:
      "Domain names may only contain lowercase letters, digits, dots, and hyphens",
  })
);
export type DomainName = Schema.Schema.Type<typeof DomainName>;

export const InfraGoogleMapsApiKey = Schema.NonEmptyString.pipe(
  Schema.brand("@ceird/infra/GoogleMapsApiKey")
);
export type InfraGoogleMapsApiKey = Schema.Schema.Type<
  typeof InfraGoogleMapsApiKey
>;

export interface InfraStageConfig {
  readonly appName: string;
  readonly stage: InfraStage;
  readonly zoneName: DomainName;
  readonly appHostname: DomainName;
  readonly apiHostname: DomainName;
  readonly authEmailFrom: Redacted.Redacted<string>;
  readonly authEmailFromName: string;
  readonly googleMapsApiKey: Redacted.Redacted<InfraGoogleMapsApiKey>;
  readonly hyperdriveOriginConnectionLimit: number;
  readonly neonDatabaseUrl: Redacted.Redacted<NeonDirectDatabaseUrl>;
  readonly neonMigrationDatabaseUrl:
    | Redacted.Redacted<NeonDirectDatabaseUrl>
    | undefined;
  readonly applyMigrations: boolean;
}

const AuthEmailFromAddress = Schema.String.check(
  Schema.isPattern(emailAddressPattern, {
    message: "AUTH_EMAIL_FROM must be a plain email address",
  })
);
const HyperdriveOriginConnectionLimit = Schema.Int.check(
  Schema.isBetween(
    { minimum: 5, maximum: 100 },
    {
      message:
        "CEIRD_HYPERDRIVE_ORIGIN_CONNECTION_LIMIT must be an integer between 5 and 100",
    }
  )
);

function decodeInfraStage(value: string) {
  return Schema.decodeUnknownEffect(InfraStage)(value).pipe(
    Effect.mapError((error) => new Config.ConfigError(error))
  );
}

function decodeDomainName(value: string) {
  return Schema.decodeUnknownEffect(DomainName)(value).pipe(
    Effect.mapError((error) => new Config.ConfigError(error))
  );
}

function decodeAuthEmailFrom(value: Redacted.Redacted<string>) {
  return Schema.decodeUnknownEffect(AuthEmailFromAddress)(
    Redacted.value(value)
  ).pipe(
    Effect.as(value),
    Effect.mapError((error) => new Config.ConfigError(error))
  );
}

function decodeGoogleMapsApiKey(value: Redacted.Redacted<string>) {
  return Schema.decodeUnknownEffect(InfraGoogleMapsApiKey)(
    Redacted.value(value).trim()
  ).pipe(
    Effect.map((googleMapsApiKey) => Redacted.make(googleMapsApiKey)),
    Effect.mapError((error) => new Config.ConfigError(error))
  );
}

function trimRedactedConfigString(value: Redacted.Redacted<string>) {
  return Redacted.make(Redacted.value(value).trim());
}

function decodeHyperdriveOriginConnectionLimit(value: number) {
  return Schema.decodeUnknownEffect(HyperdriveOriginConnectionLimit)(
    value
  ).pipe(Effect.mapError((error) => new Config.ConfigError(error)));
}

function decodeNeonDirectDatabaseUrl(value: Redacted.Redacted<string>) {
  return Schema.decodeUnknownEffect(NeonDirectDatabaseUrl)(
    Redacted.value(value)
  ).pipe(
    Effect.map((neonDatabaseUrl) => Redacted.make(neonDatabaseUrl)),
    Effect.mapError((error) => new Config.ConfigError(error))
  );
}

export const loadInfraStageConfig = Effect.gen(function* () {
  const stage = yield* Config.string("CEIRD_INFRA_STAGE").pipe(
    Config.withDefault("production"),
    Config.mapOrFail(decodeInfraStage)
  );
  const zoneName = yield* Config.string("CEIRD_ZONE_NAME").pipe(
    Config.mapOrFail(decodeDomainName)
  );
  const appHostname = yield* Config.string("CEIRD_APP_HOSTNAME").pipe(
    Config.withDefault(`app.${zoneName}`),
    Config.mapOrFail(decodeDomainName)
  );
  const apiHostname = yield* Config.string("CEIRD_API_HOSTNAME").pipe(
    Config.withDefault(`api.${zoneName}`),
    Config.mapOrFail(decodeDomainName)
  );
  const authEmailFrom = yield* Config.redacted("AUTH_EMAIL_FROM").pipe(
    Config.mapOrFail(decodeAuthEmailFrom)
  );
  const authEmailFromName = yield* Config.string("AUTH_EMAIL_FROM_NAME").pipe(
    Config.withDefault("Ceird")
  );
  const googleMapsApiKey = yield* Config.redacted("GOOGLE_MAPS_API_KEY").pipe(
    Config.mapOrFail(decodeGoogleMapsApiKey)
  );
  const hyperdriveOriginConnectionLimit = yield* Config.number(
    "CEIRD_HYPERDRIVE_ORIGIN_CONNECTION_LIMIT"
  ).pipe(
    Config.withDefault(5),
    Config.mapOrFail(decodeHyperdriveOriginConnectionLimit)
  );
  const neonDatabaseUrl = yield* Config.redacted("NEON_DATABASE_URL").pipe(
    Config.map(trimRedactedConfigString),
    Config.mapOrFail(decodeNeonDirectDatabaseUrl)
  );
  const neonMigrationDatabaseUrlOption = yield* Config.option(
    Config.redacted("NEON_MIGRATION_DATABASE_URL").pipe(
      Config.map(trimRedactedConfigString)
    )
  );
  const neonMigrationDatabaseUrl:
    | Redacted.Redacted<NeonDirectDatabaseUrl>
    | undefined = yield* Option.match(neonMigrationDatabaseUrlOption, {
    onNone: () =>
      Effect.succeed(Option.none<Redacted.Redacted<NeonDirectDatabaseUrl>>()),
    onSome: (value) =>
      Redacted.value(value).length > 0
        ? decodeNeonDirectDatabaseUrl(value).pipe(Effect.map(Option.some))
        : Effect.succeed(
            Option.none<Redacted.Redacted<NeonDirectDatabaseUrl>>()
          ),
  }).pipe(Effect.map(Option.getOrUndefined));
  const applyMigrations = yield* Config.boolean("CEIRD_APPLY_MIGRATIONS").pipe(
    Config.withDefault(false)
  );

  return {
    appName: "ceird",
    stage,
    zoneName,
    appHostname,
    apiHostname,
    authEmailFrom,
    authEmailFromName,
    googleMapsApiKey,
    hyperdriveOriginConnectionLimit,
    neonDatabaseUrl,
    neonMigrationDatabaseUrl,
    applyMigrations,
  } satisfies InfraStageConfig;
});

export function resourceName(config: InfraStageConfig, suffix: string) {
  return `${config.appName}-${config.stage}-${suffix}`;
}
