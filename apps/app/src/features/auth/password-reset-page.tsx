import { useForm } from "@tanstack/react-form";
import { Link, useNavigate } from "@tanstack/react-router";
import { Schema } from "effect";

import { Button, buttonVariants } from "#/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "#/components/ui/empty";
import { FieldError, FieldGroup } from "#/components/ui/field";
import { Input } from "#/components/ui/input";
import { authClient } from "#/lib/auth-client";

import {
  getErrorText,
  getFormErrorText,
  getPasswordResetFailureMessage,
  isInvalidPasswordResetTokenError,
} from "./auth-form-errors";
import { AuthFormField } from "./auth-form-field";
import {
  getForgotPasswordNavigationTarget,
  getLoginNavigationTarget,
} from "./auth-navigation";
import { decodePasswordResetInput, passwordResetSchema } from "./auth-schemas";
import {
  DEFAULT_AUTH_HIGHLIGHTS,
  EntryHighlightGrid,
  EntryShell,
  EntrySurfaceCard,
  INVITATION_AUTH_HIGHLIGHTS,
} from "./entry-shell";
import { decodePasswordResetSearch } from "./password-reset-search";
import type { PasswordResetSearch } from "./password-reset-search";

interface PasswordResetPageProps {
  readonly search?: PasswordResetSearch;
}

export function PasswordResetPage({ search }: PasswordResetPageProps) {
  const navigate = useNavigate();
  const normalizedSearch: PasswordResetSearch = decodePasswordResetSearch(
    search ?? {}
  );
  const { invitation, token } = normalizedSearch;
  const isInvitationFlow = Boolean(invitation);

  const form = useForm({
    defaultValues: {
      password: "",
      confirmPassword: "",
    },
    validators: {
      onSubmit: Schema.standardSchemaV1(passwordResetSchema),
    },
    onSubmit: async ({ formApi, value }) => {
      if (!token) {
        return;
      }

      formApi.setErrorMap({
        onSubmit: undefined,
      });

      const input = decodePasswordResetInput(value);
      const result = await authClient.resetPassword({
        token,
        newPassword: input.password,
      });

      if (result.error) {
        if (isInvalidPasswordResetTokenError(result.error)) {
          await navigate({
            to: "/reset-password",
            search: {
              error: "INVALID_TOKEN",
              invitation,
              token: undefined,
            },
          });
          return;
        }

        formApi.setErrorMap({
          onSubmit: {
            form: getPasswordResetFailureMessage(result.error),
            fields: {},
          },
        });

        return;
      }

      await navigate(getLoginNavigationTarget(invitation));
    },
  });

  if (!token) {
    return (
      <EntryShell
        badge={isInvitationFlow ? "Invitation support" : "Password reset"}
        title="This reset link has expired or is no longer valid."
        description="Request a fresh link, then continue back into the workspace with a new password."
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
          badge="Link expired"
          title="Reset password"
          description="This password reset link is invalid or has expired."
          footer={
            <>
              <Link
                {...getForgotPasswordNavigationTarget(invitation)}
                className={buttonVariants({
                  variant: "link",
                  className: "h-auto justify-start p-0",
                })}
              >
                Request a new reset link
              </Link>
              <Link
                {...getLoginNavigationTarget(invitation)}
                className={buttonVariants({
                  variant: "link",
                  className: "h-auto justify-start p-0",
                })}
              >
                Back to login
              </Link>
            </>
          }
        >
          <Empty className="min-h-0 bg-muted/20 px-6 py-8">
            <EmptyHeader>
              <EmptyTitle>Start again with a fresh link</EmptyTitle>
              <EmptyDescription>
                Request a new reset link to continue, or return to login.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        </EntrySurfaceCard>
      </EntryShell>
    );
  }

  return (
    <EntryShell
      badge={isInvitationFlow ? "Invitation support" : "Password reset"}
      title="Choose a new password and get back into the workspace."
      description="Once you save a new password, you can continue into the app or finish the invitation flow."
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
        badge="Choose a new password"
        title="Reset password"
        description="Choose a new password to finish signing in."
      >
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
            <form.Field name="password">
              {(field) => {
                const errorText = getErrorText(field.state.meta.errors);

                return (
                  <AuthFormField
                    label="New password"
                    htmlFor="password"
                    invalid={Boolean(errorText)}
                    descriptionText="Use 8 or more characters."
                    errorText={errorText}
                  >
                    <Input
                      id="password"
                      name={field.name}
                      type="password"
                      autoComplete="new-password"
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

            <form.Field name="confirmPassword">
              {(field) => {
                const errorText = getErrorText(field.state.meta.errors);

                return (
                  <AuthFormField
                    label="Confirm password"
                    htmlFor="confirmPassword"
                    invalid={Boolean(errorText)}
                    errorText={errorText}
                  >
                    <Input
                      id="confirmPassword"
                      name={field.name}
                      type="password"
                      autoComplete="new-password"
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
                {isSubmitting ? "Resetting password..." : "Reset password"}
              </Button>
            )}
          </form.Subscribe>
        </form>
      </EntrySurfaceCard>
    </EntryShell>
  );
}
