import { Schema } from "effect";

export const ELECTRIC_SQL_CONTAINER_ERROR_TAG =
  "@ceird/sync/ElectricSqlContainerError" as const;

const ElectricSqlContainerFailureTagSchema = Schema.Literals([
  "ForwardingFailed",
  "MonitorFailed",
  "ReadinessFailed",
] as const);

export type ElectricSqlContainerFailureTag = Schema.Schema.Type<
  typeof ElectricSqlContainerFailureTagSchema
>;

export class ElectricSqlContainerError extends Schema.TaggedErrorClass<ElectricSqlContainerError>()(
  ELECTRIC_SQL_CONTAINER_ERROR_TAG,
  {
    failureCause: Schema.String,
    failureTag: ElectricSqlContainerFailureTagSchema,
    message: Schema.String,
  }
) {}
