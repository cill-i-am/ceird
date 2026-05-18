import { createFileRoute } from "@tanstack/react-router";
import { env as cloudflareEnv } from "cloudflare:workers";

interface AppHealthRuntimeEnv {
  readonly ALCHEMY_STACK_NAME?: string | undefined;
  readonly ALCHEMY_STAGE?: string | undefined;
}

interface AppHealthPayloadInput {
  readonly stackName: string;
  readonly stage: string;
}

function readProcessRuntimeIdentity(name: string) {
  return (
    globalThis as unknown as {
      readonly process?: {
        readonly env?: Record<string, string | undefined>;
      };
    }
  ).process?.env?.[name];
}

function runtimeIdentity(value: string) {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : "local";
}

function readRuntimeIdentity(
  value: string | undefined,
  processEnvName: string
) {
  return runtimeIdentity(
    value ?? readProcessRuntimeIdentity(processEnvName) ?? ""
  );
}

export function makeAppHealthPayload(input: AppHealthPayloadInput) {
  return {
    ok: true,
    service: "app",
    stackName: runtimeIdentity(input.stackName),
    stage: runtimeIdentity(input.stage),
  } as const;
}

export function getAppHealthResponse(
  runtimeEnv: AppHealthRuntimeEnv = cloudflareEnv
) {
  const payload = makeAppHealthPayload({
    stackName: readRuntimeIdentity(
      runtimeEnv.ALCHEMY_STACK_NAME,
      "ALCHEMY_STACK_NAME"
    ),
    stage: readRuntimeIdentity(runtimeEnv.ALCHEMY_STAGE, "ALCHEMY_STAGE"),
  });

  return Response.json(payload);
}

export const Route = createFileRoute("/health")({
  server: {
    handlers: {
      GET: () => getAppHealthResponse(),
    },
  },
});
