import { useForm } from "@tanstack/react-form";
import { Link } from "@tanstack/react-router";
import { Schema } from "effect";
import { REGEXP_ONLY_DIGITS } from "input-otp";
import * as React from "react";

import { Button } from "#/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "#/components/ui/field";
import { Input } from "#/components/ui/input";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "#/components/ui/input-otp";
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

type LoginTwoFactorMode = "backupCode" | "totp";

interface LoginCredentialsState {
  readonly status: "credentials";
}

interface LoginTwoFactorState {
  readonly code: string;
  readonly email: string;
  readonly error: string | null;
  readonly mode: LoginTwoFactorMode;
  readonly pending: boolean;
  readonly status: "twoFactor";
}

type LoginChallengeState = LoginCredentialsState | LoginTwoFactorState;

type LoginChallengeAction =
  | {
      readonly email: string;
      readonly type: "start-two-factor";
    }
  | {
      readonly code: string;
      readonly type: "change-code";
    }
  | {
      readonly mode: LoginTwoFactorMode;
      readonly type: "change-mode";
    }
  | {
      readonly pending: boolean;
      readonly type: "set-pending";
    }
  | {
      readonly error: string | null;
      readonly type: "set-error";
    }
  | {
      readonly type: "reset-credentials";
    };

const initialLoginChallengeState: LoginChallengeState = {
  status: "credentials",
};

const SESSION_ESTABLISHMENT_FAILURE_MESSAGE =
  "We couldn't start your session. Refresh and try signing in again.";

export function LoginPage({
  search,
}: {
  readonly search?: InvitationContinuationSearch;
}) {
  const navigateOnSuccess = useAuthSuccessNavigation(search?.invitation);
  const isHydrated = useIsHydrated();
  const [challengeState, dispatchChallenge] = React.useReducer(
    loginChallengeReducer,
    initialLoginChallengeState
  );
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

      if (hasTwoFactorRedirect(result.data)) {
        dispatchChallenge({
          email: credentials.email,
          type: "start-two-factor",
        });
        return;
      }

      const sessionResult = await authClient.getSession();

      if (sessionResult.error || !sessionResult.data) {
        formApi.setErrorMap({
          onSubmit: {
            form: SESSION_ESTABLISHMENT_FAILURE_MESSAGE,
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
  const isTwoFactorChallenge = challengeState.status === "twoFactor";
  const cardDescription = isTwoFactorChallenge
    ? "Enter a security code to finish signing in."
    : getLoginCardDescription(isInvitationFlow);

  return (
    <EntryShell atmosphere="quiet">
      <EntrySurfaceCard
        className="max-w-xl"
        title={isTwoFactorChallenge ? "Verify your sign-in" : "Sign in"}
        titleLevel={1}
        description={cardDescription}
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
        {isTwoFactorChallenge ? (
          <LoginTwoFactorChallengeForm
            state={challengeState}
            isHydrated={isHydrated}
            onCodeChange={(code) =>
              dispatchChallenge({ code, type: "change-code" })
            }
            onModeChange={(mode) =>
              dispatchChallenge({ mode, type: "change-mode" })
            }
            onReset={() => {
              form.setFieldValue("email", challengeState.email);
              form.setFieldValue("password", "");
              dispatchChallenge({ type: "reset-credentials" });
            }}
            onSubmit={async (event) => {
              event.preventDefault();

              if (
                challengeState.pending ||
                !isLoginTwoFactorCodeReady(challengeState)
              ) {
                return;
              }

              dispatchChallenge({ error: null, type: "set-error" });
              dispatchChallenge({ pending: true, type: "set-pending" });

              const mutationFeedback = beginMutationFeedback();
              const result =
                challengeState.mode === "backupCode"
                  ? await authClient.twoFactor.verifyBackupCode({
                      code: challengeState.code.trim(),
                    })
                  : await authClient.twoFactor.verifyTotp({
                      code: challengeState.code,
                    });

              if (result.error) {
                dispatchChallenge({
                  error: getTwoFactorChallengeFailureMessage(result.error),
                  type: "set-error",
                });
                dispatchChallenge({ pending: false, type: "set-pending" });
                return;
              }

              await mutationFeedback.waitForSuccess();
              clearOrganizationAccessClientCache();
              await navigateOnSuccess();
            }}
          />
        ) : (
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
        )}
      </EntrySurfaceCard>
    </EntryShell>
  );
}

function LoginTwoFactorChallengeForm({
  isHydrated,
  onCodeChange,
  onModeChange,
  onReset,
  onSubmit,
  state,
}: {
  readonly isHydrated: boolean;
  readonly onCodeChange: (code: string) => void;
  readonly onModeChange: (mode: LoginTwoFactorMode) => void;
  readonly onReset: () => void;
  readonly onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  readonly state: LoginTwoFactorState;
}) {
  const ready = isLoginTwoFactorCodeReady(state);

  return (
    <form
      className="flex flex-col gap-6"
      method="post"
      noValidate
      onSubmit={onSubmit}
    >
      <div className="rounded-lg border border-border/70 bg-muted/30 px-4 py-3">
        <p className="text-xs font-medium text-muted-foreground uppercase">
          Signing in as
        </p>
        <p className="mt-1 text-sm font-medium break-all text-foreground">
          {state.email}
        </p>
      </div>

      <FieldGroup>
        {state.mode === "totp" ? (
          <Field>
            <FieldLabel htmlFor="login-two-factor-code">
              Authenticator code
            </FieldLabel>
            <InputOTP
              id="login-two-factor-code"
              name="code"
              maxLength={6}
              pattern={REGEXP_ONLY_DIGITS}
              inputMode="numeric"
              autoComplete="one-time-code"
              pushPasswordManagerStrategy="none"
              value={state.code}
              disabled={state.pending}
              onChange={onCodeChange}
            >
              <InputOTPGroup>
                <InputOTPSlot index={0} />
                <InputOTPSlot index={1} />
                <InputOTPSlot index={2} />
                <InputOTPSlot index={3} />
                <InputOTPSlot index={4} />
                <InputOTPSlot index={5} />
              </InputOTPGroup>
            </InputOTP>
            <FieldDescription>
              Enter the six-digit code from your authenticator app.
            </FieldDescription>
          </Field>
        ) : (
          <Field>
            <FieldLabel htmlFor="login-two-factor-backup-code">
              Backup code
            </FieldLabel>
            <Input
              id="login-two-factor-backup-code"
              name="code"
              type="text"
              autoComplete="one-time-code"
              value={state.code}
              disabled={state.pending}
              onChange={(event) => onCodeChange(event.target.value)}
            />
            <FieldDescription>
              Use one saved backup code if your authenticator is unavailable.
            </FieldDescription>
          </Field>
        )}
      </FieldGroup>

      {state.error ? <FieldError>{state.error}</FieldError> : null}

      <div className="flex flex-col gap-3">
        <Button
          type="submit"
          size="lg"
          className="w-full [view-transition-name:auth-card-action]"
          loading={state.pending}
          disabled={!isHydrated || !ready}
        >
          {state.pending ? "Verifying..." : "Verify sign-in"}
        </Button>
        <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center sm:justify-between">
          <Button
            type="button"
            variant="link"
            size="sm"
            className="h-auto px-0 text-muted-foreground hover:text-foreground"
            disabled={state.pending}
            onClick={() =>
              onModeChange(state.mode === "totp" ? "backupCode" : "totp")
            }
          >
            {state.mode === "totp"
              ? "Use a backup code"
              : "Use an authenticator code"}
          </Button>
          <Button
            type="button"
            variant="link"
            size="sm"
            className="h-auto px-0 text-muted-foreground hover:text-foreground"
            disabled={state.pending}
            onClick={onReset}
          >
            Sign in again
          </Button>
        </div>
      </div>
    </form>
  );
}

function loginChallengeReducer(
  state: LoginChallengeState,
  action: LoginChallengeAction
): LoginChallengeState {
  switch (action.type) {
    case "start-two-factor": {
      return {
        code: "",
        email: action.email,
        error: null,
        mode: "totp",
        pending: false,
        status: "twoFactor",
      };
    }
    case "change-code": {
      return state.status === "twoFactor"
        ? { ...state, code: action.code, error: null }
        : state;
    }
    case "change-mode": {
      return state.status === "twoFactor"
        ? { ...state, code: "", error: null, mode: action.mode }
        : state;
    }
    case "set-pending": {
      return state.status === "twoFactor"
        ? { ...state, pending: action.pending }
        : state;
    }
    case "set-error": {
      return state.status === "twoFactor"
        ? { ...state, error: action.error }
        : state;
    }
    case "reset-credentials": {
      return initialLoginChallengeState;
    }
    default: {
      return assertNeverLoginChallengeAction(action);
    }
  }
}

function isLoginTwoFactorCodeReady(state: LoginTwoFactorState) {
  return state.mode === "totp"
    ? state.code.length === 6
    : state.code.trim().length > 0;
}

function getLoginCardDescription(isInvitationFlow: boolean) {
  return isInvitationFlow
    ? "Use the invited email address."
    : "Use your email and password to continue.";
}

function hasTwoFactorRedirect(
  data: unknown
): data is { readonly twoFactorRedirect: true } {
  return (
    typeof data === "object" &&
    data !== null &&
    (data as { readonly twoFactorRedirect?: unknown }).twoFactorRedirect ===
      true
  );
}

function getTwoFactorChallengeFailureMessage(error: unknown): string {
  if (isExpiredTwoFactorChallengeError(error)) {
    return "That verification session expired. Sign in again to get a new challenge.";
  }

  return "We couldn't verify that code. Try again or use a backup code.";
}

function isExpiredTwoFactorChallengeError(error: unknown) {
  if (typeof error !== "object" || error === null) {
    return false;
  }

  const fields = ["code", "message", "statusText"] as const;

  return fields.some((field) => {
    const value = (error as Record<string, unknown>)[field];

    return (
      typeof value === "string" &&
      (value.toLowerCase().includes("expired") ||
        value.toLowerCase().includes("session"))
    );
  });
}

function assertNeverLoginChallengeAction(action: never): LoginChallengeState {
  throw new Error(
    `Unhandled login challenge action: ${JSON.stringify(action)}`
  );
}
