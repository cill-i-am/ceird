import { useForm } from "@tanstack/react-form";
import { Link } from "@tanstack/react-router";
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

import type { InvitationContinuationSearch } from "../organizations/invitation-continuation";
import {
  getAuthFailureMessage,
  getErrorText,
  getFormErrorText,
} from "./auth-form-errors";
import { AuthFormField } from "./auth-form-field";
import {
  getForgotPasswordNavigationTarget,
  useAuthSuccessNavigation,
} from "./auth-navigation";
import { decodeLoginInput, loginSchema } from "./auth-schemas";

export function LoginPage({
  search,
}: {
  readonly search?: InvitationContinuationSearch;
}) {
  const navigateOnSuccess = useAuthSuccessNavigation(search?.invitation);
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
            form: getAuthFailureMessage("signIn", result.error),
            fields: {},
          },
        });

        return;
      }

      await navigateOnSuccess();
    },
  });

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md items-center px-4 py-10">
      <Card className="w-full">
        <CardHeader className="text-center">
          <CardTitle className="text-xl">Sign in</CardTitle>
          <CardDescription>
            {search?.invitation
              ? "Sign in with the invited email address to review and accept your invitation."
              : "Use your email and password to continue."}
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

              <div className="text-right">
                <Link
                  {...getForgotPasswordNavigationTarget(search?.invitation)}
                  className="text-sm font-medium text-primary underline-offset-4 hover:underline"
                >
                  Forgot password?
                </Link>
              </div>
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
