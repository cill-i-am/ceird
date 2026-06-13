import { Cancel01Icon, LogoutIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import * as React from "react";

import { AppUtilityPanel } from "#/components/app-utility-panel";
import { Alert, AlertDescription, AlertTitle } from "#/components/ui/alert";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Skeleton } from "#/components/ui/skeleton";
import { authClient } from "#/lib/auth-client";
import { beginMutationFeedback } from "#/lib/mutation-feedback";

type ListSessionsResult = Awaited<ReturnType<typeof authClient.listSessions>>;
type AuthSession = NonNullable<ListSessionsResult["data"]>[number];
type CurrentSessionResult = Awaited<ReturnType<typeof authClient.getSession>>;
type CurrentSession = NonNullable<
  NonNullable<CurrentSessionResult["data"]>["session"]
>;

interface UserSecuritySession {
  readonly createdAt: Date | null;
  readonly deviceLabel: string;
  readonly expiresAt: Date | null;
  readonly isCurrent: boolean;
  readonly token: string;
  readonly updatedAt: Date | null;
}

type SessionsLoadState =
  | {
      readonly status: "error";
      readonly sessions: readonly UserSecuritySession[];
    }
  | {
      readonly status: "loading" | "ready";
      readonly sessions: readonly UserSecuritySession[];
    };

type SessionsMessage = {
  readonly text: string;
  readonly tone: "destructive" | "neutral";
} | null;

const REVOKE_OTHER_SESSIONS_ACTION_ID = "__ceird_revoke_other_sessions__";
const SESSION_DATE_FORMATTER = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

export function UserSecuritySessionsPanel() {
  const [loadState, setLoadState] = React.useState<SessionsLoadState>({
    sessions: [],
    status: "loading",
  });
  const [confirmingToken, setConfirmingToken] = React.useState<string | null>(
    null
  );
  const [pendingToken, setPendingToken] = React.useState<string | null>(null);
  const [message, setMessage] = React.useState<SessionsMessage>(null);

  const loadSessions = React.useCallback(async () => {
    setLoadState((state) => ({
      sessions: state.sessions,
      status: "loading",
    }));

    // react-doctor-disable-next-line
    const [currentSessionResult, sessionsResult] = await Promise.all([
      authClient.getSession(),
      authClient.listSessions(),
    ]).catch(() => [null, null] as const);

    if (!sessionsResult || sessionsResult.error || !sessionsResult.data) {
      setLoadState({ sessions: [], status: "error" });
      return;
    }

    if (
      !currentSessionResult ||
      currentSessionResult.error ||
      !currentSessionResult.data?.session
    ) {
      setLoadState({ sessions: [], status: "error" });
      return;
    }

    const currentSession = currentSessionResult.data.session;
    setLoadState({
      sessions: toUserSecuritySessions(sessionsResult.data, {
        id: readSessionId(currentSession),
        token: readSessionToken(currentSession),
      }),
      status: "ready",
    });
  }, []);

  React.useEffect(() => {
    void loadSessions();
  }, [loadSessions]);

  async function handleRevokeSession(session: UserSecuritySession) {
    if (session.isCurrent || pendingToken !== null) {
      return;
    }

    if (confirmingToken !== session.token) {
      setMessage(null);
      setConfirmingToken(session.token);
      return;
    }

    setPendingToken(session.token);
    setMessage(null);

    const mutationFeedback = beginMutationFeedback();
    const result = await authClient.revokeSession({ token: session.token });

    if (result.error) {
      setMessage({
        text: "We couldn't revoke that session. Please try again.",
        tone: "destructive",
      });
      setPendingToken(null);
      return;
    }

    await mutationFeedback.waitForSuccess();
    setConfirmingToken(null);
    setMessage({ text: "Session revoked.", tone: "neutral" });
    await loadSessions();
    setPendingToken(null);
  }

  async function handleRevokeOtherSessions() {
    if (pendingToken !== null) {
      return;
    }

    if (confirmingToken !== REVOKE_OTHER_SESSIONS_ACTION_ID) {
      setMessage(null);
      setConfirmingToken(REVOKE_OTHER_SESSIONS_ACTION_ID);
      return;
    }

    setPendingToken(REVOKE_OTHER_SESSIONS_ACTION_ID);
    setMessage(null);

    const mutationFeedback = beginMutationFeedback();
    const result = await authClient.revokeOtherSessions();

    if (result.error) {
      setMessage({
        text: "We couldn't revoke other sessions. Please try again.",
        tone: "destructive",
      });
      setPendingToken(null);
      return;
    }

    await mutationFeedback.waitForSuccess();
    setConfirmingToken(null);
    setMessage({ text: "Other sessions revoked.", tone: "neutral" });
    await loadSessions();
    setPendingToken(null);
  }

  const { sessions } = loadState;
  const otherSessionsCount = sessions.filter(
    (session) => !session.isCurrent
  ).length;
  const isBulkConfirming = confirmingToken === REVOKE_OTHER_SESSIONS_ACTION_ID;
  const isBulkPending = pendingToken === REVOKE_OTHER_SESSIONS_ACTION_ID;

  return (
    <AppUtilityPanel
      title="Active sessions"
      description="Review where your account is signed in and revoke sessions from devices you no longer use."
      actions={
        loadState.status === "ready" && otherSessionsCount > 0 ? (
          <SessionBulkActions
            confirming={isBulkConfirming}
            pending={isBulkPending}
            onCancel={() => setConfirmingToken(null)}
            onRevoke={() => void handleRevokeOtherSessions()}
          />
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

      {loadState.status === "loading" ? <SessionSkeletonList /> : null}

      {loadState.status === "error" ? (
        <Alert variant="destructive">
          <AlertTitle>Sessions unavailable</AlertTitle>
          <AlertDescription>
            We couldn't load active sessions. Please try again.
          </AlertDescription>
          <div className="mt-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void loadSessions()}
            >
              Try again
            </Button>
          </div>
        </Alert>
      ) : null}

      {loadState.status === "ready" ? (
        <React.Fragment>
          <SessionSummary
            sessionsCount={sessions.length}
            otherSessionsCount={otherSessionsCount}
          />
          <ul className="overflow-hidden rounded-[calc(var(--radius)*2)] border border-border/60">
            {sessions.map((session) => (
              <SessionRow
                key={session.token}
                session={session}
                confirming={confirmingToken === session.token}
                pending={pendingToken === session.token}
                disabled={pendingToken !== null}
                onCancel={() => setConfirmingToken(null)}
                onRevoke={() => void handleRevokeSession(session)}
              />
            ))}
          </ul>
        </React.Fragment>
      ) : null}
    </AppUtilityPanel>
  );
}

function SessionBulkActions({
  confirming,
  pending,
  onCancel,
  onRevoke,
}: {
  readonly confirming: boolean;
  readonly pending: boolean;
  readonly onCancel: () => void;
  readonly onRevoke: () => void;
}) {
  if (!confirming) {
    return (
      <Button type="button" variant="outline" size="sm" onClick={onRevoke}>
        <HugeiconsIcon
          icon={LogoutIcon}
          strokeWidth={2}
          data-icon="inline-start"
        />
        Revoke other sessions
      </Button>
    );
  }

  return (
    <fieldset className="m-0 flex min-w-0 flex-wrap items-center gap-2 border-0 p-0">
      <legend className="sr-only">Confirm revoking other sessions</legend>
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
      <Button
        type="button"
        variant="destructive"
        size="sm"
        loading={pending}
        onClick={onRevoke}
      >
        <HugeiconsIcon
          icon={LogoutIcon}
          strokeWidth={2}
          data-icon="inline-start"
        />
        Revoke other sessions
      </Button>
    </fieldset>
  );
}

function SessionSummary({
  sessionsCount,
  otherSessionsCount,
}: {
  readonly sessionsCount: number;
  readonly otherSessionsCount: number;
}) {
  return (
    <div className="grid gap-3 rounded-[calc(var(--radius)*2)] border border-border/60 bg-muted/30 px-4 py-3 sm:grid-cols-2">
      <div>
        <p className="text-xs font-medium text-muted-foreground uppercase">
          Active sessions
        </p>
        <p className="mt-1 text-sm font-medium text-foreground">
          {sessionsCount} {sessionsCount === 1 ? "session" : "sessions"}
        </p>
      </div>
      <div>
        <p className="text-xs font-medium text-muted-foreground uppercase">
          Other devices
        </p>
        <p className="mt-1 text-sm font-medium text-foreground">
          {otherSessionsCount > 0
            ? `${otherSessionsCount} ${
                otherSessionsCount === 1 ? "session" : "sessions"
              }`
            : "No other active sessions."}
        </p>
      </div>
    </div>
  );
}

function SessionRow({
  session,
  confirming,
  pending,
  disabled,
  onCancel,
  onRevoke,
}: {
  readonly confirming: boolean;
  readonly disabled: boolean;
  readonly pending: boolean;
  readonly session: UserSecuritySession;
  readonly onCancel: () => void;
  readonly onRevoke: () => void;
}) {
  return (
    <li className="flex flex-col gap-3 border-b border-border/60 p-4 last:border-b-0 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-medium text-foreground">{session.deviceLabel}</p>
          {session.isCurrent ? (
            <Badge variant="secondary">This device</Badge>
          ) : null}
        </div>
        <div className="mt-1 flex flex-col gap-1 text-sm text-muted-foreground sm:flex-row sm:flex-wrap sm:gap-x-3">
          <SessionTime label="Last active" value={session.updatedAt} />
          <SessionTime label="Created" value={session.createdAt} />
        </div>
        {session.isCurrent ? (
          <p className="mt-2 text-sm text-muted-foreground">
            Sign out from the account menu to end this session.
          </p>
        ) : null}
      </div>

      {session.isCurrent ? null : (
        <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
          {confirming ? (
            <React.Fragment>
              <p className="basis-full text-sm font-medium text-foreground sm:text-right">
                Revoke this session?
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
            onClick={onRevoke}
          >
            <HugeiconsIcon
              icon={LogoutIcon}
              strokeWidth={2}
              data-icon="inline-start"
            />
            Revoke session
          </Button>
        </div>
      )}
    </li>
  );
}

function SessionTime({
  label,
  value,
}: {
  readonly label: string;
  readonly value: Date | null;
}) {
  if (!value) {
    return <span>{label}: Unknown</span>;
  }

  return (
    <span>
      {label}:{" "}
      <time dateTime={value.toISOString()}>{formatSessionDate(value)}</time>
    </span>
  );
}

function SessionSkeletonList() {
  return (
    <div className="flex flex-col gap-3" aria-busy="true" aria-live="polite">
      <output className="sr-only">Loading active sessions&hellip;</output>
      <Skeleton className="h-16 rounded-[calc(var(--radius)*2)]" />
      <div className="overflow-hidden rounded-[calc(var(--radius)*2)] border border-border/60">
        <Skeleton className="h-20 rounded-none border-b border-border/60" />
        <Skeleton className="h-20 rounded-none" />
      </div>
    </div>
  );
}

function toUserSecuritySessions(
  sessions: readonly AuthSession[],
  currentSession: {
    readonly id: string | null;
    readonly token: string | null;
  }
) {
  return sessions
    .flatMap((session) => {
      const token = readSessionToken(session);
      const id = readSessionId(session);
      if (!token) {
        return [];
      }

      return [
        {
          createdAt: parseSessionDate(session.createdAt),
          deviceLabel: getSessionDeviceLabel(session.userAgent),
          expiresAt: parseSessionDate(session.expiresAt),
          isCurrent:
            currentSession.token === token ||
            (id !== null && id === currentSession.id),
          token,
          updatedAt: parseSessionDate(session.updatedAt),
        } satisfies UserSecuritySession,
      ];
    })
    .toSorted(compareUserSecuritySessions);
}

function compareUserSecuritySessions(
  left: UserSecuritySession,
  right: UserSecuritySession
) {
  if (left.isCurrent !== right.isCurrent) {
    return left.isCurrent ? -1 : 1;
  }

  return getSessionSortTime(right) - getSessionSortTime(left);
}

function getSessionSortTime(session: UserSecuritySession) {
  return (
    session.updatedAt?.getTime() ??
    session.createdAt?.getTime() ??
    session.expiresAt?.getTime() ??
    0
  );
}

function readSessionToken(
  session:
    | Pick<AuthSession, "token">
    | Pick<CurrentSession, "token">
    | null
    | undefined
) {
  return typeof session?.token === "string" && session.token.length > 0
    ? session.token
    : null;
}

function readSessionId(
  session:
    | Pick<AuthSession, "id">
    | Pick<CurrentSession, "id">
    | null
    | undefined
) {
  return typeof session?.id === "string" && session.id.length > 0
    ? session.id
    : null;
}

function parseSessionDate(value: Date | string | null | undefined) {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (typeof value !== "string") {
    return null;
  }

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatSessionDate(date: Date) {
  return SESSION_DATE_FORMATTER.format(date);
}

export function getSessionDeviceLabel(userAgent: string | null | undefined) {
  const normalizedUserAgent = userAgent ?? undefined;
  const browser = getBrowserFamily(normalizedUserAgent);
  const device = getDeviceFamily(normalizedUserAgent);

  if (browser && device) {
    return `${browser} on ${device}`;
  }

  if (browser) {
    return browser;
  }

  if (device) {
    return `${device} device`;
  }

  return "Unknown device";
}

function getBrowserFamily(userAgent = "") {
  if (/\bEdg\//.test(userAgent)) {
    return "Edge";
  }

  if (/\bFirefox\//.test(userAgent)) {
    return "Firefox";
  }

  if (/\bChrome\//.test(userAgent) || /\bCriOS\//.test(userAgent)) {
    return "Chrome";
  }

  if (/\bVersion\/[\d.]+.*\bSafari\//.test(userAgent)) {
    return "Safari";
  }

  return null;
}

function getDeviceFamily(userAgent = "") {
  if (/\bAndroid\b/.test(userAgent)) {
    return "Android";
  }

  if (/\biPhone\b|\biPad\b|\biPod\b/.test(userAgent)) {
    return "iOS";
  }

  if (/\bMacintosh\b|\bMac OS X\b/.test(userAgent)) {
    return "macOS";
  }

  if (/\bWindows NT\b/.test(userAgent)) {
    return "Windows";
  }

  if (/\bLinux\b/.test(userAgent)) {
    return "Linux";
  }

  return null;
}
