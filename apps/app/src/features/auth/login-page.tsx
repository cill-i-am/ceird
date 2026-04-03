import { useForm } from "@tanstack/react-form";
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

import { AuthFormField } from "./auth-form-field";
import { decodeLoginInput, loginSchema } from "./auth-schemas";

export function LoginPage() {
  const form = useForm({
    defaultValues: {
      email: "",
      password: "",
    },
    validators: {
      onSubmit: Schema.standardSchemaV1(loginSchema),
    },
    onSubmit: async ({ formApi, value }) => {
      formApi.setErrorMap({
        onSubmit: undefined,
      });

      const credentials = decodeLoginInput(value);
      const result = await authClient.signIn.email(credentials);

      if (result.error) {
        formApi.setErrorMap({
          onSubmit: {
            form: result.error.message ?? "Unable to sign in",
            fields: {},
          },
        });
      }
    },
  });

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md items-center px-4 py-10">
      <Card className="w-full">
        <CardHeader className="text-center">
          <CardTitle className="text-xl">Sign in</CardTitle>
          <CardDescription>
            Use your email and password to continue.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="space-y-6"
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

              <form.Field name="password">
                {(field) => {
                  const errorText = getErrorText(field.state.meta.errors);

                  return (
                    <AuthFormField
                      label="Password"
                      htmlFor="password"
                      invalid={Boolean(errorText)}
                      errorText={errorText}
                    >
                      <Input
                        id="password"
                        name={field.name}
                        type="password"
                        autoComplete="current-password"
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
                    {isSubmitting ? "Signing in..." : "Sign in"}
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

function getErrorText(
  errors: readonly unknown[] | undefined
): string | undefined {
  if (!errors) {
    return undefined;
  }

  for (const error of errors) {
    if (typeof error === "string" && error.length > 0) {
      return error;
    }

    if (
      typeof error === "object" &&
      error !== null &&
      "message" in error &&
      typeof error.message === "string" &&
      error.message.length > 0
    ) {
      return error.message;
    }
  }

  return undefined;
}

function getFormErrorText(error: unknown): string | undefined {
  if (typeof error === "string" && error.length > 0) {
    return error;
  }

  if (
    typeof error === "object" &&
    error !== null &&
    "form" in error &&
    typeof error.form === "string" &&
    error.form.length > 0
  ) {
    return error.form;
  }

  return undefined;
}
