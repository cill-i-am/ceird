import { Schema } from "effect";
import * as React from "react";

import { Alert, AlertDescription, AlertTitle } from "#/components/ui/alert";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Skeleton } from "#/components/ui/skeleton";
import { authClient } from "#/lib/auth-client";
import { cn } from "#/lib/utils";

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

interface OAuthPublicClientMetadata {
  readonly clientId: string;
  readonly clientName?: string | undefined;
  readonly links: readonly OAuthClientLink[];
}

interface OAuthClientLink {
  readonly href: string;
  readonly label: string;
  readonly text: string;
}

interface OAuthConsentOrganizationSummary {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
}

type ClientMetadataState =
  | {
      readonly metadata: OAuthPublicClientMetadata | null;
      readonly status: "error" | "ready";
    }
  | {
      readonly metadata: null;
      readonly status: "loading";
    };

type ActiveWorkspaceState =
  | {
      readonly activeOrganizationId: null;
      readonly organization: null;
      readonly status: "idle" | "loading";
    }
  | {
      readonly activeOrganizationId: string | null;
      readonly organization: OAuthConsentOrganizationSummary | null;
      readonly status: "ready";
    }
  | {
      readonly activeOrganizationId: null;
      readonly organization: null;
      readonly status: "error";
    };
type ClientMetadataAction =
  | {
      readonly type: "loading";
    }
  | {
      readonly metadata: OAuthPublicClientMetadata | null;
      readonly type: "ready";
    }
  | {
      readonly type: "error";
    };
type ActiveWorkspaceAction =
  | {
      readonly type: "idle";
    }
  | {
      readonly type: "loading";
    }
  | {
      readonly activeOrganizationId: string | null;
      readonly organization: OAuthConsentOrganizationSummary | null;
      readonly type: "ready";
    }
  | {
      readonly type: "error";
    };

interface ScopeGroup {
  readonly description: string;
  readonly label: string;
  readonly scopes: readonly string[];
  readonly tone: "default" | "warning";
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

const OAuthPublicClientMetadataSchema = Schema.Struct({
  client_id: Schema.String,
  client_name: Schema.optional(Schema.String),
  client_uri: Schema.optional(Schema.String),
  policy_uri: Schema.optional(Schema.String),
  tos_uri: Schema.optional(Schema.String),
});
const decodeOAuthPublicClientMetadata = Schema.decodeUnknownSync(
  OAuthPublicClientMetadataSchema
);
const OAuthConsentOrganizationSummarySchema = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  slug: Schema.String,
});
const decodeOAuthConsentOrganizationSummary = Schema.decodeUnknownSync(
  OAuthConsentOrganizationSummarySchema
);

const identityScopes = new Set(["email", "openid", "profile"]);
const offlineScopes = new Set(["offline_access", "refresh_token"]);
const knownScopes = new Set([
  "ceird:admin",
  "ceird:read",
  "ceird:write",
  ...identityScopes,
  ...offlineScopes,
]);

function splitScopes(scope: string | undefined): readonly string[] {
  const scopes = scope
    ? scope.split(" ").flatMap((value) => {
        const trimmed = value.trim();

        return trimmed ? [trimmed] : [];
      })
    : [];

  return [...new Set(scopes)];
}

function getScopeGroups(scopes: readonly string[]): readonly ScopeGroup[] {
  const groups = [
    {
      description:
        "This app or agent may administer workspace access and settings. Approve only if you expected this request.",
      label: "Administer workspace settings",
      scopes: scopes.filter((scope) => scope === "ceird:admin"),
      tone: "warning",
    },
    {
      description: "This app or agent may create or update Ceird work data.",
      label: "Change workspace data",
      scopes: scopes.filter((scope) => scope === "ceird:write"),
      tone: "warning",
    },
    {
      description:
        "This app or agent may view workspace data such as jobs, sites, labels, and options.",
      label: "View workspace data",
      scopes: scopes.filter((scope) => scope === "ceird:read"),
      tone: "default",
    },
    {
      description: "This app or agent may keep access until you revoke it.",
      label: "Keep access after this session",
      scopes: scopes.filter((scope) => offlineScopes.has(scope)),
      tone: "warning",
    },
    {
      description:
        "This app or agent may confirm who you are and read basic account details.",
      label: "Confirm your identity",
      scopes: scopes.filter((scope) => identityScopes.has(scope)),
      tone: "default",
    },
    {
      description: "Only approve if you expected this exact access request.",
      label: "Requested access Ceird does not recognize",
      scopes: scopes.filter((scope) => !knownScopes.has(scope)),
      tone: "warning",
    },
  ] satisfies readonly ScopeGroup[];

  return groups.filter((group) => group.scopes.length > 0);
}

function hasCeirdScope(scopes: readonly string[]) {
  return scopes.some((scope) => scope.startsWith("ceird:"));
}

function hasWarningScopeGroups(scopeGroups: readonly ScopeGroup[]) {
  return scopeGroups.some((group) => group.tone === "warning");
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

function getSafeClientLink(
  label: string,
  href: string | undefined
): OAuthClientLink | null {
  if (!href) {
    return null;
  }

  try {
    const url = new URL(href);
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      return null;
    }

    return {
      href: url.toString(),
      label,
      text: url.host,
    };
  } catch {
    return null;
  }
}

function getTrimmedDisplayValue(value: string | undefined) {
  const trimmed = value?.trim();

  return trimmed || undefined;
}

function readOAuthPublicClientMetadata(
  input: unknown,
  expectedClientId: string
): OAuthPublicClientMetadata | null {
  try {
    const client = decodeOAuthPublicClientMetadata(input);

    if (client.client_id !== expectedClientId) {
      return null;
    }

    return {
      clientId: client.client_id,
      clientName: getTrimmedDisplayValue(client.client_name),
      links: [
        getSafeClientLink("Website", client.client_uri),
        getSafeClientLink("Privacy", client.policy_uri),
        getSafeClientLink("Terms", client.tos_uri),
      ].filter((link): link is OAuthClientLink => link !== null),
    };
  } catch {
    return null;
  }
}

function readActiveOrganizationId(
  input: Awaited<ReturnType<typeof authClient.getSession>>
) {
  if (input.error) {
    throw input.error;
  }

  const activeOrganizationId = input.data?.session.activeOrganizationId;

  return typeof activeOrganizationId === "string" && activeOrganizationId.trim()
    ? activeOrganizationId.trim()
    : null;
}

function readOrganizationSummaries(
  input: Awaited<ReturnType<typeof authClient.organization.list>>
): readonly OAuthConsentOrganizationSummary[] {
  if (input.error) {
    throw input.error;
  }

  if (!input.data) {
    return [];
  }

  return input.data.flatMap((organization: unknown) => {
    try {
      return [decodeOAuthConsentOrganizationSummary(organization)];
    } catch {
      return [];
    }
  });
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

  if (isActiveOrganizationRequiredError(consentError)) {
    return {
      title: "Choose a workspace first",
      description:
        "Select a Ceird workspace, then return to the app or agent and start a fresh authorization request.",
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

function isActiveOrganizationRequiredError(
  error: OAuthConsentClientError | undefined
): boolean {
  return matchesConsentError(error, [
    "OAUTH_ACTIVE_ORGANIZATION_REQUIRED",
    "active organization",
    "choose a workspace",
  ]);
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

function clientMetadataReducer(
  _state: ClientMetadataState,
  action: ClientMetadataAction
): ClientMetadataState {
  switch (action.type) {
    case "loading": {
      return { metadata: null, status: "loading" };
    }
    case "ready": {
      return action.metadata
        ? { metadata: action.metadata, status: "ready" }
        : { metadata: null, status: "error" };
    }
    case "error": {
      return { metadata: null, status: "error" };
    }
    default: {
      return assertNeverClientMetadataAction(action);
    }
  }
}

function activeWorkspaceReducer(
  _state: ActiveWorkspaceState,
  action: ActiveWorkspaceAction
): ActiveWorkspaceState {
  switch (action.type) {
    case "idle": {
      return {
        activeOrganizationId: null,
        organization: null,
        status: "idle",
      };
    }
    case "loading": {
      return {
        activeOrganizationId: null,
        organization: null,
        status: "loading",
      };
    }
    case "ready": {
      return {
        activeOrganizationId: action.activeOrganizationId,
        organization: action.organization,
        status: "ready",
      };
    }
    case "error": {
      return {
        activeOrganizationId: null,
        organization: null,
        status: "error",
      };
    }
    default: {
      return assertNeverActiveWorkspaceAction(action);
    }
  }
}

function assertNeverClientMetadataAction(action: never): never {
  throw new Error(
    `Unhandled OAuth client metadata action: ${JSON.stringify(action)}`
  );
}

function assertNeverActiveWorkspaceAction(action: never): never {
  throw new Error(
    `Unhandled OAuth active workspace action: ${JSON.stringify(action)}`
  );
}

export function OAuthConsentPage({ rawSearch, search }: OAuthConsentPageProps) {
  const [submittingAction, setSubmittingAction] =
    React.useState<ConsentAction | null>(null);
  const [errorNotice, setErrorNotice] =
    React.useState<ConsentErrorNotice | null>(null);
  const [clientMetadataState, dispatchClientMetadata] = React.useReducer(
    clientMetadataReducer,
    {
      metadata: null,
      status: "loading",
    }
  );
  const [workspaceState, dispatchActiveWorkspace] = React.useReducer(
    activeWorkspaceReducer,
    {
      activeOrganizationId: null,
      organization: null,
      status: "idle",
    }
  );
  const verifiedSearch = getVerifiedConsentSearch(
    search,
    rawSearch ?? getBrowserSearch()
  );
  const oauthQuery = getOAuthQuery(rawSearch ?? getBrowserSearch());
  const clientId = verifiedSearch.client_id?.trim();
  const scopes = React.useMemo(
    () => splitScopes(verifiedSearch.scope),
    [verifiedSearch.scope]
  );
  const scopeKey = scopes.join(" ");
  const scopeGroups = React.useMemo(() => getScopeGroups(scopes), [scopes]);
  const requiresWorkspace = hasCeirdScope(scopes);
  const redirectHost = getRedirectHost(verifiedSearch.redirect_uri);
  const isWorkspaceApprovalBlocked =
    requiresWorkspace &&
    (workspaceState.status !== "ready" ||
      workspaceState.activeOrganizationId === null);

  React.useEffect(() => {
    if (!clientId) {
      return;
    }

    let cancelled = false;
    dispatchClientMetadata({ type: "loading" });

    void (async () => {
      try {
        const result = await authClient.oauth2.publicClient({
          query: {
            client_id: clientId,
          },
        });

        if (cancelled) {
          return;
        }

        const metadata =
          result.error || !result.data
            ? null
            : readOAuthPublicClientMetadata(result.data, clientId);

        dispatchClientMetadata({ metadata, type: "ready" });
      } catch {
        if (!cancelled) {
          dispatchClientMetadata({ type: "error" });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [clientId]);

  React.useEffect(() => {
    if (!requiresWorkspace) {
      dispatchActiveWorkspace({ type: "idle" });
      return;
    }

    let cancelled = false;
    dispatchActiveWorkspace({ type: "loading" });

    void (async () => {
      try {
        const activeOrganizationId = readActiveOrganizationId(
          await authClient.getSession()
        );

        if (!activeOrganizationId) {
          if (!cancelled) {
            dispatchActiveWorkspace({
              activeOrganizationId: null,
              organization: null,
              type: "ready",
            });
          }
          return;
        }

        let activeOrganization: OAuthConsentOrganizationSummary | null = null;

        try {
          const organizations = readOrganizationSummaries(
            await authClient.organization.list()
          );
          activeOrganization =
            organizations.find(
              (organization) => organization.id === activeOrganizationId
            ) ?? null;
        } catch {
          activeOrganization = null;
        }

        if (!cancelled) {
          dispatchActiveWorkspace({
            activeOrganizationId,
            organization: activeOrganization,
            type: "ready",
          });
        }
      } catch {
        if (!cancelled) {
          dispatchActiveWorkspace({ type: "error" });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [requiresWorkspace, scopeKey]);

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
    if (
      submittingAction !== null ||
      (action === "allow" && isWorkspaceApprovalBlocked)
    ) {
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
            <ClientDetailsSection
              clientId={clientId}
              metadataState={clientMetadataState}
              redirectHost={redirectHost}
            />
          </section>

          <WorkspaceSection
            requiresWorkspace={requiresWorkspace}
            state={workspaceState}
          />

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
              <ScopeGroupsSection scopeGroups={scopeGroups} />
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
              disabled={submittingAction !== null || isWorkspaceApprovalBlocked}
              loading={submittingAction === "allow"}
              onClick={() => {
                void submitConsent("allow");
              }}
            >
              Allow access
            </Button>
          </div>
        </div>
      </EntrySurfaceCard>
    </EntryShell>
  );
}

function ClientDetailsSection({
  clientId,
  metadataState,
  redirectHost,
}: {
  readonly clientId: string;
  readonly metadataState: ClientMetadataState;
  readonly redirectHost: string | undefined;
}) {
  const { metadata } = metadataState;
  const displayName = metadata?.clientName ?? clientId;
  const hasDisplayName = metadata?.clientName !== undefined;

  return (
    <React.Fragment>
      <h2
        id="oauth-client-heading"
        className="text-sm font-medium text-foreground"
      >
        Requesting client
      </h2>
      <div className="rounded-xl border border-border/70 bg-muted/30 px-3 py-2">
        <p
          className={cn(
            "text-sm break-all text-foreground",
            hasDisplayName ? "font-medium" : "font-mono"
          )}
        >
          {displayName}
        </p>
        {hasDisplayName ? (
          <p className="mt-1 font-mono text-xs break-all text-muted-foreground">
            {clientId}
          </p>
        ) : null}
        {redirectHost ? (
          <p className="mt-1 text-xs text-muted-foreground">
            Redirects to <span>{redirectHost}</span>
          </p>
        ) : null}
        {metadataState.status === "loading" ? (
          <div className="mt-3 grid gap-2" aria-label="Loading client details">
            <Skeleton className="h-3 w-40 rounded-md" />
            <Skeleton className="h-3 w-56 rounded-md" />
          </div>
        ) : null}
        {metadataState.status === "error" ? (
          <p className="mt-2 text-xs text-muted-foreground">
            Client details unavailable. Showing the signed authorization
            request.
          </p>
        ) : null}
        {metadata?.links.length ? (
          <dl className="mt-3 grid gap-1 text-xs">
            {metadata.links.map((link) => (
              <div key={link.label} className="flex min-w-0 gap-2">
                <dt className="shrink-0 text-muted-foreground">{link.label}</dt>
                <dd className="min-w-0">
                  <a
                    className="break-all text-foreground underline underline-offset-3 hover:text-primary"
                    href={link.href}
                    rel="noreferrer"
                    target="_blank"
                  >
                    {link.text}
                  </a>
                </dd>
              </div>
            ))}
          </dl>
        ) : null}
      </div>
    </React.Fragment>
  );
}

function WorkspaceSection({
  requiresWorkspace,
  state,
}: {
  readonly requiresWorkspace: boolean;
  readonly state: ActiveWorkspaceState;
}) {
  if (!requiresWorkspace) {
    return null;
  }

  return (
    <section aria-labelledby="oauth-workspace-heading" className="grid gap-2">
      <h2
        id="oauth-workspace-heading"
        className="text-sm font-medium text-foreground"
      >
        Workspace
      </h2>
      {state.status === "loading" ? (
        <div
          className="grid gap-2 rounded-xl border border-border/70 p-3"
          aria-label="Checking active workspace"
        >
          <Skeleton className="h-4 w-36 rounded-md" />
          <Skeleton className="h-3 w-52 rounded-md" />
        </div>
      ) : null}
      {state.status === "error" ? (
        <Alert variant="warning">
          <AlertTitle>Workspace could not be confirmed</AlertTitle>
          <AlertDescription>
            We could not confirm your active workspace. Select a workspace in
            Ceird, then return to the app or agent and start a fresh
            authorization request.
          </AlertDescription>
        </Alert>
      ) : null}
      {state.status === "ready" && state.activeOrganizationId === null ? (
        <Alert variant="warning">
          <AlertTitle>Choose a workspace first</AlertTitle>
          <AlertDescription>
            This request can access Ceird workspace data. Select a workspace in
            Ceird, then return to the app or agent and start a fresh
            authorization request.
          </AlertDescription>
        </Alert>
      ) : null}
      {state.status === "ready" && state.activeOrganizationId !== null ? (
        <div className="rounded-xl border border-border/70 bg-muted/30 px-3 py-2">
          <p className="text-sm font-medium text-foreground">
            {state.organization?.name ?? "Active workspace confirmed"}
          </p>
          {state.organization?.slug ? (
            <p className="mt-1 text-xs text-muted-foreground">
              {state.organization.slug}
            </p>
          ) : (
            <p className="mt-1 text-xs text-muted-foreground">
              Workspace details unavailable.
            </p>
          )}
          <p className="mt-2 text-xs text-muted-foreground">
            This approval will be scoped to the active workspace.
          </p>
        </div>
      ) : null}
    </section>
  );
}

function ScopeGroupsSection({
  scopeGroups,
}: {
  readonly scopeGroups: readonly ScopeGroup[];
}) {
  return (
    <React.Fragment>
      {hasWarningScopeGroups(scopeGroups) ? (
        <Alert variant="warning">
          <AlertTitle>Review high-risk access</AlertTitle>
          <AlertDescription>
            This request includes access that can change data, administer a
            workspace, or continue after this browser session.
          </AlertDescription>
        </Alert>
      ) : null}
      <ul className="grid gap-2">
        {scopeGroups.map((group) => (
          <li
            key={group.label}
            className={cn(
              "rounded-xl border px-3 py-2",
              group.tone === "warning"
                ? "border-warning/30 bg-warning/10"
                : "border-border/70"
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm font-medium text-foreground">
                {group.label}
              </p>
              {group.tone === "warning" ? (
                <Badge variant="destructive">Review</Badge>
              ) : null}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {group.description}
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {group.scopes.map((scope) => (
                <Badge key={scope} className="font-mono" variant="outline">
                  {scope}
                </Badge>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </React.Fragment>
  );
}
