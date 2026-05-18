import { Schema } from "effect";

export const HealthPayload = Schema.Struct({
  ok: Schema.Literal(true),
  service: Schema.Literal("api"),
  stackName: Schema.String,
  stage: Schema.String,
});
export type HealthPayload = Schema.Schema.Type<typeof HealthPayload>;

export interface HealthPayloadInput {
  readonly stackName: string;
  readonly stage: string;
}

function runtimeIdentity(value: string) {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : "local";
}

export function makeHealthPayload(input: HealthPayloadInput): HealthPayload {
  return {
    ok: true,
    service: "api",
    stackName: runtimeIdentity(input.stackName),
    stage: runtimeIdentity(input.stage),
  };
}
