import { useForm } from "@tanstack/react-form";
import { Link } from "@tanstack/react-router";
import { Schema } from "effect";
import { useState } from "react";

import { Button } from "#/components/ui/button";
import { FieldError, FieldGroup } from "#/components/ui/field";
import { Input } from "#/components/ui/input";
import { useIsHydrated } from "#/hooks/use-is-hydrated";
import { authClient, buildPasswordResetRedirectTo } from "#/lib/auth-client";
import { submitClientForm } from "#/lib/client-form-submit";
import { beginMutationFeedback } from "#/lib/mutation-feedback";

import type { InvitationContinuationSearch } from "../organizations/invitation-continuation";
import {
  AuthCaptchaChallenge,
  isAuthCaptchaChallengeRequired,
  makeAuthCaptchaFetchOptions,
} from "./auth-captcha";
import {
  getErrorText,
  getFormErrorText,
  getPasswordResetRequestFailureMessage,
} from "./auth-form-errors";
import { AuthFormField } from "./auth-form-field";
import { authQuietLinkClassName } from "./auth-link-styles";
import { getLoginNavigationTarget } from "./auth-navigation";
import type { LoginNavigationTarget } from "./auth-navigation";
import {
  decodePasswordResetRequestInput,
  passwordResetRequestSchema,
} from "./auth-schemas";
import { EntryShell, EntrySurfaceCard } from "./entry-shell";

const successCopy =
  "If an account exists for that email, the newest reset link is on its way.";

export function PasswordResetRequestPage({
  search,
}: {
  readonly search?: InvitationContinuationSearch;
}) {
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string>();
  const [captchaResetKey, setCaptchaResetKey] = useState(0);
  const isHydrated = useIsHydrated();
  const loginNavigationTarget: LoginNavigationTarget = getLoginNavigationTarget(
    search?.invitation
  );
  const isInvitationFlow = Boolean(search?.invitation);
  const form = useForm({
    defaultValues: {
      email: "",
    },
    validators: {
      onSubmit: Schema.toStandardSchemaV1(passwordResetRequestSchema),
    },
    onSubmit: async ({ formApi, value }) => {
      formApi.setErrorMap({
        onSubmit: undefined,
      });

      const input = decodePasswordResetRequestInput(value);
      const mutationFeedback = beginMutationFeedback();
      const payload = {
        email: input.email,
        redirectTo: buildPasswordResetRedirectTo(
          window.location.origin,
          search?.invitation
        ),
        ...makeAuthCaptchaFetchOptions(captchaToken),
      };
      const result = await authClient.requestPasswordReset(payload);

      if (result.error) {
        setCaptchaResetKey((currentValue) => currentValue + 1);
        formApi.setErrorMap({
          onSubmit: {
            form: getPasswordResetRequestFailureMessage(result.error),
            fields: {},
          },
        });

        return;
      }

      await mutationFeedback.waitForSuccess();
      setIsSubmitted(true);
    },
  });

  return (
    <EntryShell atmosphere="quiet">
      <EntrySurfaceCard
        className="max-w-xl"
        title={isSubmitted ? "Check your email" : "Reset your password"}
        titleLevel={1}
        description={
          isSubmitted ? successCopy : "Enter the email tied to your account."
        }
        footer={
          <div className="flex flex-col items-start gap-2 text-sm/6 text-muted-foreground">
            <p>
              <Link
                {...loginNavigationTarget}
                className={authQuietLinkClassName}
              >
                Back to login
              </Link>
            </p>
          </div>
        }
      >
        {isInvitationFlow && !isSubmitted ? (
          <div className="rounded-2xl border border-border/70 bg-muted/35 px-4 py-3 text-sm/6 text-muted-foreground">
            Send the link to the invited email so the invitation can continue
            after reset.
          </div>
        ) : null}

        {isSubmitted ? null : (
          <form
            className="flex flex-col gap-6"
            method="post"
            noValidate
            onSubmit={(event) => submitClientForm(event, form.handleSubmit)}
          >
            <FieldGroup>
              <form.Field name="email">
                {(field) => {
                  const errorText = getErrorText(field.state.meta.errors);

                  return (
                    <AuthFormField
                      label="Email"
                      htmlFor="email"
                      errorText={errorText}
                    >
                      <Input
                        id="email"
                        name={field.name}
                        type="email"
                        autoComplete="email"
                        placeholder="m@example.com"
                        value={field.state.value}
                        aria-invalid={Boolean(errorText) || undefined}
                        onBlur={field.handleBlur}
                        onInput={(event) =>
                          field.handleChange(event.currentTarget.value)
                        }
                        onChange={(event) =>
                          field.handleChange(event.target.value)
                        }
                      />
                    </AuthFormField>
                  );
                }}
              </form.Field>
            </FieldGroup>

            <AuthCaptchaChallenge
              action="password-reset-request"
              resetKey={captchaResetKey}
              onTokenChange={setCaptchaToken}
            />

            <form.Subscribe selector={(state) => state.errorMap.onSubmit}>
              {(error) =>
                getFormErrorText(error) ? (
                  <FieldError>{getFormErrorText(error)}</FieldError>
                ) : null
              }
            </form.Subscribe>

            <form.Subscribe
              selector={(state) => ({
                isSubmitting: state.isSubmitting,
              })}
            >
              {({ isSubmitting }) => (
                <Button
                  type="submit"
                  size="lg"
                  className="w-full [view-transition-name:auth-card-action]"
                  loading={isSubmitting}
                  disabled={
                    !isHydrated ||
                    (isAuthCaptchaChallengeRequired() && !captchaToken)
                  }
                >
                  {isSubmitting ? "Sending reset link..." : "Send reset link"}
                </Button>
              )}
            </form.Subscribe>
          </form>
        )}
      </EntrySurfaceCard>
    </EntryShell>
  );
}
