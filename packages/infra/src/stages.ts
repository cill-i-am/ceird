import { createHash } from "node:crypto";

import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Redacted from "effect/Redacted";
import * as Schema from "effect/Schema";

export const apiMigrationsDir = "apps/api/drizzle";

export const InfraStage = Schema.NonEmptyString;
export type InfraStage = Schema.Schema.Type<typeof InfraStage>;

const maxStageSlugLength = 40;

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
  readonly stage: string;
  readonly zoneName: DomainName;
  readonly appHostname: DomainName;
  readonly apiHostname: DomainName;
  readonly authEmailFrom: Redacted.Redacted<string>;
  readonly authEmailFromName: string;
  readonly googleMapsApiKey: Redacted.Redacted<InfraGoogleMapsApiKey>;
  readonly hyperdriveOriginConnectionLimit: number;
  readonly neonDatabaseName: string;
  readonly neonDefaultBranchName: string;
  readonly neonMigrationsDir: string;
  readonly neonOrgId: string | undefined;
  readonly neonParentBranchName: string;
  readonly neonParentStage: string;
  readonly neonPgVersion: NeonPgVersion;
  readonly neonRegion: NeonRegion;
  readonly neonRoleName: string;
}

export interface AlchemyStageIdentityInput {
  readonly appName?: string | undefined;
  readonly productionStage?: string | undefined;
  readonly stage: string;
}

export interface AlchemyStageIdentity {
  readonly appName: string;
  readonly isProduction: boolean;
  readonly neonBranchName: string;
  readonly stage: string;
  readonly stageSlug: string;
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
export const NeonRegion = Schema.Literals([
  "aws-us-east-1",
  "aws-us-east-2",
  "aws-us-west-2",
  "aws-eu-central-1",
  "aws-eu-west-2",
  "aws-ap-southeast-1",
  "aws-ap-southeast-2",
  "aws-sa-east-1",
  "azure-eastus2",
  "azure-westus3",
  "azure-gwc",
]);
export type NeonRegion = Schema.Schema.Type<typeof NeonRegion>;

export const NeonPgVersion = Schema.Literals([14, 15, 16, 17, 18]);
export type NeonPgVersion = Schema.Schema.Type<typeof NeonPgVersion>;

function decodeAlchemyStage(value: string) {
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

function decodeHyperdriveOriginConnectionLimit(value: number) {
  return Schema.decodeUnknownEffect(HyperdriveOriginConnectionLimit)(
    value
  ).pipe(Effect.mapError((error) => new Config.ConfigError(error)));
}

function decodeNeonRegion(value: string) {
  return Schema.decodeUnknownEffect(NeonRegion)(value).pipe(
    Effect.mapError((error) => new Config.ConfigError(error))
  );
}

function decodeNeonPgVersion(value: number) {
  return Schema.decodeUnknownEffect(NeonPgVersion)(value).pipe(
    Effect.mapError((error) => new Config.ConfigError(error))
  );
}

export function loadInfraStageConfig(stageInput: string) {
  return Effect.gen(function* () {
    const stage = yield* decodeAlchemyStage(stageInput);
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
    const neonDatabaseName = yield* Config.string(
      "CEIRD_NEON_DATABASE_NAME"
    ).pipe(Config.withDefault("ceird"));
    const neonDefaultBranchName = yield* Config.string(
      "CEIRD_NEON_DEFAULT_BRANCH_NAME"
    ).pipe(Config.withDefault("base"));
    const neonMigrationsDir = yield* Config.string(
      "CEIRD_NEON_MIGRATIONS_DIR"
    ).pipe(Config.withDefault(apiMigrationsDir));
    const neonOrgIdOption = yield* Config.option(
      Config.string("NEON_ORG_ID").pipe(Config.map((value) => value.trim()))
    );
    const neonOrgId = yield* Option.match(neonOrgIdOption, {
      onNone: () => Effect.succeed(Option.none<string>()),
      onSome: (value) =>
        value.length > 0
          ? Effect.succeed(Option.some(value))
          : Effect.succeed(Option.none<string>()),
    }).pipe(Effect.map(Option.getOrUndefined));
    const neonParentBranchName = yield* Config.string(
      "CEIRD_NEON_PARENT_BRANCH_NAME"
    ).pipe(Config.withDefault("main"));
    const neonParentStage = yield* Config.string(
      "CEIRD_NEON_PARENT_STAGE"
    ).pipe(Config.withDefault("main"));
    const neonPgVersion = yield* Config.number("CEIRD_NEON_PG_VERSION").pipe(
      Config.withDefault(17),
      Config.mapOrFail(decodeNeonPgVersion)
    );
    const neonRegion = yield* Config.string("CEIRD_NEON_REGION").pipe(
      Config.withDefault("aws-eu-west-2"),
      Config.mapOrFail(decodeNeonRegion)
    );
    const neonRoleName = yield* Config.string("CEIRD_NEON_ROLE_NAME").pipe(
      Config.withDefault("ceird")
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
      neonDatabaseName,
      neonDefaultBranchName,
      neonMigrationsDir,
      neonOrgId,
      neonParentBranchName,
      neonParentStage,
      neonPgVersion,
      neonRegion,
      neonRoleName,
    } satisfies InfraStageConfig;
  });
}

export function resourceName(config: InfraStageConfig, suffix: string) {
  return stageResourceName(
    makeAlchemyStageIdentity({
      appName: config.appName,
      productionStage: "production",
      stage: config.stage,
    }),
    suffix
  );
}

export function makeAlchemyStageIdentity(
  input: AlchemyStageIdentityInput
): AlchemyStageIdentity {
  const appName = input.appName ?? "ceird";
  const stage = input.stage.trim();
  const stageSlug = makeStageSlug(stage);
  const productionStage = input.productionStage ?? "main";

  return {
    appName,
    isProduction: stage === productionStage,
    neonBranchName: stageSlug,
    stage,
    stageSlug,
  };
}

export function stageResourceName(
  identity: AlchemyStageIdentity,
  suffix: string
) {
  return [identity.appName, identity.stageSlug, makeStageSlug(suffix)].join(
    "-"
  );
}

function makeStageSlug(value: string) {
  const slug = value
    .trim()
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/^-+|-+$/g, "")
    .replaceAll(/-{2,}/g, "-");
  const base = slug.length > 0 ? slug : "stage";

  if (base.length <= maxStageSlugLength) {
    return base;
  }

  const hash = createHash("sha256").update(value).digest("hex").slice(0, 8);
  const prefix = base
    .slice(0, maxStageSlugLength - hash.length - 1)
    .replaceAll(/-+$/g, "");

  return `${prefix}-${hash}`;
}
