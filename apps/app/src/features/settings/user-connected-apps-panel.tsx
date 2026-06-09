import type { ConnectedAppGrant } from "@ceird/identity-core";
import {
  ArrowReloadHorizontalIcon,
  Cancel01Icon,
  LinkSquare01Icon,
  LogoutIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import * as React from "react";

import { AppUtilityPanel } from "#/components/app-utility-panel";
import { Alert, AlertDescription, AlertTitle } from "#/components/ui/alert";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Skeleton } from "#/components/ui/skeleton";
import { beginMutationFeedback } from "#/lib/mutation-feedback";

import {
  disconnectConnectedAppGrant,
  listConnectedAppGrants,
} from "./user-connected-apps-api";

type ConnectedAppsLoadState =
  | {
      readonly grants: readonly ConnectedAppGrant[];
      readonly status: "error";
    }
  | {
      readonly grants: readonly ConnectedAppGrant[];
      readonly status: "loading" | "ready";
    };

type ConnectedAppsMessage = {
  readonly text: string;
  readonly tone: "destructive" | "neutral";
} | null;

const CONNECTED_APP_DATE_FORMATTER = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

export function UserConnectedAppsPanel() {
  const [loadState, setLoadState] = React.useState<ConnectedAppsLoadState>({
    grants: [],
    status: "loading",
  });
  const [confirmingGrantId, setConfirmingGrantId] = React.useState<
    string | null
  >(null);
  const [pendingGrantId, setPendingGrantId] = React.useState<string | null>(
    null
  );
  const [message, setMessage] = React.useState<ConnectedAppsMessage>(null);

  const loadConnectedApps = React.useCallback(async () => {
    setLoadState((state) => ({
      grants: state.grants,
      status: "loading",
    }));

    try {
      const response = await listConnectedAppGrants();

      setLoadState({
        grants: response.grants,
        status: "ready",
      });
    } catch {
      setLoadState({ grants: [], status: "error" });
    }
  }, []);

  React.useEffect(() => {
    void loadConnectedApps();
  }, [loadConnectedApps]);

  async function handleDisconnect(grant: ConnectedAppGrant) {
    if (pendingGrantId !== null) {
      return;
    }

    if (confirmingGrantId !== grant.grantId) {
      setMessage(null);
      setConfirmingGrantId(grant.grantId);
      return;
    }

    setPendingGrantId(grant.grantId);
    setMessage(null);

    const mutationFeedback = beginMutationFeedback();

    try {
      await disconnectConnectedAppGrant({ grantId: grant.grantId });
      await mutationFeedback.waitForSuccess();
      setConfirmingGrantId(null);
      setMessage({ text: "Connected app disconnected.", tone: "neutral" });
      await loadConnectedApps();
    } catch {
      setMessage({
        text: "We couldn't disconnect that app. Please try again.",
        tone: "destructive",
      });
    } finally {
      setPendingGrantId(null);
    }
  }

  const { grants } = loadState;

  return (
    <AppUtilityPanel
      title="Connected apps"
      description="Review external apps and MCP clients that can access your account or workspace."
      actions={
        loadState.status === "ready" ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={pendingGrantId !== null}
            onClick={() => void loadConnectedApps()}
          >
            <HugeiconsIcon
              icon={ArrowReloadHorizontalIcon}
              strokeWidth={2}
              data-icon="inline-start"
            />
            Refresh
          </Button>
        ) : null
      }
    >
      {message ? (
        <p
          className={
            message.tone === "destructive"
              ? "text-sm text-destructive"
              : "text-sm text-muted-foreground"
          }
          role={message.tone === "destructive" ? "alert" : "status"}
        >
          {message.text}
        </p>
      ) : null}

      {loadState.status === "loading" ? <ConnectedAppsSkeletonList /> : null}

      {loadState.status === "error" ? (
        <Alert variant="destructive">
          <AlertTitle>Connected apps unavailable</AlertTitle>
          <AlertDescription>
            We couldn't load connected apps. Please try again.
          </AlertDescription>
          <div className="mt-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void loadConnectedApps()}
            >
              Try again
            </Button>
          </div>
        </Alert>
      ) : null}

      {loadState.status === "ready" ? (
        <ConnectedAppsReadyContent
          grants={grants}
          confirmingGrantId={confirmingGrantId}
          pendingGrantId={pendingGrantId}
          onCancel={() => setConfirmingGrantId(null)}
          onDisconnect={(grant) => void handleDisconnect(grant)}
        />
      ) : null}
    </AppUtilityPanel>
  );
}

function ConnectedAppsReadyContent({
  grants,
  confirmingGrantId,
  pendingGrantId,
  onCancel,
  onDisconnect,
}: {
  readonly grants: readonly ConnectedAppGrant[];
  readonly confirmingGrantId: string | null;
  readonly pendingGrantId: string | null;
  readonly onCancel: () => void;
  readonly onDisconnect: (grant: ConnectedAppGrant) => void;
}) {
  if (grants.length === 0) {
    return (
      <div className="rounded-[calc(var(--radius)*2)] border border-border/60 bg-muted/30 px-4 py-3">
        <p className="text-sm font-medium text-foreground">
          No connected apps yet.
        </p>
      </div>
    );
  }

  return (
    <React.Fragment>
      <ConnectedAppsSummary grants={grants} />
      <ul className="overflow-hidden rounded-[calc(var(--radius)*2)] border border-border/60">
        {grants.map((grant) => (
          <ConnectedAppRow
            key={grant.grantId}
            grant={grant}
            confirming={confirmingGrantId === grant.grantId}
            pending={pendingGrantId === grant.grantId}
            disabled={pendingGrantId !== null}
            onCancel={onCancel}
            onDisconnect={() => onDisconnect(grant)}
          />
        ))}
      </ul>
    </React.Fragment>
  );
}

function ConnectedAppsSummary({
  grants,
}: {
  readonly grants: readonly ConnectedAppGrant[];
}) {
  const offlineGrantCount = grants.filter(
    (grant) => grant.offlineAccess
  ).length;
  const activeTokenCount = grants.reduce(
    (total, grant) =>
      total + grant.activeAccessTokenCount + grant.activeRefreshTokenCount,
    0
  );

  return (
    <div className="grid gap-3 rounded-[calc(var(--radius)*2)] border border-border/60 bg-muted/30 px-4 py-3 sm:grid-cols-3">
      <ConnectedAppsSummaryMetric
        label="Connected apps"
        value={`${grants.length} ${grants.length === 1 ? "app" : "apps"}`}
      />
      <ConnectedAppsSummaryMetric
        label="Offline access"
        value={
          offlineGrantCount > 0
            ? `${offlineGrantCount} ${offlineGrantCount === 1 ? "app" : "apps"}`
            : "None"
        }
      />
      <ConnectedAppsSummaryMetric
        label="Active tokens"
        value={`${activeTokenCount} ${
          activeTokenCount === 1 ? "active token" : "active tokens"
        }`}
      />
    </div>
  );
}

function ConnectedAppsSummaryMetric({
  label,
  value,
}: {
  readonly label: string;
  readonly value: string;
}) {
  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground uppercase">
        {label}
      </p>
      <p className="mt-1 text-sm font-medium text-foreground">{value}</p>
    </div>
  );
}

function ConnectedAppRow({
  grant,
  confirming,
  pending,
  disabled,
  onCancel,
  onDisconnect,
}: {
  readonly confirming: boolean;
  readonly disabled: boolean;
  readonly grant: ConnectedAppGrant;
  readonly pending: boolean;
  readonly onCancel: () => void;
  readonly onDisconnect: () => void;
}) {
  const activeTokenCount =
    grant.activeAccessTokenCount + grant.activeRefreshTokenCount;

  return (
    <li className="flex flex-col gap-3 border-b border-border/60 p-4 last:border-b-0 lg:flex-row lg:items-start lg:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-[calc(var(--radius)*1.5)] border border-border/60 bg-muted/40 text-muted-foreground">
            <HugeiconsIcon icon={LinkSquare01Icon} strokeWidth={2} />
          </span>
          <div className="min-w-0">
            <p className="font-medium break-words text-foreground">
              {getConnectedAppName(grant)}
            </p>
            <p className="text-sm break-all text-muted-foreground">
              {grant.clientId}
            </p>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Badge variant="secondary">
            {getConnectedAppContextLabel(grant)}
          </Badge>
          {grant.scopeGroups.map((group) => (
            <Badge key={group.key} variant="outline">
              {group.label}
            </Badge>
          ))}
        </div>

        <div className="mt-3 flex flex-col gap-1 text-sm text-muted-foreground sm:flex-row sm:flex-wrap sm:gap-x-3">
          <ConnectedAppTime label="Granted" value={grant.grantedAt} />
          <ConnectedAppTime label="Updated" value={grant.updatedAt} />
          <span>
            {activeTokenCount}{" "}
            {activeTokenCount === 1 ? "active token" : "active tokens"}
          </span>
        </div>

        {grant.redirectHosts.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-2 text-sm text-muted-foreground">
            {grant.redirectHosts.map((host) => (
              <span
                key={host}
                className="rounded-[calc(var(--radius)*1.5)] bg-muted px-2 py-1 break-all"
              >
                {host}
              </span>
            ))}
          </div>
        ) : null}
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-2 lg:justify-end">
        {confirming ? (
          <React.Fragment>
            <p className="basis-full text-sm font-medium text-foreground lg:text-right">
              Disconnect this app?
            </p>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={pending}
              onClick={onCancel}
            >
              <HugeiconsIcon
                icon={Cancel01Icon}
                strokeWidth={2}
                data-icon="inline-start"
              />
              Cancel
            </Button>
          </React.Fragment>
        ) : null}
        <Button
          type="button"
          variant={confirming ? "destructive" : "outline"}
          size="sm"
          loading={pending}
          disabled={!confirming && disabled}
          onClick={onDisconnect}
        >
          <HugeiconsIcon
            icon={LogoutIcon}
            strokeWidth={2}
            data-icon="inline-start"
          />
          Disconnect app
        </Button>
      </div>
    </li>
  );
}

function ConnectedAppTime({
  label,
  value,
}: {
  readonly label: string;
  readonly value: string;
}) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return <span>{label}: Unknown</span>;
  }

  return (
    <span>
      {label}:{" "}
      <time dateTime={date.toISOString()}>
        {CONNECTED_APP_DATE_FORMATTER.format(date)}
      </time>
    </span>
  );
}

function ConnectedAppsSkeletonList() {
  return (
    <div className="flex flex-col gap-3" role="status">
      <span className="sr-only">Loading connected apps&hellip;</span>
      <Skeleton className="h-16 rounded-[calc(var(--radius)*2)]" />
      <div className="overflow-hidden rounded-[calc(var(--radius)*2)] border border-border/60">
        <Skeleton className="h-24 rounded-none border-b border-border/60" />
        <Skeleton className="h-24 rounded-none" />
      </div>
    </div>
  );
}

function getConnectedAppName(grant: ConnectedAppGrant) {
  return grant.clientName?.trim() || grant.clientId;
}

function getConnectedAppContextLabel(grant: ConnectedAppGrant) {
  return grant.context.type === "organization"
    ? grant.context.organizationName
    : "Account";
}
