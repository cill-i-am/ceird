import { useForm } from "@tanstack/react-form";
import { Link } from "@tanstack/react-router";
import { Schema } from "effect";
import { useState } from "react";

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
import { authClient, buildPasswordResetRedirectTo } from "#/lib/auth-client";

import {
  getErrorText,
  getFormErrorText,
  getPasswordResetRequestFailureMessage,
} from "./auth-form-errors";
import { AuthFormField } from "./auth-form-field";
import {
  decodePasswordResetRequestInput,
  passwordResetRequestSchema,
} from "./auth-schemas";

const successCopy =
  "If an account exists for that email, a reset link will be sent.";

export function PasswordResetRequestPage() {
  const [isSubmitted, setIsSubmitted] = useState(false);
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
        redirectTo: buildPasswordResetRedirectTo(window.location.origin),
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
    <div className="mx-auto flex min-h-screen w-full max-w-md items-center px-4 py-10">
      <Card className="w-full">
        <CardHeader className="text-center">
          <CardTitle className="text-xl">Forgot password?</CardTitle>
          <CardDescription>
            {isSubmitted
              ? "Check your email for the next step."
              : "Enter your email and we'll send you a reset link."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isSubmitted ? (
            <div className="space-y-4 text-center">
              <p className="text-sm text-muted-foreground">{successCopy}</p>
              <Link
                to="/login"
                className="text-sm font-medium text-primary underline-offset-4 hover:underline"
              >
                Back to login
              </Link>
            </div>
          ) : (
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
                      {isSubmitting
                        ? "Sending reset link..."
                        : "Send reset link"}
                    </Button>
                  )}
                </form.Subscribe>

                <Link
                  to="/login"
                  className="text-center text-sm font-medium text-primary underline-offset-4 hover:underline"
                >
                  Back to login
                </Link>
              </CardFooter>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
