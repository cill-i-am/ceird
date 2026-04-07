"use client";

import { useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "#/components/ui/alert";
import { Button } from "#/components/ui/button";
import {
  authClient,
  buildEmailVerificationRedirectTo,
} from "#/lib/auth-client";

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
      const result = await authClient.sendVerificationEmail({
        email,
        callbackURL: buildEmailVerificationRedirectTo(window.location.origin),
      });

      if (result.error) {
        setErrorText(getEmailVerificationFailureMessage(result.error));
        return;
      }

      setSuccessText("A new verification email is on the way.");
    } catch (error) {
      setErrorText(getEmailVerificationFailureMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Alert className="mx-4 mt-4">
      <AlertTitle>Verify your email</AlertTitle>
      <AlertDescription className="flex flex-col gap-4">
        <p>
          {email} is not verified yet. Check your inbox for the verification
          link, or request another email.
        </p>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Button
            type="button"
            disabled={isSubmitting}
            onClick={() => void handleResendVerificationEmail()}
          >
            {isSubmitting
              ? "Sending verification email..."
              : "Resend verification email"}
          </Button>
          {successText ? (
            <p className="text-sm text-muted-foreground" role="status">
              {successText}
            </p>
          ) : null}
          {errorText ? (
            <p className="text-sm text-destructive" role="status">
              {errorText}
            </p>
          ) : null}
        </div>
      </AlertDescription>
    </Alert>
  );
}
