import { useForm } from "@tanstack/react-form";
import { Link } from "@tanstack/react-router";
import { Schema } from "effect";

import { Button } from "#/components/ui/button";
import { FieldError, FieldGroup } from "#/components/ui/field";
import { Input } from "#/components/ui/input";
import { useIsHydrated } from "#/hooks/use-is-hydrated";
import { authClient } from "#/lib/auth-client";
import { submitClientForm } from "#/lib/client-form-submit";
import { beginMutationFeedback } from "#/lib/mutation-feedback";

import type { InvitationContinuationSearch } from "../organizations/invitation-continuation";
import { clearOrganizationAccessClientCache } from "../organizations/organization-access-cache";
import {
  getAuthFailureMessage,
  getErrorText,
  getFormErrorText,
} from "./auth-form-errors";
import { AuthFormField } from "./auth-form-field";
import { authQuietLinkClassName } from "./auth-link-styles";
import {
  getForgotPasswordNavigationTarget,
  getSignupNavigationTarget,
  useAuthSuccessNavigation,
} from "./auth-navigation";
import { AuthPasswordInput } from "./auth-password-input";
import { decodeLoginInput, loginSchema } from "./auth-schemas";
import { EntryShell, EntrySurfaceCard } from "./entry-shell";

export function LoginPage({
  search,
}: {
  readonly search?: InvitationContinuationSearch;
}) {
  const navigateOnSuccess = useAuthSuccessNavigation(search?.invitation);
  const isHydrated = useIsHydrated();
  const form = useForm({
    defaultValues: {
      email: "",
      password: "",
    },
    validators: {
      onSubmit: Schema.toStandardSchemaV1(loginSchema),
    },
    onSubmit: async ({ formApi, value }) => {
      formApi.setErrorMap({
        onSubmit: undefined,
      });

      const credentials = decodeLoginInput(value);
      const mutationFeedback = beginMutationFeedback();
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

      await mutationFeedback.waitForSuccess();
      clearOrganizationAccessClientCache();
      await navigateOnSuccess();
    },
  });

  const isInvitationFlow = Boolean(search?.invitation);

  return (
    <EntryShell atmosphere="quiet">
      <EntrySurfaceCard
        className="max-w-xl"
        title="Sign in"
        titleLevel={1}
        description={
          isInvitationFlow
            ? "Use the invited email address."
            : "Use your email and password to continue."
        }
        footer={
          <div className="flex flex-col items-start gap-2 text-sm/6 text-muted-foreground">
            <p>
              {isInvitationFlow
                ? "Need to set up the invited account first? "
                : "Need an account? "}
              <Link
                {...getSignupNavigationTarget(search?.invitation)}
                className={authQuietLinkClassName}
              >
                Create one
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

            <div className="flex flex-col gap-2">
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
              <Link
                {...getForgotPasswordNavigationTarget(search?.invitation)}
                className={`${authQuietLinkClassName} self-start`}
              >
                Forgot password?
              </Link>
            </div>
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
                {isSubmitting ? "Signing in..." : "Sign in"}
              </Button>
            )}
          </form.Subscribe>
        </form>
      </EntrySurfaceCard>
    </EntryShell>
  );
}
