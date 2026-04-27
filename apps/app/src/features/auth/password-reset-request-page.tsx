import { useForm } from "@tanstack/react-form";
import { Link } from "@tanstack/react-router";
import { Schema } from "effect";
import { useState } from "react";

import { Button, buttonVariants } from "#/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "#/components/ui/empty";
import { FieldError, FieldGroup } from "#/components/ui/field";
import { Input } from "#/components/ui/input";
import { useIsHydrated } from "#/hooks/use-is-hydrated";
import { authClient, buildPasswordResetRedirectTo } from "#/lib/auth-client";

import type { InvitationContinuationSearch } from "../organizations/invitation-continuation";
import {
  getErrorText,
  getFormErrorText,
  getPasswordResetRequestFailureMessage,
} from "./auth-form-errors";
import { AuthFormField } from "./auth-form-field";
import { getLoginNavigationTarget } from "./auth-navigation";
import type { LoginNavigationTarget } from "./auth-navigation";
import {
  decodePasswordResetRequestInput,
  passwordResetRequestSchema,
} from "./auth-schemas";
import { EntryShell, EntrySurfaceCard } from "./entry-shell";

const successCopy =
  "If an account exists for that email, a reset link will be sent.";

export function PasswordResetRequestPage({
  search,
}: {
  readonly search?: InvitationContinuationSearch;
}) {
  const [isSubmitted, setIsSubmitted] = useState(false);
  const isHydrated = useIsHydrated();
  const loginNavigationTarget: LoginNavigationTarget = getLoginNavigationTarget(
    search?.invitation
  );
  const isInvitationFlow = Boolean(search?.invitation);
  let shellDescription = "We'll send one reset link.";
  let contextDescription = "Use the email tied to your account.";

  if (isInvitationFlow && isSubmitted) {
    shellDescription = "Open the latest reset email to continue.";
    contextDescription =
      "The newest email will bring you back to the invitation.";
  } else if (isInvitationFlow) {
    shellDescription = "Use the invited account email.";
    contextDescription = "Send the reset link to the invited email address.";
  } else if (isSubmitted) {
    shellDescription = "Open the latest reset email to continue.";
    contextDescription = "Use the newest email in your inbox.";
  }
  const form = useForm({
    defaultValues: {
      email: "",
    },
    validators: {
      onSubmit: Schema.standardSchemaV1(passwordResetRequestSchema),
    },
    onSubmit: async ({ formApi, value }) => {
      formApi.setErrorMap({
        onSubmit: undefined,
      });

      const input = decodePasswordResetRequestInput(value);
      const result = await authClient.requestPasswordReset({
        email: input.email,
        redirectTo: buildPasswordResetRedirectTo(
          window.location.origin,
          search?.invitation
        ),
      });

      if (result.error) {
        formApi.setErrorMap({
          onSubmit: {
            form: getPasswordResetRequestFailureMessage(result.error),
            fields: {},
          },
        });

        return;
      }

      setIsSubmitted(true);
    },
  });

  return (
    <EntryShell
      badge={isInvitationFlow ? "Invitation support" : "Password reset"}
      title={isSubmitted ? "Check your email." : "Reset your password."}
      description={shellDescription}
      supportingContent={
        <div className="flex flex-col gap-3">
          <p className="text-xs font-medium text-muted-foreground uppercase">
            {isSubmitted ? "Next" : "Reset link"}
          </p>
          <p className="max-w-[36ch] text-sm/6 text-muted-foreground">
            {contextDescription}
          </p>
        </div>
      }
    >
      <EntrySurfaceCard
        badge={isSubmitted ? "Email sent" : "Password reset"}
        className="max-w-lg"
        title={isSubmitted ? "Check your email" : "Forgot password?"}
        description={
          isSubmitted
            ? "Use the reset link in your inbox."
            : "Enter your email."
        }
        footer={
          <Link
            {...loginNavigationTarget}
            className={buttonVariants({
              variant: isSubmitted ? "default" : "link",
              className: isSubmitted
                ? "w-full"
                : "h-auto justify-start p-0 text-muted-foreground",
            })}
          >
            Back to login
          </Link>
        }
      >
        {isInvitationFlow && !isSubmitted ? (
          <div className="rounded-2xl border border-border/70 bg-muted/35 px-4 py-3 text-sm/6 text-muted-foreground">
            Send the link to the invited email address.
          </div>
        ) : null}

        {isSubmitted ? (
          <Empty className="min-h-0 bg-muted/20 px-6 py-8">
            <EmptyHeader>
              <EmptyTitle>Reset link sent</EmptyTitle>
              <EmptyDescription>{successCopy}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <form
            className="flex flex-col gap-6"
            method="post"
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              event.stopPropagation();
              void form.handleSubmit();
            }}
          >
            <FieldGroup>
              <form.Field name="email">
                {(field) => {
                  const errorText = getErrorText(field.state.meta.errors);

                  return (
                    <AuthFormField
                      label="Email"
                      htmlFor="email"
                      invalid={Boolean(errorText)}
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

            <form.Subscribe selector={(state) => state.errorMap.onSubmit}>
              {(error) =>
                getFormErrorText(error) ? (
                  <FieldError>{getFormErrorText(error)}</FieldError>
                ) : null
              }
            </form.Subscribe>

            <form.Subscribe
              selector={(state) => ({
                email: state.values.email,
                isSubmitting: state.isSubmitting,
              })}
            >
              {({ email, isSubmitting }) => {
                const isEmailEmpty = email.trim().length === 0;

                return (
                  <Button
                    type="submit"
                    size="lg"
                    className="w-full"
                    loading={isSubmitting}
                    disabled={isEmailEmpty || !isHydrated}
                  >
                    {isSubmitting ? "Sending reset link..." : "Send reset link"}
                  </Button>
                );
              }}
            </form.Subscribe>
          </form>
        )}
      </EntrySurfaceCard>
    </EntryShell>
  );
}
