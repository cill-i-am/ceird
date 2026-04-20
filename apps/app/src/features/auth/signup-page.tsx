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
import {
  authClient,
  buildEmailVerificationRedirectTo,
} from "#/lib/auth-client";

import type { InvitationContinuationSearch } from "../organizations/invitation-continuation";
import {
  getAuthFailureMessage,
  getErrorText,
  getFormErrorText,
} from "./auth-form-errors";
import { AuthFormField } from "./auth-form-field";
import { useAuthSuccessNavigation } from "./auth-navigation";
import { decodeSignupInput, signupSchema } from "./auth-schemas";

export function SignupPage({
  search,
}: {
  readonly search?: InvitationContinuationSearch;
}) {
  const navigateOnSuccess = useAuthSuccessNavigation(search?.invitation);
  const form = useForm({
    defaultValues: {
      name: "",
      email: "",
      password: "",
      confirmPassword: "",
    },
    validators: {
      onSubmit: Schema.standardSchemaV1(signupSchema),
    },
    onSubmit: async ({ formApi, value }) => {
      formApi.setErrorMap({
        onSubmit: undefined,
      });

      const credentials = decodeSignupInput(value);
      const result = await authClient.signUp.email({
        name: credentials.name,
        email: credentials.email,
        password: credentials.password,
        callbackURL: buildEmailVerificationRedirectTo(window.location.origin),
      });

      if (result.error) {
        formApi.setErrorMap({
          onSubmit: {
            form: getAuthFailureMessage("signUp", result.error),
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
          <CardTitle className="text-xl">Create an account</CardTitle>
          <CardDescription>
            {search?.invitation
              ? "Create an account with the invited email address to accept your invitation."
              : "Sign up with your name, email, and password."}
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
              <form.Field name="name">
                {(field) => {
                  const errorText = getErrorText(field.state.meta.errors);

                  return (
                    <AuthFormField
                      label="Name"
                      htmlFor="name"
                      invalid={Boolean(errorText)}
                      errorText={errorText}
                    >
                      <Input
                        id="name"
                        name={field.name}
                        autoComplete="name"
                        placeholder="Taylor Example"
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
                    {isSubmitting ? "Signing up..." : "Sign up"}
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
