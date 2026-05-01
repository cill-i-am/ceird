import type { AuthEmailQueueMessage } from "../../domains/identity/authentication/auth-email-queue.js";

export interface ApiWorkerEnv {
  readonly AUTH_APP_ORIGIN: string;
  readonly AUTH_EMAIL_FROM: string;
  readonly AUTH_EMAIL_FROM_NAME?: string;
  readonly AUTH_EMAIL_QUEUE: Queue<AuthEmailQueueMessage>;
  readonly AUTH_EMAIL_TRANSPORT?: string;
  readonly BETTER_AUTH_BASE_URL: string;
  readonly BETTER_AUTH_SECRET: string;
  readonly CLOUDFLARE_ACCOUNT_ID?: string;
  readonly CLOUDFLARE_API_TOKEN?: string;
  readonly DATABASE: Hyperdrive;
  readonly NODE_ENV?: string;
}

export function apiWorkerEnvConfigMap(env: ApiWorkerEnv) {
  return new Map(
    Object.entries({
      AUTH_APP_ORIGIN: env.AUTH_APP_ORIGIN,
      AUTH_EMAIL_FROM: env.AUTH_EMAIL_FROM,
      AUTH_EMAIL_FROM_NAME: env.AUTH_EMAIL_FROM_NAME,
      AUTH_EMAIL_TRANSPORT: env.AUTH_EMAIL_TRANSPORT,
      BETTER_AUTH_BASE_URL: env.BETTER_AUTH_BASE_URL,
      BETTER_AUTH_SECRET: env.BETTER_AUTH_SECRET,
      CLOUDFLARE_ACCOUNT_ID: env.CLOUDFLARE_ACCOUNT_ID,
      CLOUDFLARE_API_TOKEN: env.CLOUDFLARE_API_TOKEN,
      NODE_ENV: env.NODE_ENV,
    }).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string"
    )
  );
}
