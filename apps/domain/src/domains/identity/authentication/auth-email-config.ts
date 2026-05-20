import { Layer, Context, Config, Effect, Schema } from "effect";

import { AuthEmailConfigurationError } from "./auth-email-errors.js";

const EMAIL_ADDRESS_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isValidEmailAddress(value: string) {
  return EMAIL_ADDRESS_PATTERN.test(value);
}

export interface AuthEmailConfig {
  readonly appOrigin: string;
  readonly from: string;
  readonly fromName: string;
}

const baseAuthEmailConfig = Config.all({
  appOrigin: Config.schema(
    Schema.String.pipe(
      Schema.refine(
        (value): value is string => {
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
        {
          message: "AUTH_APP_ORIGIN must be a valid absolute URL origin",
        }
      )
    ),
    "AUTH_APP_ORIGIN"
  ),
  from: Config.schema(
    Schema.String.pipe(
      Schema.refine((value): value is string => isValidEmailAddress(value), {
        message: "AUTH_EMAIL_FROM must be a valid email address",
      })
    ),
    "AUTH_EMAIL_FROM"
  ),
  fromName: Config.string("AUTH_EMAIL_FROM_NAME").pipe(
    Config.withDefault("Ceird")
  ),
});

function mapAuthEmailConfigError<A, E, R>(effect: Effect.Effect<A, E, R>) {
  return effect.pipe(
    Effect.mapError(
      (cause) =>
        new AuthEmailConfigurationError({
          message: "Invalid auth email configuration",
          cause: String(cause),
        })
    )
  );
}

export const loadAuthEmailConfig = mapAuthEmailConfigError(baseAuthEmailConfig);

export class AuthEmailConfigService extends Context.Service<AuthEmailConfigService>()(
  "@ceird/domains/identity/authentication/AuthEmailConfigService",
  {
    make: loadAuthEmailConfig,
  }
) {
  static readonly DefaultWithoutDependencies = Layer.effect(
    AuthEmailConfigService,
    AuthEmailConfigService.make
  );
  static readonly Default = AuthEmailConfigService.DefaultWithoutDependencies;
}
