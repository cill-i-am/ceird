import { Schema } from "effect";

export const DOMAIN_WORKER_DATABASE_CONFIGURATION_ERROR_TAG =
  "@ceird/domain/platform/cloudflare/DomainWorkerDatabaseConfigurationError" as const;

export class DomainWorkerDatabaseConfigurationError extends Schema.TaggedErrorClass<DomainWorkerDatabaseConfigurationError>()(
  DOMAIN_WORKER_DATABASE_CONFIGURATION_ERROR_TAG,
  {
    databaseSource: Schema.optional(
      Schema.Union([Schema.Literal("hyperdrive"), Schema.Literal("env")])
    ),
    localDev: Schema.Boolean,
    message: Schema.String,
  }
) {}
