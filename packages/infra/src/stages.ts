import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import * as Redacted from "effect/Redacted";
import * as Schema from "effect/Schema";

export const InfraStage = Schema.Literals(["preview", "production"]);
export type InfraStage = Schema.Schema.Type<typeof InfraStage>;
const INFRA_AUTH_EMAIL_TRANSPORT_MODES = [
  "cloudflare-api",
  "cloudflare-binding",
  "noop",
] as const;
const INFRA_SITE_GEOCODER_MODES = ["google", "stub"] as const;
export const InfraAuthEmailTransport = Schema.Literals(
  INFRA_AUTH_EMAIL_TRANSPORT_MODES
);
export type InfraAuthEmailTransport = Schema.Schema.Type<
  typeof InfraAuthEmailTransport
>;
export const InfraSiteGeocoderMode = Schema.Literals(INFRA_SITE_GEOCODER_MODES);
export type InfraSiteGeocoderMode = Schema.Schema.Type<
  typeof InfraSiteGeocoderMode
>;

export type DomainName = string;

export interface InfraStageConfig {
  readonly appName: string;
  readonly stage: InfraStage;
  readonly zoneName: DomainName;
  readonly appHostname: DomainName;
  readonly apiHostname: DomainName;
  readonly authEmailFrom: Redacted.Redacted<string>;
  readonly authEmailFromName: string;
  readonly authEmailTransport: InfraAuthEmailTransport;
  readonly hyperdriveOriginConnectionLimit: number;
  readonly planetScaleOrganization: string;
  readonly planetScaleDatabaseName: string;
  readonly planetScaleDefaultBranch: string;
  readonly planetScaleRegionSlug: string;
  readonly planetScaleClusterSize: string;
  readonly sentryDsn: string;
  readonly sentryTracesSampleRate: number;
  readonly siteGeocoderMode: InfraSiteGeocoderMode;
  readonly googleMapsApiKey?: Redacted.Redacted<string>;
  readonly applyMigrations: boolean;
}

const DEFAULT_API_SENTRY_DSN =
  "https://3917e2b6a24f49a20d625a1e3b2b1674@o368240.ingest.us.sentry.io/4511339367563264";
const decodeStage = Schema.decodeUnknownSync(InfraStage);
const domainNamePattern = /^[a-z0-9.-]+$/;
const emailAddressPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const planetScaleRegionSlugPattern = /^[a-z0-9-]+$/;
const planetScaleClusterSizePattern = /^PS-(5|10|20|40|80|160|320)$/;
const PlanetScaleRegionSlug = Schema.String.check(
  Schema.isPattern(planetScaleRegionSlugPattern, {
    message:
      "CEIRD_PLANETSCALE_REGION must be a PlanetScale region slug such as eu-west or gcp-europe-west1",
  })
);
const PlanetScaleClusterSize = Schema.String.check(
  Schema.isPattern(planetScaleClusterSizePattern, {
    message:
      "CEIRD_PLANETSCALE_CLUSTER_SIZE must be a PlanetScale cluster size such as PS-5",
  })
);
const GoogleMapsApiKey = Schema.String.check(
  Schema.isPattern(/\S/, {
    message: "GOOGLE_MAPS_API_KEY must not be empty",
  })
);
const AuthEmailFromAddress = Schema.String.check(
  Schema.isPattern(emailAddressPattern, {
    message: "AUTH_EMAIL_FROM must be a plain email address",
  })
);
const SentryTracesSampleRate = Schema.Number.check(
  Schema.isBetween(
    { minimum: 0, maximum: 1 },
    {
      message: "SENTRY_TRACES_SAMPLE_RATE must be between 0 and 1",
    }
  )
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

function decodeDomainName(value: string): DomainName {
  if (!value || !domainNamePattern.test(value)) {
    throw new Error(`Invalid domain name: ${value}`);
  }
  return value;
}

function normalizePlanetScaleRegionSlug(value: string) {
  return value.trim().toLowerCase();
}

function normalizePlanetScaleClusterSize(value: string) {
  return value.trim().replaceAll("_", "-").toUpperCase();
}

function decodePlanetScaleRegionSlug(value: string) {
  return Schema.decodeUnknownEffect(PlanetScaleRegionSlug)(
    normalizePlanetScaleRegionSlug(value)
  ).pipe(Effect.mapError((error) => new Config.ConfigError(error)));
}

function decodePlanetScaleClusterSize(value: string) {
  return Schema.decodeUnknownEffect(PlanetScaleClusterSize)(
    normalizePlanetScaleClusterSize(value)
  ).pipe(Effect.mapError((error) => new Config.ConfigError(error)));
}

function decodeAuthEmailFrom(value: Redacted.Redacted<string>) {
  return Schema.decodeUnknownEffect(AuthEmailFromAddress)(
    Redacted.value(value)
  ).pipe(
    Effect.as(value),
    Effect.mapError((error) => new Config.ConfigError(error))
  );
}

function decodeInfraAuthEmailTransport(value: string) {
  return Schema.decodeUnknownEffect(InfraAuthEmailTransport)(value).pipe(
    Effect.mapError((error) => new Config.ConfigError(error))
  );
}

function decodeInfraSiteGeocoderMode(value: string) {
  return Schema.decodeUnknownEffect(InfraSiteGeocoderMode)(value).pipe(
    Effect.mapError((error) => new Config.ConfigError(error))
  );
}

function decodeGoogleMapsApiKey(value: Redacted.Redacted<string>) {
  return Schema.decodeUnknownEffect(GoogleMapsApiKey)(
    Redacted.value(value).trim()
  ).pipe(
    Effect.as(value),
    Effect.mapError((error) => new Config.ConfigError(error))
  );
}

function decodeSentryTracesSampleRate(value: number) {
  return Schema.decodeUnknownEffect(SentryTracesSampleRate)(value).pipe(
    Effect.mapError((error) => new Config.ConfigError(error))
  );
}

function decodeHyperdriveOriginConnectionLimit(value: number) {
  return Schema.decodeUnknownEffect(HyperdriveOriginConnectionLimit)(
    value
  ).pipe(Effect.mapError((error) => new Config.ConfigError(error)));
}

export const loadInfraStageConfig = Effect.gen(function* () {
  const stage = yield* Config.string("CEIRD_INFRA_STAGE").pipe(
    Config.withDefault("production"),
    Config.map(decodeStage)
  );
  const zoneName = yield* Config.string("CEIRD_ZONE_NAME").pipe(
    Config.map(decodeDomainName)
  );
  const appHostname = yield* Config.string("CEIRD_APP_HOSTNAME").pipe(
    Config.withDefault(`app.${zoneName}`),
    Config.map(decodeDomainName)
  );
  const apiHostname = yield* Config.string("CEIRD_API_HOSTNAME").pipe(
    Config.withDefault(`api.${zoneName}`),
    Config.map(decodeDomainName)
  );
  const authEmailFrom = yield* Config.redacted("AUTH_EMAIL_FROM").pipe(
    Config.mapOrFail(decodeAuthEmailFrom)
  );
  const authEmailFromName = yield* Config.string("AUTH_EMAIL_FROM_NAME").pipe(
    Config.withDefault("Ceird")
  );
  const authEmailTransport = yield* Config.string("AUTH_EMAIL_TRANSPORT").pipe(
    Config.withDefault("cloudflare-binding"),
    Config.mapOrFail(decodeInfraAuthEmailTransport)
  );
  const hyperdriveOriginConnectionLimit = yield* Config.number(
    "CEIRD_HYPERDRIVE_ORIGIN_CONNECTION_LIMIT"
  ).pipe(
    Config.withDefault(5),
    Config.mapOrFail(decodeHyperdriveOriginConnectionLimit)
  );
  const planetScaleOrganization = yield* Config.string(
    "PLANETSCALE_ORGANIZATION"
  );
  const planetScaleDatabaseName = yield* Config.string(
    "CEIRD_PLANETSCALE_DATABASE_NAME"
  ).pipe(Config.withDefault(`ceird-${stage}`));
  const planetScaleDefaultBranch = yield* Config.string(
    "CEIRD_PLANETSCALE_DEFAULT_BRANCH"
  ).pipe(Config.withDefault("main"));
  const planetScaleRegionSlug = yield* Config.string(
    "CEIRD_PLANETSCALE_REGION"
  ).pipe(
    Config.withDefault("eu-west"),
    Config.mapOrFail(decodePlanetScaleRegionSlug)
  );
  const planetScaleClusterSize = yield* Config.string(
    "CEIRD_PLANETSCALE_CLUSTER_SIZE"
  ).pipe(
    Config.withDefault("PS-5"),
    Config.mapOrFail(decodePlanetScaleClusterSize)
  );
  const sentryDsn = yield* Config.string("SENTRY_DSN").pipe(
    Config.withDefault(DEFAULT_API_SENTRY_DSN)
  );
  const sentryTracesSampleRate = yield* Config.number(
    "SENTRY_TRACES_SAMPLE_RATE"
  ).pipe(Config.withDefault(1), Config.mapOrFail(decodeSentryTracesSampleRate));
  const siteGeocoderMode = yield* Config.string("SITE_GEOCODER_MODE").pipe(
    Config.withDefault("stub"),
    Config.mapOrFail(decodeInfraSiteGeocoderMode)
  );
  const googleMapsApiKey =
    siteGeocoderMode === "google"
      ? yield* Config.redacted("GOOGLE_MAPS_API_KEY").pipe(
          Config.mapOrFail(decodeGoogleMapsApiKey)
        )
      : undefined;
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
    authEmailTransport,
    hyperdriveOriginConnectionLimit,
    planetScaleOrganization,
    planetScaleDatabaseName,
    planetScaleDefaultBranch,
    planetScaleRegionSlug,
    planetScaleClusterSize,
    sentryDsn,
    sentryTracesSampleRate,
    siteGeocoderMode,
    googleMapsApiKey,
    applyMigrations,
  } satisfies InfraStageConfig;
});

export function resourceName(config: InfraStageConfig, suffix: string) {
  return `${config.appName}-${config.stage}-${suffix}`;
}
