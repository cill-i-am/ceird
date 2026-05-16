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
  readonly search: OAuthConsentSearch;
}

type ConsentAction = "allow" | "deny";

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

function getSafeConsentErrorText(action: ConsentAction): string {
  return action === "allow"
    ? "We couldn't approve this request. Return to the app or agent and try again."
    : "We couldn't deny this request. Return to the app or agent and try again.";
}

export function OAuthConsentPage({ search }: OAuthConsentPageProps) {
  const [submittingAction, setSubmittingAction] =
    useState<ConsentAction | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);
  const clientId = search.client_id?.trim();
  const scopes = splitScopes(search.scope);
  const redirectHost = getRedirectHost(search.redirect_uri);

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

    setErrorText(null);
    setSubmittingAction(action);

    try {
      const result = await authClient.oauth2.consent({
        accept: action === "allow",
      });
      const redirectUrl = result.data?.url;

      if (result.error || !redirectUrl) {
        setErrorText(getSafeConsentErrorText(action));
        setSubmittingAction(null);
        return;
      }

      window.location.assign(redirectUrl);
      return;
    } catch {
      setErrorText(getSafeConsentErrorText(action));
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

          {errorText ? (
            <Alert variant="destructive">
              <AlertTitle>Authorization failed</AlertTitle>
              <AlertDescription>{errorText}</AlertDescription>
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
