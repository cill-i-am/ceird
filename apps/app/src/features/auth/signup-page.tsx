import { useForm } from "@tanstack/react-form";
import { Link } from "@tanstack/react-router";
import { Schema } from "effect";

import { Button } from "#/components/ui/button";
import { FieldError, FieldGroup } from "#/components/ui/field";
import { Input } from "#/components/ui/input";
import { useIsHydrated } from "#/hooks/use-is-hydrated";
import {
  authClient,
  buildEmailVerificationRedirectTo,
} from "#/lib/auth-client";
import { submitClientForm } from "#/lib/client-form-submit";
import { beginMutationFeedback } from "#/lib/mutation-feedback";

import type { InvitationContinuationSearch } from "../organizations/invitation-continuation";
import {
  getAuthFailureMessage,
  getErrorText,
  getFormErrorText,
} from "./auth-form-errors";
import { AuthFormField } from "./auth-form-field";
import { authQuietLinkClassName } from "./auth-link-styles";
import {
  getLoginNavigationTarget,
  useAuthSuccessNavigation,
} from "./auth-navigation";
import { AuthPasswordInput } from "./auth-password-input";
import { decodeSignupInput, signupSchema } from "./auth-schemas";
import { EntryShell, EntrySurfaceCard } from "./entry-shell";

export function SignupPage({
  search,
}: {
  readonly search?: InvitationContinuationSearch;
}) {
  const navigateOnSuccess = useAuthSuccessNavigation(search?.invitation);
  const isHydrated = useIsHydrated();
  const form = useForm({
    defaultValues: {
      name: "",
      email: "",
      password: "",
    },
    validators: {
      onSubmit: Schema.standardSchemaV1(signupSchema),
    },
    onSubmit: async ({ formApi, value }) => {
      formApi.setErrorMap({
        onSubmit: undefined,
      });

      const credentials = decodeSignupInput(value);
      const mutationFeedback = beginMutationFeedback();
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

      if (search?.invitation) {
        const signInResult = await authClient.signIn.email({
          email: credentials.email,
          password: credentials.password,
        });

        if (signInResult.error) {
          formApi.setErrorMap({
            onSubmit: {
              form: getAuthFailureMessage("signIn", signInResult.error),
              fields: {},
            },
          });

          return;
        }
      }

      await mutationFeedback.waitForSuccess();
      await navigateOnSuccess();
    },
  });

  const isInvitationFlow = Boolean(search?.invitation);

  return (
    <EntryShell atmosphere="standard">
      <EntrySurfaceCard
        className="max-w-xl"
        title="Create an account"
        titleLevel={1}
        description={
          isInvitationFlow
            ? "Create the account that will accept the invitation."
            : "Use your name, email, and password to get started."
        }
        footer={
          <div className="flex flex-col items-start gap-2 text-sm/6 text-muted-foreground">
            <p>
              Already have an account?{" "}
              <Link
                {...getLoginNavigationTarget(search?.invitation)}
                className={authQuietLinkClassName}
              >
                Sign in
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
            <form.Field name="name">
              {(field) => {
                const errorText = getErrorText(field.state.meta.errors);

                return (
                  <AuthFormField
                    label="Name"
                    htmlFor="name"
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
                {isSubmitting ? "Signing up..." : "Sign up"}
              </Button>
            )}
          </form.Subscribe>
        </form>
      </EntrySurfaceCard>
    </EntryShell>
  );
}
