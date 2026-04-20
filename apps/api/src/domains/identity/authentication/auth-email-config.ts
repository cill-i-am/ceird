import { Config, Effect } from "effect";

import { AuthEmailConfigurationError } from "./auth-email-errors.js";

const EMAIL_ADDRESS_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isValidEmailAddress(value: string) {
  return EMAIL_ADDRESS_PATTERN.test(value);
}

export interface AuthEmailConfig {
  readonly appOrigin: string;
  readonly from: string;
  readonly fromName: string;
  readonly resendApiKey: string;
}

export const loadAuthEmailConfig = Config.all({
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
  resendApiKey: Config.string("RESEND_API_KEY").pipe(
    Config.validate({
      message: "RESEND_API_KEY must not be empty",
      validation: (value) => value.trim().length > 0,
    })
  ),
}).pipe(
  Effect.mapError(
    (cause) =>
      new AuthEmailConfigurationError({
        message: "Invalid auth email configuration",
        cause: cause.toString(),
      })
  )
);
