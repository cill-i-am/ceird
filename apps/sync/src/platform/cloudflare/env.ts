/// <reference types="@cloudflare/workers-types" />

import type { DomainServiceBinding } from "@ceird/domain-core";
import { Schema } from "effect";

export interface SyncWorkerBindingRuntimeEnv {
  readonly ANALYTICS?: AnalyticsEngineDataset | undefined;
  readonly DOMAIN: DomainServiceBinding;
  readonly ElectricSql: DurableObjectNamespace;
}

export interface SyncWorkerConfigEnv {
  readonly ALCHEMY_STACK_NAME?: string;
  readonly ALCHEMY_STAGE?: string;
  readonly AUTH_APP_ORIGIN: string;
  readonly AUTH_TRUSTED_ORIGINS?: string;
  readonly CEIRD_WORKER_ANALYTICS_SAMPLE_RATE?: string;
  readonly ELECTRIC_CONTAINER_AWS_ACCESS_KEY_ID?: string;
  readonly ELECTRIC_CONTAINER_AWS_SECRET_ACCESS_KEY?: string;
  readonly ELECTRIC_CONTAINER_DATABASE_URL?: string;
  readonly ELECTRIC_CONTAINER_ELECTRIC_SECRET?: string;
  readonly ELECTRIC_CONTAINER_R2_ACCOUNT_ID?: string;
  readonly ELECTRIC_CONTAINER_R2_BUCKET_NAME?: string;
  readonly ELECTRIC_SQL_LOCATION_HINT?: DurableObjectLocationHint;
  readonly ELECTRIC_SOURCE_SECRET: string;
  readonly NODE_ENV?: string;
}

export type SyncWorkerEnv = SyncWorkerBindingRuntimeEnv & SyncWorkerConfigEnv;

export const SyncWorkerConfigEnvSchema = Schema.Struct({
  ALCHEMY_STACK_NAME: Schema.optional(Schema.NonEmptyString),
  ALCHEMY_STAGE: Schema.optional(Schema.NonEmptyString),
  AUTH_APP_ORIGIN: Schema.NonEmptyString,
  AUTH_TRUSTED_ORIGINS: Schema.optional(Schema.String),
  CEIRD_WORKER_ANALYTICS_SAMPLE_RATE: Schema.optional(Schema.String),
  ELECTRIC_CONTAINER_AWS_ACCESS_KEY_ID: Schema.optional(Schema.NonEmptyString),
  ELECTRIC_CONTAINER_AWS_SECRET_ACCESS_KEY: Schema.optional(
    Schema.NonEmptyString
  ),
  ELECTRIC_CONTAINER_DATABASE_URL: Schema.optional(Schema.NonEmptyString),
  ELECTRIC_CONTAINER_ELECTRIC_SECRET: Schema.optional(Schema.NonEmptyString),
  ELECTRIC_CONTAINER_R2_ACCOUNT_ID: Schema.optional(Schema.NonEmptyString),
  ELECTRIC_CONTAINER_R2_BUCKET_NAME: Schema.optional(Schema.NonEmptyString),
  ELECTRIC_SQL_LOCATION_HINT: Schema.optional(
    Schema.Literals([
      "wnam",
      "enam",
      "sam",
      "weur",
      "eeur",
      "apac",
      "oc",
      "afr",
      "me",
    ] as const)
  ),
  ELECTRIC_SOURCE_SECRET: Schema.NonEmptyString,
  NODE_ENV: Schema.optional(Schema.String),
});
export type SyncWorkerConfig = Schema.Schema.Type<
  typeof SyncWorkerConfigEnvSchema
>;

export function decodeSyncWorkerConfigEnv(env: SyncWorkerConfigEnv) {
  return Schema.decodeUnknownEffect(SyncWorkerConfigEnvSchema)(env);
}

export function syncWorkerEnvConfigMap(env: SyncWorkerEnv) {
  return new Map(
    Object.entries({
      ALCHEMY_STACK_NAME: env.ALCHEMY_STACK_NAME,
      ALCHEMY_STAGE: env.ALCHEMY_STAGE,
      AUTH_APP_ORIGIN: env.AUTH_APP_ORIGIN,
      AUTH_TRUSTED_ORIGINS: env.AUTH_TRUSTED_ORIGINS,
      CEIRD_WORKER_ANALYTICS_SAMPLE_RATE:
        env.CEIRD_WORKER_ANALYTICS_SAMPLE_RATE,
      ELECTRIC_CONTAINER_AWS_ACCESS_KEY_ID:
        env.ELECTRIC_CONTAINER_AWS_ACCESS_KEY_ID,
      ELECTRIC_CONTAINER_AWS_SECRET_ACCESS_KEY:
        env.ELECTRIC_CONTAINER_AWS_SECRET_ACCESS_KEY,
      ELECTRIC_CONTAINER_DATABASE_URL: env.ELECTRIC_CONTAINER_DATABASE_URL,
      ELECTRIC_CONTAINER_ELECTRIC_SECRET:
        env.ELECTRIC_CONTAINER_ELECTRIC_SECRET,
      ELECTRIC_CONTAINER_R2_ACCOUNT_ID: env.ELECTRIC_CONTAINER_R2_ACCOUNT_ID,
      ELECTRIC_CONTAINER_R2_BUCKET_NAME: env.ELECTRIC_CONTAINER_R2_BUCKET_NAME,
      ELECTRIC_SQL_LOCATION_HINT: env.ELECTRIC_SQL_LOCATION_HINT,
      ELECTRIC_SOURCE_SECRET: env.ELECTRIC_SOURCE_SECRET,
      NODE_ENV: env.NODE_ENV,
    }).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string"
    )
  );
}
