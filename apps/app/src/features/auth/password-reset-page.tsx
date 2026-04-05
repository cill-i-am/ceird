import { useForm } from "@tanstack/react-form";
import { Link, useNavigate } from "@tanstack/react-router";
import { Schema } from "effect";

import { Button } from "#/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "#/components/ui/card";
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
import { decodePasswordResetInput, passwordResetSchema } from "./auth-schemas";
import { decodePasswordResetSearch } from "./password-reset-search";
import type { PasswordResetSearch } from "./password-reset-search";

interface PasswordResetPageProps {
  search?: {
    token?: string;
    error?: string;
  };
}

export function PasswordResetPage({ search }: PasswordResetPageProps) {
  const navigate = useNavigate();
  const normalizedSearch: PasswordResetSearch = decodePasswordResetSearch(
    search ?? {}
  );
  const { token } = normalizedSearch;

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

      await navigate({ to: "/login" });
    },
  });

  if (!token) {
    return (
      <div className="mx-auto flex min-h-screen w-full max-w-md items-center px-4 py-10">
        <Card className="w-full">
          <CardHeader className="text-center">
            <CardTitle className="text-xl">Reset password</CardTitle>
            <CardDescription>
              This password reset link is invalid or has expired.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4 text-center">
              <p className="text-sm text-muted-foreground">
                Request a new reset link to continue, or return to login.
              </p>
            </div>
          </CardContent>
          <CardFooter className="flex-col items-stretch gap-4">
            <Link
              to="/forgot-password"
              className="text-center text-sm font-medium text-primary underline-offset-4 hover:underline"
            >
              Request a new reset link
            </Link>
            <Link
              to="/login"
              className="text-center text-sm font-medium text-primary underline-offset-4 hover:underline"
            >
              Back to login
            </Link>
          </CardFooter>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md items-center px-4 py-10">
      <Card className="w-full">
        <CardHeader className="text-center">
          <CardTitle className="text-xl">Reset password</CardTitle>
          <CardDescription>
            Choose a new password to finish signing in.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="space-y-6"
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

            <CardFooter className="flex-col items-stretch gap-4 px-0">
              <form.Subscribe selector={(state) => state.errorMap.onSubmit}>
                {(error) =>
                  getFormErrorText(error) ? (
                    <FieldError>{getFormErrorText(error)}</FieldError>
                  ) : null
                }
              </form.Subscribe>

              <form.Subscribe selector={(state) => state.isSubmitting}>
                {(isSubmitting) => (
                  <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting ? "Resetting password..." : "Reset password"}
                  </Button>
                )}
              </form.Subscribe>
            </CardFooter>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
