"use client";
import { Alert01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useReducer } from "react";

import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from "#/components/ui/alert";
import { Button } from "#/components/ui/button";
import {
  authClient,
  buildEmailVerificationRedirectTo,
} from "#/lib/auth-client";
import { beginMutationFeedback } from "#/lib/mutation-feedback";

import {
  AuthCaptchaChallenge,
  isAuthCaptchaChallengeRequired,
  makeAuthCaptchaFetchOptions,
} from "./auth-captcha";
import { getEmailVerificationFailureMessage } from "./auth-form-errors";

export interface EmailVerificationBannerProps {
  email: string;
  emailVerified: boolean;
}

interface EmailVerificationBannerState {
  readonly captchaResetKey: number;
  readonly captchaToken?: string | undefined;
  readonly errorText?: string | undefined;
  readonly isSubmitting: boolean;
  readonly successText?: string | undefined;
}
type EmailVerificationBannerAction =
  | {
      readonly token?: string | undefined;
      readonly type: "captcha-token-changed";
    }
  | {
      readonly type: "submit-started";
    }
  | {
      readonly message: string;
      readonly type: "submit-failed";
    }
  | {
      readonly type: "submit-succeeded";
    }
  | {
      readonly message: string;
      readonly type: "submit-threw";
    };

export function EmailVerificationBanner({
  email,
  emailVerified,
}: EmailVerificationBannerProps) {
  const [state, dispatch] = useReducer(emailVerificationBannerReducer, {
    captchaResetKey: 0,
    isSubmitting: false,
  });

  if (emailVerified) {
    return null;
  }

  async function handleResendVerificationEmail() {
    dispatch({ type: "submit-started" });

    try {
      const mutationFeedback = beginMutationFeedback();
      const payload = {
        email,
        callbackURL: buildEmailVerificationRedirectTo(window.location.origin),
        ...makeAuthCaptchaFetchOptions(state.captchaToken),
      };
      const result = await authClient.sendVerificationEmail(payload);

      if (result.error) {
        dispatch({
          message: getEmailVerificationFailureMessage(result.error),
          type: "submit-failed",
        });
        return;
      }

      await mutationFeedback.waitForSuccess();
      dispatch({ type: "submit-succeeded" });
    } catch (error) {
      dispatch({
        message: getEmailVerificationFailureMessage(error),
        type: "submit-threw",
      });
    }
  }

  return (
    <Alert
      variant="warning"
      className="mx-3 mt-3 min-h-16 w-auto min-w-0 overflow-hidden pr-4 has-data-[slot=alert-action]:!pr-4 sm:mx-4 sm:mt-4 lg:mx-5"
      aria-label="Email verification reminder"
    >
      <HugeiconsIcon icon={Alert01Icon} strokeWidth={2} />
      <AlertTitle>Verify your email</AlertTitle>
      <AlertDescription>
        <p className="[overflow-wrap:anywhere]">{email} is not verified yet.</p>
      </AlertDescription>
      <AlertAction className="static col-span-full mt-3 flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
        <AuthCaptchaChallenge
          action="verification-resend"
          resetKey={state.captchaResetKey}
          onTokenChange={(token) =>
            dispatch({ token, type: "captcha-token-changed" })
          }
        />
        {state.successText ? (
          <output
            aria-live="polite"
            className="[overflow-wrap:anywhere] text-muted-foreground"
          >
            {state.successText}
          </output>
        ) : null}
        {state.errorText ? (
          <output
            aria-live="polite"
            className="[overflow-wrap:anywhere] text-destructive"
          >
            {state.errorText}
          </output>
        ) : null}
        <Button
          className="w-full sm:w-auto"
          type="button"
          size="sm"
          variant="secondary"
          loading={state.isSubmitting}
          disabled={isAuthCaptchaChallengeRequired() && !state.captchaToken}
          onClick={() => void handleResendVerificationEmail()}
        >
          {state.isSubmitting ? "Sending..." : "Resend verification email"}
        </Button>
      </AlertAction>
    </Alert>
  );
}

function emailVerificationBannerReducer(
  state: EmailVerificationBannerState,
  action: EmailVerificationBannerAction
): EmailVerificationBannerState {
  switch (action.type) {
    case "captcha-token-changed": {
      return { ...state, captchaToken: action.token };
    }
    case "submit-started": {
      return {
        ...state,
        errorText: undefined,
        isSubmitting: true,
        successText: undefined,
      };
    }
    case "submit-failed":
    case "submit-threw": {
      return {
        ...state,
        captchaResetKey: state.captchaResetKey + 1,
        errorText: action.message,
        isSubmitting: false,
      };
    }
    case "submit-succeeded": {
      return {
        ...state,
        captchaResetKey: state.captchaResetKey + 1,
        captchaToken: undefined,
        isSubmitting: false,
        successText: "Another verification email has been requested.",
      };
    }
    default: {
      return assertNeverEmailVerificationBannerAction(action);
    }
  }
}

function assertNeverEmailVerificationBannerAction(action: never): never {
  throw new Error(
    `Unhandled email verification banner action: ${JSON.stringify(action)}`
  );
}
