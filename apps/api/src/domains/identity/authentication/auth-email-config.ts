import { Config, Effect } from "effect";

import { AuthEmailConfigurationError } from "./auth-email-errors.js";

const EMAIL_ADDRESS_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const AUTH_EMAIL_TRANSPORT_MODES = [
  "cloudflare-api",
  "cloudflare-binding",
  "noop",
] as const;

export type AuthEmailTransportMode =
  (typeof AUTH_EMAIL_TRANSPORT_MODES)[number];

function isValidEmailAddress(value: string) {
  return EMAIL_ADDRESS_PATTERN.test(value);
}

export interface AuthEmailConfig {
  readonly transportMode: AuthEmailTransportMode;
  readonly cloudflareAccountId: string;
  readonly cloudflareApiToken: string;
  readonly appOrigin: string;
  readonly from: string;
  readonly fromName: string;
}

const baseAuthEmailConfig = Config.all({
  transportMode: Config.string("AUTH_EMAIL_TRANSPORT").pipe(
    Config.withDefault("noop"),
    Config.validate({
      message: `AUTH_EMAIL_TRANSPORT must be one of ${AUTH_EMAIL_TRANSPORT_MODES.join(", ")}`,
      validation: (value): value is AuthEmailTransportMode =>
        AUTH_EMAIL_TRANSPORT_MODES.includes(value as AuthEmailTransportMode),
    })
  ),
  appOrigin: Config.string("AUTH_APP_ORIGIN").pipe(
    Config.validate({
      message: "AUTH_APP_ORIGIN must be a valid absolute URL origin",
      validation: (value) => {
        try {
          const url = new URL(value);
          return (
            (url.protocol === "http:" || url.protocol === "https:") &&
            url.username.length === 0 &&
            url.password.length === 0 &&
            url.pathname === "/"
          );
        } catch {
          return false;
        }
      },
    })
  ),
  from: Config.string("AUTH_EMAIL_FROM").pipe(
    Config.validate({
      message: "AUTH_EMAIL_FROM must be a valid email address",
      validation: isValidEmailAddress,
    })
  ),
  fromName: Config.string("AUTH_EMAIL_FROM_NAME").pipe(
    Config.withDefault("Task Tracker")
  ),
});

const cloudflareAuthEmailConfig = Config.all({
  cloudflareAccountId: Config.string("CLOUDFLARE_ACCOUNT_ID").pipe(
    Config.validate({
      message: "CLOUDFLARE_ACCOUNT_ID must not be empty",
      validation: (value) => value.trim().length > 0,
    })
  ),
  cloudflareApiToken: Config.string("CLOUDFLARE_API_TOKEN").pipe(
    Config.validate({
      message: "CLOUDFLARE_API_TOKEN must not be empty",
      validation: (value) => value.trim().length > 0,
    })
  ),
});

const AuthEmailConfigConfig = Effect.gen(
  function* AuthEmailConfigConfigEffect() {
    const config = yield* baseAuthEmailConfig;

    if (
      config.transportMode === "noop" ||
      config.transportMode === "cloudflare-binding"
    ) {
      return {
        ...config,
        cloudflareAccountId: "",
        cloudflareApiToken: "",
      } satisfies AuthEmailConfig;
    }

    const cloudflareConfig = yield* cloudflareAuthEmailConfig;

    return {
      ...config,
      ...cloudflareConfig,
    } satisfies AuthEmailConfig;
  }
).pipe(
  Effect.mapError(
    (cause) =>
      new AuthEmailConfigurationError({
        message: "Invalid auth email configuration",
        cause: cause.toString(),
      })
  )
);

export class AuthEmailConfigService extends Effect.Service<AuthEmailConfigService>()(
  "@task-tracker/domains/identity/authentication/AuthEmailConfigService",
  {
    effect: AuthEmailConfigConfig,
  }
) {}

export const loadAuthEmailConfig = AuthEmailConfigConfig;
