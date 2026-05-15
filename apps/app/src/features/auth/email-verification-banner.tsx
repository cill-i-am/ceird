"use client";
import { Alert01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useState } from "react";

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

import { getEmailVerificationFailureMessage } from "./auth-form-errors";

export interface EmailVerificationBannerProps {
  email: string;
  emailVerified: boolean;
}

export function EmailVerificationBanner({
  email,
  emailVerified,
}: EmailVerificationBannerProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successText, setSuccessText] = useState<string>();
  const [errorText, setErrorText] = useState<string>();

  if (emailVerified) {
    return null;
  }

  async function handleResendVerificationEmail() {
    setIsSubmitting(true);
    setSuccessText(undefined);
    setErrorText(undefined);

    try {
      const mutationFeedback = beginMutationFeedback();
      const result = await authClient.sendVerificationEmail({
        email,
        callbackURL: buildEmailVerificationRedirectTo(window.location.origin),
      });

      if (result.error) {
        setErrorText(getEmailVerificationFailureMessage(result.error));
        return;
      }

      await mutationFeedback.waitForSuccess();
      setSuccessText("Another verification email has been requested.");
    } catch (error) {
      setErrorText(getEmailVerificationFailureMessage(error));
    } finally {
      setIsSubmitting(false);
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
        {successText ? (
          <p
            className="[overflow-wrap:anywhere] text-muted-foreground"
            role="status"
          >
            {successText}
          </p>
        ) : null}
        {errorText ? (
          <p
            className="[overflow-wrap:anywhere] text-destructive"
            role="status"
          >
            {errorText}
          </p>
        ) : null}
        <Button
          className="w-full sm:w-auto"
          type="button"
          size="sm"
          variant="secondary"
          loading={isSubmitting}
          onClick={() => void handleResendVerificationEmail()}
        >
          {isSubmitting ? "Sending..." : "Resend verification email"}
        </Button>
      </AlertAction>
    </Alert>
  );
}
