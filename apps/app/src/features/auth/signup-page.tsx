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

import type { InvitationContinuationSearch } from "../organizations/invitation-continuation";
import {
  getAuthFailureMessage,
  getErrorText,
  getFormErrorText,
} from "./auth-form-errors";
import { AuthFormField } from "./auth-form-field";
import {
  getLoginNavigationTarget,
  useAuthSuccessNavigation,
} from "./auth-navigation";
import { decodeSignupInput, signupSchema } from "./auth-schemas";
import { EntryShell, EntrySurfaceCard } from "./entry-shell";

const quietLinkClassName =
  "text-sm text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline focus-visible:text-foreground focus-visible:underline focus-visible:outline-none";

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

  const isInvitationFlow = Boolean(search?.invitation);

  return (
    <EntryShell
      badge={isInvitationFlow ? "Invitation flow" : "Account setup"}
      title={
        isInvitationFlow
          ? "Create the account that will accept this invitation."
          : "Create the account your team will sign into."
      }
      description={
        isInvitationFlow
          ? "Use the invited email, verify it, and continue straight into the workspace."
          : "Set up a secure account once so sign-in, invites, and recovery stay straightforward."
      }
      supportingContent={
        <div className="flex flex-col gap-8">
          <div className="flex flex-col gap-3">
            <p className="text-xs font-medium text-muted-foreground uppercase">
              {isInvitationFlow ? "Create the invited account" : "Set up once"}
            </p>
            <p className="max-w-[48ch] text-sm/7 text-foreground/90">
              {isInvitationFlow
                ? "Create the account tied to the invitation so the workspace handoff stays attached after verification."
                : "This is the account you'll use to manage work, invite teammates, and recover access later."}
            </p>
          </div>

          <dl className="grid gap-5 sm:grid-cols-2">
            <div className="flex flex-col gap-1 border-t border-border/60 pt-4">
              <dt className="text-xs font-medium text-muted-foreground uppercase">
                Email choice
              </dt>
              <dd className="text-sm/6 text-muted-foreground">
                {isInvitationFlow
                  ? "Use the invited email address so the invitation lands on the new account."
                  : "Choose the email you want to keep tied to invites, verification, and sign-in."}
              </dd>
            </div>

            <div className="flex flex-col gap-1 border-t border-border/60 pt-4">
              <dt className="text-xs font-medium text-muted-foreground uppercase">
                After this
              </dt>
              <dd className="text-sm/6 text-muted-foreground">
                {isInvitationFlow
                  ? "You'll verify the address, then continue directly back to the invitation."
                  : "You'll verify the address, then head into the app."}
              </dd>
            </div>
          </dl>
        </div>
      }
    >
      <EntrySurfaceCard
        badge={isInvitationFlow ? "Invited account" : "Create account"}
        className="max-w-lg"
        title="Create an account"
        description={
          isInvitationFlow
            ? "Create an account with the invited email address."
            : "Use your name, email, and password to get started."
        }
        footer={
          <div className="flex flex-col items-start gap-2 text-sm/6 text-muted-foreground">
            <p>
              Already have an account?{" "}
              <Link
                {...getLoginNavigationTarget(search?.invitation)}
                className={quietLinkClassName}
              >
                Sign in
              </Link>
            </p>
            <p>We&rsquo;ll verify your email before you continue.</p>
          </div>
        }
      >
        {isInvitationFlow ? (
          <div className="rounded-2xl border border-border/70 bg-muted/35 px-4 py-3 text-sm/6 text-muted-foreground">
            Use the invited email address so the invitation attaches to the new
            account.
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
                    descriptionText="Use 8 or more characters."
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
                {isSubmitting ? "Signing up..." : "Sign up"}
              </Button>
            )}
          </form.Subscribe>
        </form>
      </EntrySurfaceCard>
    </EntryShell>
  );
}
