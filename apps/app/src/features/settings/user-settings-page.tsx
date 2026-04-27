import { useForm } from "@tanstack/react-form";
import { useRouter } from "@tanstack/react-router";
import { Schema } from "effect";
import * as React from "react";

import { AppPageHeader } from "#/components/app-page-header";
import { AppUtilityPanel } from "#/components/app-utility-panel";
import { Button } from "#/components/ui/button";
import { FieldError, FieldGroup } from "#/components/ui/field";
import { Input } from "#/components/ui/input";
import { Spinner } from "#/components/ui/spinner";
import {
  getErrorText,
  getFormErrorText,
  getSettingsFailureMessage,
} from "#/features/auth/auth-form-errors";
import { AuthFormField } from "#/features/auth/auth-form-field";
import { useIsHydrated } from "#/hooks/use-is-hydrated";
import { authClient, buildEmailChangeRedirectTo } from "#/lib/auth-client";

import {
  changeEmailSchema,
  changePasswordSchema,
  decodeChangeEmailInput,
  decodeChangePasswordInput,
  decodeProfileSettingsInput,
  profileSettingsSchema,
} from "./user-settings-schemas";
import type { EmailChangeStatus } from "./user-settings-search";

export interface UserSettingsAccount {
  readonly email: string;
  readonly image?: string | null;
  readonly name: string;
}

function FormStatus({
  children,
  tone = "neutral",
}: {
  readonly children: React.ReactNode;
  readonly tone?: "destructive" | "neutral";
}) {
  return (
    <p
      className={
        tone === "destructive"
          ? "text-sm text-destructive"
          : "text-sm text-muted-foreground"
      }
      role={tone === "destructive" ? "alert" : "status"}
    >
      {children}
    </p>
  );
}

export function UserSettingsPage({
  user,
  emailChangeStatus,
}: {
  readonly user: UserSettingsAccount;
  readonly emailChangeStatus?: EmailChangeStatus | undefined;
}) {
  const router = useRouter();
  const isHydrated = useIsHydrated();
  const [profileMessage, setProfileMessage] = React.useState<string | null>(
    null
  );
  const [emailMessage, setEmailMessage] = React.useState<string | null>(() =>
    getEmailChangeStatusMessage(emailChangeStatus)
  );
  const [passwordMessage, setPasswordMessage] = React.useState<string | null>(
    null
  );

  React.useEffect(() => {
    setEmailMessage(getEmailChangeStatusMessage(emailChangeStatus));
  }, [emailChangeStatus]);

  const profileForm = useForm({
    defaultValues: {
      name: user.name,
      image: user.image ?? "",
    },
    validators: {
      onSubmit: Schema.standardSchemaV1(profileSettingsSchema),
    },
    onSubmit: async ({ formApi, value }) => {
      formApi.setErrorMap({ onSubmit: undefined });
      setProfileMessage(null);

      const input = decodeProfileSettingsInput(value);
      if (input.name === user.name && input.image === (user.image ?? null)) {
        setProfileMessage("No profile changes to save.");
        return;
      }

      const result = await authClient.updateUser({
        name: input.name,
        image: input.image,
      });

      if (result.error) {
        formApi.setErrorMap({
          onSubmit: {
            form: getSettingsFailureMessage("profile", result.error),
            fields: {},
          },
        });
        return;
      }

      setProfileMessage("Profile updated.");
      await router.invalidate();
    },
  });

  const emailForm = useForm({
    defaultValues: {
      email: "",
    },
    validators: {
      onSubmit: Schema.standardSchemaV1(changeEmailSchema),
    },
    onSubmit: async ({ formApi, value }) => {
      formApi.setErrorMap({ onSubmit: undefined });
      setEmailMessage(null);

      const input = decodeChangeEmailInput(value);
      if (input.email.toLowerCase() === user.email.toLowerCase()) {
        formApi.setErrorMap({
          onSubmit: {
            form: "Use a different email address.",
            fields: {},
          },
        });
        return;
      }

      const result = await authClient.changeEmail({
        newEmail: input.email,
        callbackURL: buildEmailChangeRedirectTo(window.location.origin),
      });

      if (result.error) {
        formApi.setErrorMap({
          onSubmit: {
            form: getSettingsFailureMessage("email", result.error),
            fields: {},
          },
        });
        return;
      }

      formApi.reset();
      setEmailMessage("Check the new email address to confirm this change.");
    },
  });

  const passwordForm = useForm({
    defaultValues: {
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    },
    validators: {
      onSubmit: Schema.standardSchemaV1(changePasswordSchema),
    },
    onSubmit: async ({ formApi, value }) => {
      formApi.setErrorMap({ onSubmit: undefined });
      setPasswordMessage(null);

      const input = decodeChangePasswordInput(value);
      const result = await authClient.changePassword({
        currentPassword: input.currentPassword,
        newPassword: input.newPassword,
        revokeOtherSessions: true,
      });

      if (result.error) {
        formApi.setErrorMap({
          onSubmit: {
            form: getSettingsFailureMessage("password", result.error),
            fields: {},
          },
        });
        return;
      }

      formApi.reset();
      setPasswordMessage("Password updated.");
    },
  });

  return (
    <div className="flex flex-1 flex-col gap-6 p-4 sm:p-6 lg:p-8">
      <AppPageHeader
        eyebrow="Account"
        title="Settings"
        description="Keep your sign-in details and account identity current for invites, recovery, and team updates."
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
        <AppUtilityPanel
          title="Profile"
          description="This is how your teammates see you across jobs and organization activity."
          className="xl:row-span-2"
        >
          <form
            className="flex flex-col gap-5"
            method="post"
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              event.stopPropagation();
              void profileForm.handleSubmit();
            }}
          >
            <FieldGroup>
              <profileForm.Field name="name">
                {(field) => {
                  const errorText = getErrorText(field.state.meta.errors);

                  return (
                    <AuthFormField
                      label="Display name"
                      htmlFor="settings-name"
                      invalid={Boolean(errorText)}
                      errorText={errorText}
                    >
                      <Input
                        id="settings-name"
                        name={field.name}
                        autoComplete="name"
                        value={field.state.value}
                        aria-invalid={Boolean(errorText) || undefined}
                        onBlur={field.handleBlur}
                        onInput={(event) => {
                          setProfileMessage(null);
                          field.handleChange(event.currentTarget.value);
                        }}
                        onChange={(event) => {
                          setProfileMessage(null);
                          field.handleChange(event.target.value);
                        }}
                      />
                    </AuthFormField>
                  );
                }}
              </profileForm.Field>

              <profileForm.Field name="image">
                {(field) => {
                  const errorText = getErrorText(field.state.meta.errors);

                  return (
                    <AuthFormField
                      label="Avatar image URL"
                      htmlFor="settings-image"
                      invalid={Boolean(errorText)}
                      descriptionText="Optional. Use a direct http or https image URL."
                      errorText={errorText}
                    >
                      <Input
                        id="settings-image"
                        name={field.name}
                        type="url"
                        autoComplete="url"
                        value={field.state.value}
                        aria-invalid={Boolean(errorText) || undefined}
                        onBlur={field.handleBlur}
                        onInput={(event) => {
                          setProfileMessage(null);
                          field.handleChange(event.currentTarget.value);
                        }}
                        onChange={(event) => {
                          setProfileMessage(null);
                          field.handleChange(event.target.value);
                        }}
                      />
                    </AuthFormField>
                  );
                }}
              </profileForm.Field>
            </FieldGroup>

            <profileForm.Subscribe
              selector={(state) => state.errorMap.onSubmit}
            >
              {(error) =>
                getFormErrorText(error) ? (
                  <FieldError>{getFormErrorText(error)}</FieldError>
                ) : null
              }
            </profileForm.Subscribe>
            {profileMessage ? <FormStatus>{profileMessage}</FormStatus> : null}

            <profileForm.Subscribe
              selector={(state) => ({
                isDefaultValue: state.isDefaultValue,
                isSubmitting: state.isSubmitting,
              })}
            >
              {({ isDefaultValue, isSubmitting }) => (
                <Button
                  type="submit"
                  size="lg"
                  className="w-full sm:w-auto"
                  disabled={isSubmitting || isDefaultValue || !isHydrated}
                >
                  {isSubmitting ? <Spinner data-icon="inline-start" /> : null}
                  {isSubmitting ? "Saving profile..." : "Save profile"}
                </Button>
              )}
            </profileForm.Subscribe>
          </form>
        </AppUtilityPanel>

        <AppUtilityPanel
          title="Email"
          description="Email changes are verified before they replace your current sign-in address."
        >
          <div className="rounded-[calc(var(--radius)*2)] border border-border/60 bg-muted/30 px-4 py-3">
            <p className="text-xs font-medium text-muted-foreground uppercase">
              Current email
            </p>
            <p className="mt-1 text-sm font-medium break-all text-foreground">
              {user.email}
            </p>
          </div>

          <form
            className="flex flex-col gap-5"
            method="post"
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              event.stopPropagation();
              void emailForm.handleSubmit();
            }}
          >
            <FieldGroup>
              <emailForm.Field name="email">
                {(field) => {
                  const errorText = getErrorText(field.state.meta.errors);

                  return (
                    <AuthFormField
                      label="New email"
                      htmlFor="settings-email"
                      invalid={Boolean(errorText)}
                      errorText={errorText}
                    >
                      <Input
                        id="settings-email"
                        name={field.name}
                        type="email"
                        autoComplete="email"
                        value={field.state.value}
                        aria-invalid={Boolean(errorText) || undefined}
                        onBlur={field.handleBlur}
                        onInput={(event) => {
                          setEmailMessage(null);
                          field.handleChange(event.currentTarget.value);
                        }}
                        onChange={(event) => {
                          setEmailMessage(null);
                          field.handleChange(event.target.value);
                        }}
                      />
                    </AuthFormField>
                  );
                }}
              </emailForm.Field>
            </FieldGroup>

            <emailForm.Subscribe selector={(state) => state.errorMap.onSubmit}>
              {(error) =>
                getFormErrorText(error) ? (
                  <FieldError>{getFormErrorText(error)}</FieldError>
                ) : null
              }
            </emailForm.Subscribe>
            {emailMessage ? (
              <FormStatus
                tone={
                  emailChangeStatus === "failed" ? "destructive" : "neutral"
                }
              >
                {emailMessage}
              </FormStatus>
            ) : null}

            <emailForm.Subscribe selector={(state) => state.isSubmitting}>
              {(isSubmitting) => (
                <Button
                  type="submit"
                  size="lg"
                  className="w-full sm:w-auto"
                  disabled={isSubmitting || !isHydrated}
                >
                  {isSubmitting ? <Spinner data-icon="inline-start" /> : null}
                  {isSubmitting
                    ? "Sending verification..."
                    : "Send verification email"}
                </Button>
              )}
            </emailForm.Subscribe>
          </form>
        </AppUtilityPanel>

        <AppUtilityPanel
          title="Password"
          description="Use a password you have not used anywhere else. Other sessions are signed out after this changes."
        >
          <form
            className="flex flex-col gap-5"
            method="post"
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              event.stopPropagation();
              void passwordForm.handleSubmit();
            }}
          >
            <FieldGroup>
              <passwordForm.Field name="currentPassword">
                {(field) => {
                  const errorText = getErrorText(field.state.meta.errors);

                  return (
                    <AuthFormField
                      label="Current password"
                      htmlFor="settings-current-password"
                      invalid={Boolean(errorText)}
                      errorText={errorText}
                    >
                      <Input
                        id="settings-current-password"
                        name={field.name}
                        type="password"
                        autoComplete="current-password"
                        value={field.state.value}
                        aria-invalid={Boolean(errorText) || undefined}
                        onBlur={field.handleBlur}
                        onInput={(event) => {
                          setPasswordMessage(null);
                          field.handleChange(event.currentTarget.value);
                        }}
                        onChange={(event) => {
                          setPasswordMessage(null);
                          field.handleChange(event.target.value);
                        }}
                      />
                    </AuthFormField>
                  );
                }}
              </passwordForm.Field>

              <passwordForm.Field name="newPassword">
                {(field) => {
                  const errorText = getErrorText(field.state.meta.errors);

                  return (
                    <AuthFormField
                      label="New password"
                      htmlFor="settings-new-password"
                      invalid={Boolean(errorText)}
                      errorText={errorText}
                    >
                      <Input
                        id="settings-new-password"
                        name={field.name}
                        type="password"
                        autoComplete="new-password"
                        value={field.state.value}
                        aria-invalid={Boolean(errorText) || undefined}
                        onBlur={field.handleBlur}
                        onInput={(event) => {
                          setPasswordMessage(null);
                          field.handleChange(event.currentTarget.value);
                        }}
                        onChange={(event) => {
                          setPasswordMessage(null);
                          field.handleChange(event.target.value);
                        }}
                      />
                    </AuthFormField>
                  );
                }}
              </passwordForm.Field>

              <passwordForm.Field name="confirmPassword">
                {(field) => {
                  const errorText = getErrorText(field.state.meta.errors);

                  return (
                    <AuthFormField
                      label="Confirm new password"
                      htmlFor="settings-confirm-password"
                      invalid={Boolean(errorText)}
                      errorText={errorText}
                    >
                      <Input
                        id="settings-confirm-password"
                        name={field.name}
                        type="password"
                        autoComplete="new-password"
                        value={field.state.value}
                        aria-invalid={Boolean(errorText) || undefined}
                        onBlur={field.handleBlur}
                        onInput={(event) => {
                          setPasswordMessage(null);
                          field.handleChange(event.currentTarget.value);
                        }}
                        onChange={(event) => {
                          setPasswordMessage(null);
                          field.handleChange(event.target.value);
                        }}
                      />
                    </AuthFormField>
                  );
                }}
              </passwordForm.Field>
            </FieldGroup>

            <passwordForm.Subscribe
              selector={(state) => state.errorMap.onSubmit}
            >
              {(error) =>
                getFormErrorText(error) ? (
                  <FieldError>{getFormErrorText(error)}</FieldError>
                ) : null
              }
            </passwordForm.Subscribe>
            {passwordMessage ? (
              <FormStatus>{passwordMessage}</FormStatus>
            ) : null}

            <passwordForm.Subscribe selector={(state) => state.isSubmitting}>
              {(isSubmitting) => (
                <Button
                  type="submit"
                  size="lg"
                  className="w-full sm:w-auto"
                  disabled={isSubmitting || !isHydrated}
                >
                  {isSubmitting ? <Spinner data-icon="inline-start" /> : null}
                  {isSubmitting ? "Updating password..." : "Update password"}
                </Button>
              )}
            </passwordForm.Subscribe>
          </form>
        </AppUtilityPanel>
      </div>
    </div>
  );
}

function getEmailChangeStatusMessage(
  status: EmailChangeStatus | undefined
): string | null {
  if (status === "complete") {
    return "Email verification completed. Your current sign-in email is shown below.";
  }

  if (status === "failed") {
    return "That email verification link is invalid or expired. Request a new email change to try again.";
  }

  return null;
}
