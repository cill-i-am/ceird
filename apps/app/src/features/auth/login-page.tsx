import { useForm } from "@tanstack/react-form";
import { Link } from "@tanstack/react-router";
import { Schema } from "effect";

import { Button } from "#/components/ui/button";
import { FieldError, FieldGroup } from "#/components/ui/field";
import { Input } from "#/components/ui/input";
import { useIsHydrated } from "#/hooks/use-is-hydrated";
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
import { EntryShell, EntrySurfaceCard } from "./entry-shell";

const quietLinkClassName =
  "text-sm text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline focus-visible:text-foreground focus-visible:underline focus-visible:outline-none";

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
          ? "Sign in to finish this invitation."
          : "Sign in and get back to the work in front of you."
      }
      description={
        isInvitationFlow
          ? "Use the invited account so the pending handoff stays attached when you continue."
          : "Open your workspace, catch up quickly, and keep the next action visible."
      }
      supportingContent={
        <div className="flex flex-col gap-8">
          <div className="flex flex-col gap-3">
            <p className="text-xs font-medium text-muted-foreground uppercase">
              {isInvitationFlow ? "Continue the handoff" : "Back in the flow"}
            </p>
            <p className="max-w-[48ch] text-sm/7 text-foreground/90">
              {isInvitationFlow
                ? "The invitation will stay attached after sign in, so you can review it and join the workspace without restarting the flow."
                : "Return to the same workspace your team is using and pick up the latest work without hunting for context."}
            </p>
          </div>

          <dl className="grid gap-5 sm:grid-cols-2">
            <div className="flex flex-col gap-1 border-t border-border/60 pt-4">
              <dt className="text-xs font-medium text-muted-foreground uppercase">
                Use this email
              </dt>
              <dd className="text-sm/6 text-muted-foreground">
                {isInvitationFlow
                  ? "Sign in with the invited address so the invitation lands on the right account."
                  : "Use the account your team already recognizes for updates, invites, and recovery."}
              </dd>
            </div>

            <div className="flex flex-col gap-1 border-t border-border/60 pt-4">
              <dt className="text-xs font-medium text-muted-foreground uppercase">
                Next step
              </dt>
              <dd className="text-sm/6 text-muted-foreground">
                {isInvitationFlow
                  ? "After sign in, you'll go straight back to the invitation review."
                  : "After sign in, you'll head straight into the app."}
              </dd>
            </div>
          </dl>
        </div>
      }
    >
      <EntrySurfaceCard
        badge={isInvitationFlow ? "Invited account" : "Welcome back"}
        className="max-w-lg"
        title="Sign in"
        description={
          isInvitationFlow
            ? "Use the invited email address to continue."
            : "Use your email and password to continue."
        }
        footer={
          <div className="flex flex-col items-start gap-2 text-sm/6 text-muted-foreground">
            <Link
              {...getForgotPasswordNavigationTarget(search?.invitation)}
              className={quietLinkClassName}
            >
              Forgot password?
            </Link>
            <p>
              {isInvitationFlow
                ? "Need to set up the invited account first? "
                : "Need an account? "}
              <Link
                {...getSignupNavigationTarget(search?.invitation)}
                className={quietLinkClassName}
              >
                Create one
              </Link>
            </p>
          </div>
        }
      >
        {isInvitationFlow ? (
          <div className="rounded-2xl border border-border/70 bg-muted/35 px-4 py-3 text-sm/6 text-muted-foreground">
            This sign in keeps your invitation attached, so you can review and
            accept it right away.
          </div>
        ) : null}

        <form
          className="flex flex-col gap-6"
          method="post"
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
