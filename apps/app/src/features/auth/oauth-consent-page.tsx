import { Schema } from "effect";
import { useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "#/components/ui/alert";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { authClient } from "#/lib/auth-client";

import { EntryShell, EntrySurfaceCard } from "./entry-shell";

export interface OAuthConsentSearch {
  readonly client_id?: string;
  readonly redirect_uri?: string;
  readonly scope?: string;
  readonly [key: string]: unknown;
}

interface OAuthConsentPageProps {
  readonly rawSearch?: string | undefined;
  readonly search: OAuthConsentSearch;
}

type ConsentAction = "allow" | "deny";

interface ConsentErrorNotice {
  readonly title: string;
  readonly description: string;
}

const OAuthConsentClientError = Schema.Struct({
  code: Schema.optional(Schema.String),
  error: Schema.optional(Schema.String),
  error_description: Schema.optional(Schema.String),
  message: Schema.optional(Schema.String),
  status: Schema.optional(Schema.Number),
  statusText: Schema.optional(Schema.String),
});
type OAuthConsentClientError = Schema.Schema.Type<
  typeof OAuthConsentClientError
>;
const isOAuthConsentClientError = Schema.is(OAuthConsentClientError);

const scopeLabels: Record<string, string> = {
  "ceird:admin": "Administer Ceird data",
  "ceird:read": "Read your Ceird data",
  "ceird:write": "Update your Ceird data",
  email: "View your email address",
  offline_access: "Stay connected when you are away",
  openid: "Confirm your identity",
  profile: "View your basic profile",
};

function splitScopes(scope: string | undefined): readonly string[] {
  return scope
    ? scope.split(" ").flatMap((value) => {
        const trimmed = value.trim();

        return trimmed ? [trimmed] : [];
      })
    : [];
}

function getScopeLabel(scope: string): string {
  return scopeLabels[scope] ?? scope;
}

function getRedirectHost(redirectUri: string | undefined): string | undefined {
  if (!redirectUri) {
    return undefined;
  }

  try {
    return new URL(redirectUri).host;
  } catch {
    return undefined;
  }
}

function getDefaultConsentErrorNotice(
  action: ConsentAction
): ConsentErrorNotice {
  return {
    title: "Authorization failed",
    description:
      action === "allow"
        ? "We couldn't approve this request. Return to the app or agent and try again."
        : "We couldn't deny this request. Return to the app or agent and try again.",
  };
}

export function getConsentErrorNotice(
  action: ConsentAction,
  error: unknown
): ConsentErrorNotice {
  const consentError = isOAuthConsentClientError(error) ? error : undefined;

  if (consentError?.status === 429) {
    return {
      title: "Too many attempts",
      description:
        "Wait a moment before trying this authorization request again.",
    };
  }

  if (isEmailVerificationError(consentError)) {
    return {
      title: "Verify your email first",
      description:
        "Check your inbox and verify your email before approving agent access. Then return to the app or agent and try again.",
    };
  }

  if (isMissingSessionError(consentError)) {
    return {
      title: "Sign in again",
      description:
        "Your session is not available for this authorization request. Sign in, then return to the app or agent.",
    };
  }

  if (isExpiredConsentError(consentError)) {
    return {
      title: "Consent link expired",
      description:
        "This authorization request is no longer valid. Return to the app or agent and start a fresh request.",
    };
  }

  if (isInvalidConsentSignatureError(consentError)) {
    return {
      title: "Consent link changed",
      description:
        "This authorization request could not be verified. Return to the app or agent and start a fresh request.",
    };
  }

  return getDefaultConsentErrorNotice(action);
}

function isEmailVerificationError(
  error: OAuthConsentClientError | undefined
): boolean {
  return matchesConsentError(error, [
    "EMAIL_NOT_VERIFIED",
    "email not verified",
  ]);
}

function isMissingSessionError(
  error: OAuthConsentClientError | undefined
): boolean {
  return error?.status === 401 || matchesConsentError(error, ["unauthorized"]);
}

function isExpiredConsentError(
  error: OAuthConsentClientError | undefined
): boolean {
  return matchesConsentError(error, ["missing oauth query", "expired"]);
}

function isInvalidConsentSignatureError(
  error: OAuthConsentClientError | undefined
): boolean {
  return matchesConsentError(error, ["invalid_signature"]);
}

function matchesConsentError(
  error: OAuthConsentClientError | undefined,
  needles: readonly string[]
): boolean {
  if (!error) {
    return false;
  }

  const haystack = [
    error.code,
    error.error,
    error.error_description,
    error.message,
    error.statusText,
  ]
    .filter((value): value is string => typeof value === "string")
    .join(" ")
    .toLowerCase();

  return needles.some((needle) => haystack.includes(needle.toLowerCase()));
}

function getVerifiedConsentSearch(
  search: OAuthConsentSearch,
  rawSearch: string | undefined
): OAuthConsentSearch {
  const signedParams = getSignedConsentSearchParams(rawSearch);

  return signedParams
    ? {
        client_id: signedParams.get("client_id") ?? undefined,
        redirect_uri: signedParams.get("redirect_uri") ?? undefined,
        scope: signedParams.get("scope") ?? undefined,
      }
    : search;
}

function getSignedConsentSearchParams(
  rawSearch: string | undefined
): URLSearchParams | undefined {
  if (!rawSearch) {
    return undefined;
  }

  const params = new URLSearchParams(rawSearch);
  if (!params.has("sig")) {
    return undefined;
  }

  const signedParams = new URLSearchParams();
  for (const [key, value] of params.entries()) {
    signedParams.append(key, value);
    if (key === "sig") {
      break;
    }
  }

  return signedParams;
}

function getOAuthQuery(rawSearch: string | undefined): string | undefined {
  return getSignedConsentSearchParams(rawSearch)?.toString();
}

function getBrowserSearch() {
  return typeof window === "undefined" ? undefined : window.location.search;
}

export function OAuthConsentPage({ rawSearch, search }: OAuthConsentPageProps) {
  const [submittingAction, setSubmittingAction] =
    useState<ConsentAction | null>(null);
  const [errorNotice, setErrorNotice] = useState<ConsentErrorNotice | null>(
    null
  );
  const verifiedSearch = getVerifiedConsentSearch(
    search,
    rawSearch ?? getBrowserSearch()
  );
  const oauthQuery = getOAuthQuery(rawSearch ?? getBrowserSearch());
  const clientId = verifiedSearch.client_id?.trim();
  const scopes = splitScopes(verifiedSearch.scope);
  const redirectHost = getRedirectHost(verifiedSearch.redirect_uri);

  if (!clientId) {
    return (
      <EntryShell atmosphere="quiet" mode="contained">
        <EntrySurfaceCard
          className="max-w-lg"
          title="Consent link expired"
          titleLevel={1}
          description="This authorization request is missing required client details. Return to the app or agent and start again."
        />
      </EntryShell>
    );
  }

  async function submitConsent(action: ConsentAction) {
    if (submittingAction !== null) {
      return;
    }

    setErrorNotice(null);
    setSubmittingAction(action);

    try {
      const result = await authClient.oauth2.consent({
        accept: action === "allow",
        ...(oauthQuery ? { oauth_query: oauthQuery } : {}),
      });
      const redirectUrl = result.data?.url;

      if (result.error || !redirectUrl) {
        setErrorNotice(getConsentErrorNotice(action, result.error));
        setSubmittingAction(null);
        return;
      }

      window.location.assign(redirectUrl);
      return;
    } catch (error) {
      setErrorNotice(getConsentErrorNotice(action, error));
    }

    setSubmittingAction(null);
  }

  return (
    <EntryShell atmosphere="quiet" mode="contained">
      <EntrySurfaceCard
        className="max-w-lg"
        title="Review app access"
        titleLevel={1}
        description="Approve this request only if you trust the app or agent."
      >
        <div className="flex flex-col gap-5">
          <section
            aria-labelledby="oauth-client-heading"
            className="grid gap-2"
          >
            <h2
              id="oauth-client-heading"
              className="text-sm font-medium text-foreground"
            >
              Requesting client
            </h2>
            <div className="rounded-xl border border-border/70 bg-muted/30 px-3 py-2">
              <p className="font-mono text-sm break-all text-foreground">
                {clientId}
              </p>
              {redirectHost ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  Redirects to <span>{redirectHost}</span>
                </p>
              ) : null}
            </div>
          </section>

          <section
            aria-labelledby="oauth-scopes-heading"
            className="grid gap-3"
          >
            <div className="flex items-center justify-between gap-3">
              <h2
                id="oauth-scopes-heading"
                className="text-sm font-medium text-foreground"
              >
                Requested access
              </h2>
              <Badge variant="outline">
                {scopes.length} {scopes.length === 1 ? "scope" : "scopes"}
              </Badge>
            </div>

            {scopes.length > 0 ? (
              <ul className="grid gap-2">
                {scopes.map((scope) => (
                  <li
                    key={scope}
                    className="rounded-xl border border-border/70 px-3 py-2"
                  >
                    <p className="text-sm font-medium text-foreground">
                      {getScopeLabel(scope)}
                    </p>
                    <p className="mt-1 font-mono text-xs text-muted-foreground">
                      {scope}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="rounded-xl border border-border/70 px-3 py-2 text-sm text-muted-foreground">
                No specific scopes were requested.
              </p>
            )}
          </section>

          {errorNotice ? (
            <Alert variant="destructive">
              <AlertTitle>{errorNotice.title}</AlertTitle>
              <AlertDescription>{errorNotice.description}</AlertDescription>
            </Alert>
          ) : null}

          <div className="grid gap-3 sm:grid-cols-2">
            {/* Security-sensitive consent should only fire from focused buttons, not route hotkeys. */}
            <Button
              type="button"
              size="lg"
              disabled={submittingAction !== null}
              loading={submittingAction === "deny"}
              variant="outline"
              onClick={() => {
                void submitConsent("deny");
              }}
            >
              Deny
            </Button>
            <Button
              type="button"
              size="lg"
              disabled={submittingAction !== null}
              loading={submittingAction === "allow"}
              onClick={() => {
                void submitConsent("allow");
              }}
            >
              Allow
            </Button>
          </div>
        </div>
      </EntrySurfaceCard>
    </EntryShell>
  );
}
