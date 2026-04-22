import { useForm } from "@tanstack/react-form";
import { Link } from "@tanstack/react-router";
import { Schema } from "effect";
import { useState } from "react";

import { Alert, AlertDescription } from "#/components/ui/alert";
import { Button, buttonVariants } from "#/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "#/components/ui/empty";
import { FieldError, FieldGroup } from "#/components/ui/field";
import { Input } from "#/components/ui/input";
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
import {
  DEFAULT_AUTH_HIGHLIGHTS,
  EntryHighlightGrid,
  EntryShell,
  EntrySurfaceCard,
  INVITATION_AUTH_HIGHLIGHTS,
} from "./entry-shell";

const successCopy =
  "If an account exists for that email, a reset link will be sent.";

export function PasswordResetRequestPage({
  search,
}: {
  readonly search?: InvitationContinuationSearch;
}) {
  const [isSubmitted, setIsSubmitted] = useState(false);
  const loginNavigationTarget: LoginNavigationTarget = getLoginNavigationTarget(
    search?.invitation
  );
  const isInvitationFlow = Boolean(search?.invitation);
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
      title={
        isInvitationFlow
          ? "Get back into the invited account without losing the setup."
          : "Reset access and get back to work."
      }
      description={
        isInvitationFlow
          ? "Request a fresh reset link for the invited account, then continue through the invitation flow."
          : "Send a reset link, choose a new password, and get back into the workspace quickly."
      }
      supportingContent={
        <EntryHighlightGrid
          items={
            isInvitationFlow
              ? INVITATION_AUTH_HIGHLIGHTS
              : DEFAULT_AUTH_HIGHLIGHTS
          }
        />
      }
    >
      <EntrySurfaceCard
        badge={isSubmitted ? "Check your email" : "Reset access"}
        title="Forgot password?"
        description={
          isSubmitted
            ? "Check your email for the next step."
            : "Enter your email and we'll send you a reset link."
        }
        footer={
          <Link
            {...loginNavigationTarget}
            className={buttonVariants({
              variant: "link",
              className: "h-auto justify-start p-0",
            })}
          >
            Back to login
          </Link>
        }
      >
        {isInvitationFlow && !isSubmitted ? (
          <Alert className="bg-muted/40">
            <AlertDescription>
              Use the email address tied to the invitation so you can continue
              the handoff once the reset is complete.
            </AlertDescription>
          </Alert>
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

            <form.Subscribe selector={(state) => state.isSubmitting}>
              {(isSubmitting) => (
                <Button
                  type="submit"
                  size="lg"
                  className="w-full"
                  disabled={isSubmitting}
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
