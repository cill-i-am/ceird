import { useForm } from "@tanstack/react-form";
import { Link } from "@tanstack/react-router";
import { Schema } from "effect";

import { Alert, AlertDescription } from "#/components/ui/alert";
import { Button, buttonVariants } from "#/components/ui/button";
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
  getSignupNavigationTarget,
  useAuthSuccessNavigation,
} from "./auth-navigation";
import { decodeLoginInput, loginSchema } from "./auth-schemas";
import {
  DEFAULT_AUTH_HIGHLIGHTS,
  EntryHighlightGrid,
  EntryShell,
  EntrySurfaceCard,
  INVITATION_AUTH_HIGHLIGHTS,
} from "./entry-shell";

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

  const isInvitationFlow = Boolean(search?.invitation);

  return (
    <EntryShell
      badge={isInvitationFlow ? "Invitation flow" : "Sign in"}
      title={
        isInvitationFlow
          ? "Pick up the invitation and continue straight into the workspace."
          : "Sign in to keep the crew aligned."
      }
      description={
        isInvitationFlow
          ? "Use the invited account to review the pending invite and keep the setup moving without losing context."
          : "Open your workspace, update work, and keep the next action visible for everyone involved."
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
        badge={isInvitationFlow ? "Continue invitation" : "Welcome back"}
        title="Sign in"
        description={
          isInvitationFlow
            ? "Sign in with the invited email address to review and accept your invitation."
            : "Use your email and password to continue."
        }
        footer={
          <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Link
                {...getForgotPasswordNavigationTarget(search?.invitation)}
                className={buttonVariants({
                  variant: "link",
                  className: "h-auto p-0",
                })}
              >
                Forgot password?
              </Link>
              <Link
                {...getSignupNavigationTarget(search?.invitation)}
                className={buttonVariants({
                  variant: "link",
                  className: "h-auto p-0",
                })}
              >
                {isInvitationFlow ? "Create an account" : "Need an account?"}
              </Link>
            </div>
            <p className="text-sm/6 text-muted-foreground">
              {isInvitationFlow
                ? "Need a fresh account for this invite? Create one with the invited email address."
                : "New here? Create an account and get into your team's workspace."}
            </p>
          </>
        }
      >
        {isInvitationFlow ? (
          <Alert className="bg-muted/40">
            <AlertDescription>
              This sign in keeps your invitation attached so you can review and
              accept it right away.
            </AlertDescription>
          </Alert>
        ) : null}

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
                {isSubmitting ? "Signing in..." : "Sign in"}
              </Button>
            )}
          </form.Subscribe>
        </form>
      </EntrySurfaceCard>
    </EntryShell>
  );
}
