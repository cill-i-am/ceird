import { useForm } from "@tanstack/react-form";
import { Link } from "@tanstack/react-router";
import { Schema } from "effect";

import { Alert, AlertDescription } from "#/components/ui/alert";
import { Button, buttonVariants } from "#/components/ui/button";
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
import {
  getLoginNavigationTarget,
  useAuthSuccessNavigation,
} from "./auth-navigation";
import { decodeSignupInput, signupSchema } from "./auth-schemas";
import {
  DEFAULT_AUTH_HIGHLIGHTS,
  EntryHighlightGrid,
  EntryShell,
  EntrySurfaceCard,
  INVITATION_AUTH_HIGHLIGHTS,
} from "./entry-shell";

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

  const isInvitationFlow = Boolean(search?.invitation);

  return (
    <EntryShell
      badge={isInvitationFlow ? "Invitation flow" : "Account setup"}
      title={
        isInvitationFlow
          ? "Create the account that will carry the invitation forward."
          : "Create the workspace account your team will rely on."
      }
      description={
        isInvitationFlow
          ? "Set up the invited account, verify the email, and continue directly into the workspace."
          : "Create a secure account so owners, coordinators, and crew leads can stay on the same page."
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
        badge={isInvitationFlow ? "Create invited account" : "Create account"}
        title="Create an account"
        description={
          isInvitationFlow
            ? "Create an account with the invited email address to accept your invitation."
            : "Sign up with your name, email, and password."
        }
        footer={
          <>
            <Link
              {...getLoginNavigationTarget(search?.invitation)}
              className={buttonVariants({
                variant: "link",
                className: "h-auto justify-start p-0",
              })}
            >
              Already have an account? Sign in
            </Link>
            <p className="text-sm/6 text-muted-foreground">
              We&apos;ll ask you to verify your email after setup so invitations
              and account recovery stay reliable.
            </p>
          </>
        }
      >
        {isInvitationFlow ? (
          <Alert className="bg-muted/40">
            <AlertDescription>
              Create the account with the invited email address so the
              invitation can attach to the right person.
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
                disabled={isSubmitting}
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
