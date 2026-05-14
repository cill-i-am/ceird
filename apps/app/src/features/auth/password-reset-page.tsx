import { useForm } from "@tanstack/react-form";
import { Link, useNavigate } from "@tanstack/react-router";
import { Schema } from "effect";

import { Button, buttonVariants } from "#/components/ui/button";
import { FieldError, FieldGroup } from "#/components/ui/field";
import { useIsHydrated } from "#/hooks/use-is-hydrated";
import { authClient } from "#/lib/auth-client";
import { submitClientForm } from "#/lib/client-form-submit";
import { beginMutationFeedback } from "#/lib/mutation-feedback";

import {
  getErrorText,
  getFormErrorText,
  getPasswordResetFailureMessage,
  isInvalidPasswordResetTokenError,
} from "./auth-form-errors";
import { AuthFormField } from "./auth-form-field";
import { authQuietLinkClassName } from "./auth-link-styles";
import {
  getForgotPasswordNavigationTarget,
  getLoginNavigationTarget,
} from "./auth-navigation";
import { AuthPasswordInput } from "./auth-password-input";
import { decodePasswordResetInput, passwordResetSchema } from "./auth-schemas";
import { EntryShell, EntrySurfaceCard } from "./entry-shell";
import { decodePasswordResetSearch } from "./password-reset-search";
import type { PasswordResetSearch } from "./password-reset-search";

interface PasswordResetPageProps {
  readonly search?: PasswordResetSearch;
}

export function PasswordResetPage({ search }: PasswordResetPageProps) {
  const navigate = useNavigate({ from: "/reset-password" });
  const isHydrated = useIsHydrated();
  const normalizedSearch: PasswordResetSearch = decodePasswordResetSearch(
    search ?? {}
  );
  const { invitation, token } = normalizedSearch;

  const form = useForm({
    defaultValues: {
      password: "",
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
      const mutationFeedback = beginMutationFeedback();
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

      await mutationFeedback.waitForSuccess();
      await navigate(getLoginNavigationTarget(invitation));
    },
  });

  if (!token) {
    return (
      <EntryShell atmosphere="quiet">
        <EntrySurfaceCard
          className="max-w-xl"
          title="Reset link expired"
          titleLevel={1}
          description="This password reset link is invalid or has expired."
          footer={
            <div className="flex flex-col gap-3">
              <Link
                {...getForgotPasswordNavigationTarget(invitation)}
                className={buttonVariants({
                  className: "w-full [view-transition-name:auth-card-action]",
                })}
              >
                Request a new reset link
              </Link>
              <Link
                {...getLoginNavigationTarget(invitation)}
                className={buttonVariants({
                  variant: "outline",
                  className: "w-full",
                })}
              >
                Back to login
              </Link>
            </div>
          }
        />
      </EntryShell>
    );
  }

  return (
    <EntryShell atmosphere="quiet">
      <EntrySurfaceCard
        className="max-w-xl"
        title="Reset password"
        titleLevel={1}
        description="Choose a new password, then sign in again."
        footer={
          <div className="flex flex-col items-start gap-2 text-sm/6 text-muted-foreground">
            <p>
              <Link
                {...getLoginNavigationTarget(invitation)}
                className={authQuietLinkClassName}
              >
                Back to login
              </Link>
            </p>
          </div>
        }
      >
        <form
          className="flex flex-col gap-6"
          method="post"
          noValidate
          onSubmit={(event) => submitClientForm(event, form.handleSubmit)}
        >
          <FieldGroup>
            <form.Field name="password">
              {(field) => {
                const errorText = getErrorText(field.state.meta.errors);

                return (
                  <AuthFormField
                    label="New password"
                    htmlFor="password"
                    errorText={errorText}
                  >
                    <AuthPasswordInput
                      id="password"
                      name={field.name}
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
                className="w-full [view-transition-name:auth-card-action]"
                loading={isSubmitting}
                disabled={!isHydrated}
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
