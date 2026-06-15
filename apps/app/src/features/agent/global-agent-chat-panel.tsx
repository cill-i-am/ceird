"use client";

import {
  makeAgentProximityOriginContextBody,
  makeAgentProximityOriginContextFrame,
} from "@ceird/agents-core";
import type {
  AgentActionManifestItem,
  AgentProximityOriginContextIdType,
  PreparedAgentSession,
} from "@ceird/agents-core";
import type { OrganizationId, OrganizationRole } from "@ceird/identity-core";
import type { ProximityOriginInput } from "@ceird/proximity-core";
import {
  getToolApproval,
  getToolInput,
  getToolOutput,
  getToolPartState,
  useAgentChat,
} from "@cloudflare/ai-chat/react";
import {
  AiChat02Icon,
  AlertCircleIcon,
  Cancel01Icon,
  CheckmarkCircle02Icon,
  Clock03Icon,
  FileSearchIcon,
  SentIcon,
  ShieldUserIcon,
  Task01Icon,
  ToolsIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useAgent } from "agents/react";
import type { UIMessage } from "ai";
import { Cause, Effect, Exit, Option } from "effect";
import * as React from "react";

import { Alert, AlertDescription, AlertTitle } from "#/components/ui/alert";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import {
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "#/components/ui/drawer";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "#/components/ui/empty";
import { ResponsiveDrawer } from "#/components/ui/responsive-drawer";
import { Separator } from "#/components/ui/separator";
import { Textarea } from "#/components/ui/textarea";
import { requestCurrentLocationOrigin } from "#/features/proximity/proximity-location-access";
import { useProximityOriginDialogController } from "#/features/proximity/proximity-origin-controller";
import { ProximityOriginDialog } from "#/features/proximity/proximity-origin-dialog";
import { loadRouteProximityLocationPreferenceStatus } from "#/features/settings/route-proximity-location-preference";
import type { RouteProximityLocationPreferenceStatus } from "#/features/settings/route-proximity-location-preference";
import { updateCurrentUserPreferences } from "#/features/settings/user-preferences-api";
import { activeElementIsInside } from "#/hotkeys/focus";
import { ShortcutHint } from "#/hotkeys/hotkey-display";
import { HOTKEYS } from "#/hotkeys/hotkey-registry";
import { useAppHotkey } from "#/hotkeys/use-app-hotkey";
import { resolveAgentHost } from "#/lib/agent-origin";
import { formatBrowserGeolocationError } from "#/lib/browser-geolocation";
import type { BrowserGeolocationError } from "#/lib/browser-geolocation";
import { cn } from "#/lib/utils";

import {
  authorizeCurrentAgentThread,
  prepareCurrentAgentSession,
} from "./agent-client";
import { shouldAttachCurrentLocationToAgentMessage } from "./agent-proximity-intent";
import {
  isAgentProximityToolName,
  renderAgentProximityToolOutput,
} from "./agent-proximity-tool-renderers";

const AGENT_HOST_MISSING_MESSAGE = "The Agent Worker origin is not configured.";
const AGENT_CONNECT_TOKEN_CACHE_SAFETY_MS = 60_000;
const AGENT_CONNECT_TOKEN_MAX_CACHE_MS = 240_000;
const AGENT_PROXIMITY_CONTEXT_ID_PREFIX = "agent-origin-";
const AGENT_STARTER_PROMPTS = [
  "Find closest active jobs",
  "Show open jobs",
  "Summarize recent activity",
] as const;

function AgentIcon({
  icon,
  ...props
}: Omit<React.ComponentProps<typeof HugeiconsIcon>, "aria-hidden" | "icon"> & {
  readonly icon: React.ComponentProps<typeof HugeiconsIcon>["icon"];
}) {
  return <HugeiconsIcon aria-hidden="true" icon={icon} {...props} />;
}

interface AgentConnection {
  readonly addEventListener: (
    type: string,
    listener: (event: MessageEvent) => void,
    options?: { readonly signal?: AbortSignal }
  ) => void;
  readonly agent: string;
  readonly getHttpUrl: () => string;
  readonly name: string;
  readonly path?: readonly { readonly agent: string; readonly name: string }[];
  readonly removeEventListener: (
    type: string,
    listener: (event: MessageEvent) => void
  ) => void;
  readonly send: (data: string) => void;
}

type ChatMessage = UIMessage;
type ChatPart = UIMessage["parts"][number];
type ToolStateLabel = ReturnType<typeof getToolPartState>;

interface AgentChatSessionState {
  readonly host: string;
  readonly preparedSession: PreparedAgentSession;
}

interface ToolApprovalResponse {
  readonly approved: boolean;
  readonly id: string;
}

type AgentComposerLocationNotice =
  | { readonly status: "requesting" }
  | {
      readonly canChooseOrigin: boolean;
      readonly canShareCurrentLocation: boolean;
      readonly message: string;
      readonly status: "blocked";
    };

interface AgentSendMessageOptions {
  readonly forceEnableLocationPreference?: boolean;
  readonly originOverride?: ProximityOriginInput | undefined;
}

interface AgentConversationContextValue {
  readonly actionLookup: ReadonlyMap<string, AgentActionManifestItem>;
  readonly onToolApprovalResponse: (response: ToolApprovalResponse) => void;
}

type ThreadState =
  | { readonly error: null; readonly session: null; readonly status: "idle" }
  | { readonly error: null; readonly session: null; readonly status: "loading" }
  | {
      readonly error: null;
      readonly session: AgentChatSessionState;
      readonly status: "ready";
    }
  | {
      readonly error: string;
      readonly session: null;
      readonly status: "error";
    };

const loadingThreadState: ThreadState = {
  error: null,
  session: null,
  status: "loading",
};

const TOOL_STATE_LABELS = {
  approved: "Approved",
  complete: "Tool completed",
  denied: "Rejected",
  error: "Tool failed",
  loading: "Working",
  streaming: "Working",
  "waiting-approval": "Approval required",
} satisfies Record<ToolStateLabel, string>;

const AgentConversationContext =
  React.createContext<AgentConversationContextValue | null>(null);

interface GlobalAgentChatPanelProps {
  readonly activeOrganizationId?: OrganizationId | null | undefined;
  readonly currentOrganizationRole?: OrganizationRole | undefined;
  readonly onOpenChange: (open: boolean) => void;
  readonly open: boolean;
}

export function GlobalAgentChatPanel({
  activeOrganizationId,
  currentOrganizationRole,
  onOpenChange,
  open,
}: GlobalAgentChatPanelProps) {
  const hasAgentAccess =
    activeOrganizationId !== null && activeOrganizationId !== undefined;
  const hasActiveOrganizationRole = currentOrganizationRole !== undefined;
  const canUseAgent = hasAgentAccess && hasActiveOrganizationRole;
  const [threadState, setThreadState] =
    React.useState<ThreadState>(loadingThreadState);

  React.useEffect(() => {
    if (threadState.status !== "loading" || !canUseAgent) {
      return;
    }

    let cancelled = false;

    async function prepareThread(): Promise<ThreadState> {
      try {
        const host = resolveBrowserAgentHost();

        if (!host) {
          return {
            error: AGENT_HOST_MISSING_MESSAGE,
            session: null,
            status: "error",
          };
        }

        const preparedSession = await prepareCurrentAgentSession();

        return {
          error: null,
          session: { host, preparedSession },
          status: "ready",
        };
      } catch (error: unknown) {
        return {
          error:
            error instanceof Error
              ? error.message
              : "The agent session could not be prepared.",
          session: null,
          status: "error",
        };
      }
    }

    async function commitPreparedThread() {
      const nextThreadState = await prepareThread();

      if (!cancelled) {
        setThreadState(nextThreadState);
      }
    }

    void commitPreparedThread();

    return () => {
      cancelled = true;
    };
  }, [canUseAgent, threadState.status]);

  if (!canUseAgent) {
    return null;
  }

  return (
    <ResponsiveDrawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="route-drawer-content route-side-drawer-content flex max-h-[92vh] w-full flex-col overflow-hidden p-0 data-[vaul-drawer-direction=bottom]:min-h-[76vh] data-[vaul-drawer-direction=right]:inset-y-0 data-[vaul-drawer-direction=right]:right-0 data-[vaul-drawer-direction=right]:h-full data-[vaul-drawer-direction=right]:max-h-none data-[vaul-drawer-direction=right]:sm:max-w-2xl">
        <AgentDockHeader
          currentOrganizationRole={currentOrganizationRole}
          threadState={threadState}
        />
        <div className="flex min-h-0 flex-1 flex-col">
          <AgentChatBody
            currentOrganizationRole={currentOrganizationRole}
            threadState={threadState}
            onRetry={() => {
              setThreadState(loadingThreadState);
            }}
          />
        </div>
      </DrawerContent>
    </ResponsiveDrawer>
  );
}

function AgentDockHeader({
  currentOrganizationRole,
  threadState,
}: {
  readonly currentOrganizationRole: OrganizationRole;
  readonly threadState: ThreadState;
}) {
  const manifest =
    threadState.status === "ready"
      ? threadState.session.preparedSession.manifest
      : null;

  return (
    <DrawerHeader className="shrink-0 border-b px-5 py-4 text-left md:px-6">
      <div className="flex min-w-0 items-start justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg border bg-background text-foreground">
              <AgentIcon icon={AiChat02Icon} strokeWidth={2} />
            </div>
            <div className="min-w-0">
              <DrawerTitle className="font-heading text-base">
                Ask Ceird
              </DrawerTitle>
              <DrawerDescription className="truncate">
                Workspace operator
              </DrawerDescription>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">
              {formatRoleLabel(currentOrganizationRole)} access
            </Badge>
            <Badge
              variant={threadState.status === "ready" ? "outline" : "secondary"}
            >
              {getThreadStateLabel(threadState.status)}
            </Badge>
            {manifest ? <CapabilitySummary actions={manifest.actions} /> : null}
          </div>
        </div>
        <DrawerClose asChild>
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-label="Close Ask Ceird"
          >
            <AgentIcon icon={Cancel01Icon} strokeWidth={2} />
          </Button>
        </DrawerClose>
      </div>
    </DrawerHeader>
  );
}

function CapabilitySummary({
  actions,
}: {
  readonly actions: readonly AgentActionManifestItem[];
}) {
  const executableActions = actions.filter(
    (action) => action.executionStatus === "executable"
  );
  const readCount = executableActions.filter(
    (action) => action.kind === "read"
  ).length;
  const approvalCount = executableActions.filter(
    (action) => action.confirmationPolicy !== "none"
  ).length;

  return (
    <>
      <Badge variant="outline">Read workspace</Badge>
      <Badge variant="outline">{readCount} read tools</Badge>
      <Badge variant="outline">{approvalCount} approvals</Badge>
    </>
  );
}

function AgentChatBody({
  currentOrganizationRole,
  onRetry,
  threadState,
}: {
  readonly currentOrganizationRole: OrganizationRole;
  readonly onRetry: () => void;
  readonly threadState: ThreadState;
}) {
  if (threadState.status === "loading") {
    return <AgentLoadingState />;
  }

  if (threadState.status === "error") {
    return <AgentErrorState error={threadState.error} onRetry={onRetry} />;
  }

  if (threadState.status !== "ready") {
    return <AgentEmptyState actions={[]} role={currentOrganizationRole} />;
  }

  return (
    <React.Suspense fallback={<AgentLoadingState />}>
      <AgentChatSession
        role={currentOrganizationRole}
        session={threadState.session}
      />
    </React.Suspense>
  );
}

function AgentLoadingState() {
  return (
    <div className="flex flex-1 items-center justify-center px-6 py-10">
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <AgentIcon icon={Clock03Icon} strokeWidth={2} />
        <output aria-live="polite">Preparing workspace context</output>
      </div>
    </div>
  );
}

function AgentErrorState({
  error,
  onRetry,
}: {
  readonly error: string;
  readonly onRetry: () => void;
}) {
  return (
    <div className="flex flex-1 items-center justify-center px-6 py-10">
      <Alert variant="destructive" className="max-w-md">
        <AgentIcon icon={AlertCircleIcon} strokeWidth={2} />
        <AlertTitle>Agent unavailable</AlertTitle>
        <AlertDescription className="flex flex-col gap-3">
          <span>{error}</span>
          <Button type="button" variant="outline" size="sm" onClick={onRetry}>
            Retry
          </Button>
        </AlertDescription>
      </Alert>
    </div>
  );
}

function AgentChatSession({
  role,
  session,
}: {
  readonly role: OrganizationRole;
  readonly session: AgentChatSessionState;
}) {
  const consumedInitialAuthorizationAgentNameRef = React.useRef<string | null>(
    null
  );
  const { preparedSession } = session;

  const query = React.useCallback(async () => {
    if (
      consumedInitialAuthorizationAgentNameRef.current !==
      preparedSession.authorization.agentInstanceName
    ) {
      consumedInitialAuthorizationAgentNameRef.current =
        preparedSession.authorization.agentInstanceName;

      return { token: preparedSession.authorization.token };
    }

    const authorization = await authorizeCurrentAgentThread(
      preparedSession.thread.id
    );

    if (
      authorization.agentInstanceName !==
      preparedSession.authorization.agentInstanceName
    ) {
      throw new Error("Agent authorization returned a different thread.");
    }

    return { token: authorization.token };
  }, [
    preparedSession.authorization.agentInstanceName,
    preparedSession.authorization.token,
    preparedSession.thread.id,
  ]);
  const agent = useAgent({
    agent: "CeirdAgent",
    cacheTtl: getConnectTokenCacheTtl(preparedSession.tokenExpiresInSeconds),
    host: session.host,
    name: preparedSession.authorization.agentInstanceName,
    query,
    queryDeps: [preparedSession.thread.id],
  });

  return (
    <AgentConversation
      actions={preparedSession.manifest.actions}
      agent={agent}
      role={role}
      threadTitle={preparedSession.thread.title}
    />
  );
}

function AgentConversation({
  actions,
  agent,
  role,
  threadTitle,
}: {
  readonly actions: readonly AgentActionManifestItem[];
  readonly agent: AgentConnection;
  readonly role: OrganizationRole;
  readonly threadTitle: string;
}) {
  const proximityOriginContextIdRef =
    React.useRef<AgentProximityOriginContextIdType | null>(null);
  const activeLocationRequestRef = React.useRef(0);
  const mountedRef = React.useRef(true);
  const [locationNotice, setLocationNotice] =
    React.useState<AgentComposerLocationNotice | null>(null);
  React.useEffect(
    () => () => {
      mountedRef.current = false;
      activeLocationRequestRef.current += 1;
      proximityOriginContextIdRef.current = null;
    },
    []
  );
  const prepareSendMessagesRequest = React.useCallback(() => {
    const contextId = proximityOriginContextIdRef.current;
    proximityOriginContextIdRef.current = null;

    return contextId === null
      ? {}
      : { body: makeAgentProximityOriginContextBody(contextId) };
  }, []);
  const {
    addToolApprovalResponse,
    error,
    isRecovering,
    isStreaming,
    messages,
    sendMessage,
    status,
    stop,
  } = useAgentChat({ agent, prepareSendMessagesRequest });
  const turnActive =
    status === "submitted" || status === "streaming" || isStreaming;
  const busy = turnActive || isRecovering;
  const actionLookup = React.useMemo(
    () => buildActionLookup(actions),
    [actions]
  );
  const composerRef = React.useRef<AgentComposerHandle | null>(null);
  const conversationContext = React.useMemo(
    () => ({
      actionLookup,
      onToolApprovalResponse: addToolApprovalResponse,
    }),
    [actionLookup, addToolApprovalResponse]
  );
  const sendMessageWithRouteContext = React.useCallback(
    async (
      message: { readonly text: string },
      options: AgentSendMessageOptions = {}
    ) => {
      const sendWithHiddenOrigin = async (
        origin: ProximityOriginInput,
        attachFailureMessage: string
      ) => {
        const contextId = createAgentProximityOriginContextId();
        const contextSent = sendAgentProximityOriginContext(
          agent,
          contextId,
          origin
        );

        if (!contextSent) {
          setLocationNotice({
            canChooseOrigin: true,
            canShareCurrentLocation: false,
            message: attachFailureMessage,
            status: "blocked",
          });

          return false;
        }

        proximityOriginContextIdRef.current = contextId;
        setLocationNotice(null);
        try {
          await sendMessage(message);
        } catch (sendError) {
          proximityOriginContextIdRef.current = null;
          throw sendError;
        }

        return true;
      };

      if (options.originOverride !== undefined) {
        return await sendWithHiddenOrigin(
          options.originOverride,
          "Ceird could not attach the selected origin to the agent request. Choose the origin again, or send without route ranking."
        );
      }

      if (!shouldAttachCurrentLocationToAgentMessage(message.text)) {
        setLocationNotice(null);
        await sendMessage(message);

        return true;
      }

      const requestId = activeLocationRequestRef.current + 1;
      activeLocationRequestRef.current = requestId;

      if (
        !mountedRef.current ||
        activeLocationRequestRef.current !== requestId
      ) {
        return false;
      }

      let locationPreferenceStatus: RouteProximityLocationPreferenceStatus;

      if (options.forceEnableLocationPreference === true) {
        try {
          await updateCurrentUserPreferences({
            routeProximityLocationEnabled: true,
          });
          locationPreferenceStatus = "enabled";
        } catch {
          locationPreferenceStatus = "unavailable";
        }
      } else {
        locationPreferenceStatus =
          await loadRouteProximityLocationPreferenceStatus();
      }
      const requestWasCancelled =
        !mountedRef.current || activeLocationRequestRef.current !== requestId;

      if (locationPreferenceStatus !== "enabled") {
        if (requestWasCancelled) {
          return false;
        }

        setLocationNotice({
          canChooseOrigin: true,
          canShareCurrentLocation: true,
          message: getAgentLocationPreferenceBlockedMessage(
            locationPreferenceStatus
          ),
          status: "blocked",
        });

        return false;
      }

      if (requestWasCancelled) {
        return false;
      }

      setLocationNotice({ status: "requesting" });
      const originExit = await Effect.runPromiseExit(
        requestCurrentLocationOrigin()
      );

      if (Exit.isFailure(originExit)) {
        if (
          !mountedRef.current ||
          activeLocationRequestRef.current !== requestId
        ) {
          return false;
        }

        setLocationNotice({
          canChooseOrigin: true,
          canShareCurrentLocation: false,
          message: getAgentLocationFailureMessage(originExit.cause),
          status: "blocked",
        });

        return false;
      }

      if (
        !mountedRef.current ||
        activeLocationRequestRef.current !== requestId
      ) {
        return false;
      }

      return await sendWithHiddenOrigin(
        originExit.value,
        "Ceird could not attach your current location to the agent request. Try again, or choose an origin."
      );
    },
    [agent, sendMessage]
  );

  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-5 py-4 sm:px-6">
        {messages.length === 0 ? (
          <AgentEmptyState
            actions={actions}
            onSelectStarterPrompt={(prompt) => {
              composerRef.current?.setDraft(prompt);
            }}
            role={role}
          />
        ) : (
          <div
            className="flex flex-col gap-4"
            role="log"
            aria-live="polite"
            aria-relevant="additions text"
          >
            <ConversationMeta
              actions={actions}
              busy={busy}
              recovering={isRecovering}
              threadTitle={threadTitle}
            />
            <AgentConversationContext.Provider value={conversationContext}>
              {messages.map((message) => (
                <AgentMessage key={getMessageKey(message)} message={message} />
              ))}
            </AgentConversationContext.Provider>
          </div>
        )}

        {error ? (
          <Alert variant="destructive" className="mt-4">
            <AgentIcon icon={AlertCircleIcon} strokeWidth={2} />
            <AlertTitle>Message failed</AlertTitle>
            <AlertDescription>{error.message}</AlertDescription>
          </Alert>
        ) : null}
      </div>
      <AgentComposer
        ref={composerRef}
        busy={busy}
        locationNotice={locationNotice}
        sendMessage={sendMessageWithRouteContext}
        stop={stop}
        turnActive={busy}
      />
    </>
  );
}

function ConversationMeta({
  actions,
  busy,
  recovering,
  threadTitle,
}: {
  readonly actions: readonly AgentActionManifestItem[];
  readonly busy: boolean;
  readonly recovering: boolean;
  readonly threadTitle: string;
}) {
  let statusBadgeLabel: string | null = null;

  if (recovering) {
    statusBadgeLabel = "Recovering response";
  } else if (busy) {
    statusBadgeLabel = "Working";
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
      <div className="flex min-w-0 items-center gap-2">
        <AgentIcon icon={Task01Icon} strokeWidth={2} />
        <span className="truncate">{threadTitle}</span>
      </div>
      <div className="flex items-center gap-2">
        <span>{actions.length} registered actions</span>
        {statusBadgeLabel ? (
          <Badge variant="secondary">{statusBadgeLabel}</Badge>
        ) : null}
      </div>
    </div>
  );
}

function AgentEmptyState({
  actions,
  onSelectStarterPrompt,
  role,
}: {
  readonly actions: readonly AgentActionManifestItem[];
  readonly onSelectStarterPrompt?: (prompt: string) => void;
  readonly role: OrganizationRole;
}) {
  const readActions = actions.filter((action) => action.kind === "read");
  const approvalGatedActions = actions.filter(
    (action) => action.kind !== "read"
  );

  return (
    <Empty className="min-h-80 border-0 p-4">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <AgentIcon icon={ShieldUserIcon} strokeWidth={2} />
        </EmptyMedia>
        <EmptyTitle>Ready for the workspace</EmptyTitle>
        <EmptyDescription>
          {formatRoleLabel(role)} access is active. Ceird can read workspace
          context now; write and destructive action entries are treated as
          approval-gated metadata, not runtime-available tools.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent className="max-w-xl">
        <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-3">
          <CapabilityTile
            icon={FileSearchIcon}
            label="Read workspace now"
            value={`${readActions.length} tools`}
          />
          <CapabilityTile
            icon={Task01Icon}
            label="Approval-gated entries"
            value={`${approvalGatedActions.length} listed`}
          />
          <CapabilityTile
            icon={CheckmarkCircle02Icon}
            label="Writes are gated"
            value="Metadata only"
          />
        </div>
        {onSelectStarterPrompt ? (
          <div className="mt-4 flex w-full flex-wrap justify-center gap-2">
            {AGENT_STARTER_PROMPTS.map((prompt) => (
              <Button
                key={prompt}
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => {
                  onSelectStarterPrompt(prompt);
                }}
              >
                {prompt}
              </Button>
            ))}
          </div>
        ) : null}
      </EmptyContent>
    </Empty>
  );
}

function CapabilityTile({
  icon,
  label,
  value,
}: {
  readonly icon: React.ComponentProps<typeof HugeiconsIcon>["icon"];
  readonly label: string;
  readonly value: string;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-2 rounded-lg border bg-background p-3 text-left">
      <AgentIcon icon={icon} strokeWidth={2} />
      <div className="flex min-w-0 flex-col gap-1">
        <span className="truncate text-sm font-medium">{label}</span>
        <span className="truncate text-xs text-muted-foreground">{value}</span>
      </div>
    </div>
  );
}

interface AgentComposerHandle {
  setDraft: (draft: string) => void;
}

const AgentComposer = React.forwardRef<
  AgentComposerHandle,
  {
    readonly busy: boolean;
    readonly locationNotice: AgentComposerLocationNotice | null;
    readonly sendMessage: (
      message: { readonly text: string },
      options?: AgentSendMessageOptions
    ) => Promise<boolean>;
    readonly stop: () => void;
    readonly turnActive: boolean;
  }
>(function AgentComposer(
  { busy, locationNotice, sendMessage, stop, turnActive },
  ref
) {
  const [draft, setDraft] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const composerRef = React.useRef<HTMLDivElement | null>(null);
  const textareaRef = React.useRef<HTMLTextAreaElement | null>(null);
  const pendingOriginMessageRef = React.useRef<string | null>(null);
  const stopRequestedRef = React.useRef(false);
  const isBusy = busy || submitting;
  const originDialog = useProximityOriginDialogController({
    autocompleteFailureMessage: "Ceird could not search origins. Try again.",
    resolveFailureMessage:
      "Ceird could not confirm that origin. Select another result.",
    onOriginResolved: async ({ origin }) => {
      const text = pendingOriginMessageRef.current;

      if (!text) {
        return "keep-open";
      }

      setSubmitting(true);
      try {
        const sent = await sendMessage({ text }, { originOverride: origin });

        if (!sent) {
          return "keep-open";
        }

        pendingOriginMessageRef.current = null;
        setDraft("");
        return "reset";
      } finally {
        setSubmitting(false);
      }
    },
  });

  const submitDraft = React.useCallback(
    async (options?: AgentSendMessageOptions) => {
      const text = draft.trim();

      if (!text || isBusy) {
        return;
      }

      setSubmitting(true);
      try {
        const sent = await sendMessage({ text }, options);

        if (sent) {
          setDraft("");
        }
      } finally {
        setSubmitting(false);
      }
    },
    [draft, isBusy, sendMessage]
  );

  useAppHotkey("agentSubmit", () => {
    if (activeElementIsInside(composerRef)) {
      void submitDraft();
    }
  });
  const stopActiveTurn = React.useCallback(() => {
    if (!turnActive || stopRequestedRef.current) {
      return;
    }

    stopRequestedRef.current = true;
    stop();
  }, [stop, turnActive]);

  React.useEffect(() => {
    if (!turnActive) {
      stopRequestedRef.current = false;
    }
  }, [turnActive]);

  React.useImperativeHandle(
    ref,
    () => ({
      setDraft(nextDraft) {
        setDraft(nextDraft);
        textareaRef.current?.focus();
      },
    }),
    []
  );

  return (
    <DrawerFooter className="shrink-0 gap-3 border-t bg-background px-5 py-3 sm:px-6">
      <div ref={composerRef} className="flex w-full flex-col gap-2">
        {locationNotice ? (
          <AgentLocationNotice
            busy={isBusy}
            notice={locationNotice}
            onChooseOrigin={() => {
              if (draft.trim() && !isBusy) {
                originDialog.handleOpenChange(true);
              }
            }}
            onShareCurrentLocation={() => {
              void submitDraft({ forceEnableLocationPreference: true });
            }}
          />
        ) : null}
        <Textarea
          ref={textareaRef}
          aria-label="Message Ask Ceird"
          className="max-h-36 min-h-20 resize-none"
          placeholder="Describe the next operation"
          value={draft}
          onChange={(event) => {
            setDraft(event.currentTarget.value);
          }}
        />
        <div className="flex items-center justify-between gap-3">
          <ShortcutHint
            decorative
            hotkey={HOTKEYS.agentSubmit.hotkey}
            label={HOTKEYS.agentSubmit.label}
          />
          <div className="flex items-center gap-2">
            {turnActive ? (
              <>
                <AgentStopHotkey onStop={stopActiveTurn} />
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={stopActiveTurn}
                >
                  <AgentIcon
                    icon={Cancel01Icon}
                    strokeWidth={2}
                    data-icon="inline-start"
                  />
                  Stop
                  <ShortcutHint
                    decorative
                    surface="button"
                    hotkey={HOTKEYS.agentStop.hotkey}
                    label={HOTKEYS.agentStop.label}
                  />
                </Button>
              </>
            ) : null}
            <Button
              type="button"
              size="sm"
              aria-label="Send"
              disabled={!draft.trim() || isBusy}
              loading={submitting}
              onClick={() => {
                void submitDraft();
              }}
            >
              <AgentIcon
                icon={SentIcon}
                strokeWidth={2}
                data-icon="inline-start"
              />
              Send
            </Button>
          </div>
        </div>
        <ProximityOriginDialog
          error={originDialog.error}
          loading={originDialog.loading || submitting}
          open={originDialog.open}
          query={originDialog.query}
          selectedSuggestion={originDialog.selectedSuggestion}
          suggestions={originDialog.suggestions}
          onConfirm={(suggestion) => {
            const text = draft.trim();

            if (!text || isBusy) {
              return;
            }

            pendingOriginMessageRef.current = text;
            originDialog.confirmSelectedOrigin(suggestion);
          }}
          onOpenChange={(open) => {
            if (!open) {
              pendingOriginMessageRef.current = null;
            }
            originDialog.handleOpenChange(open);
          }}
          onQueryChange={(query) => {
            originDialog.handleQueryChange(query);
          }}
          onSuggestionSelect={(suggestion) => {
            originDialog.handleSuggestionSelect(suggestion);
          }}
        />
      </div>
    </DrawerFooter>
  );
});

function AgentStopHotkey({ onStop }: { readonly onStop: () => void }) {
  useAppHotkey("agentStop", onStop);

  return null;
}

function AgentLocationNotice({
  busy,
  notice,
  onChooseOrigin,
  onShareCurrentLocation,
}: {
  readonly busy: boolean;
  readonly notice: AgentComposerLocationNotice;
  readonly onChooseOrigin: () => void;
  readonly onShareCurrentLocation: () => void;
}) {
  if (notice.status === "requesting") {
    return (
      <Alert className="py-2">
        <AgentIcon icon={Clock03Icon} strokeWidth={2} />
        <AlertTitle>Getting current location</AlertTitle>
        <AlertDescription>
          Ceird uses this once for the route request and does not save it.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <Alert variant="destructive" className="py-2">
      <AgentIcon icon={AlertCircleIcon} strokeWidth={2} />
      <AlertTitle>Current location unavailable</AlertTitle>
      <AlertDescription className="flex flex-col gap-3">
        <span>{notice.message}</span>
        <span>
          Ceird uses the origin only for this route request and does not save
          the coordinates. Enabling current-location access means Ceird can ask
          this browser for fresh location whenever you use Near me.
        </span>
        <span className="flex flex-wrap gap-2">
          {notice.canShareCurrentLocation ? (
            <Button
              size="sm"
              type="button"
              variant="outline"
              disabled={busy}
              onClick={onShareCurrentLocation}
            >
              Enable current-location access
            </Button>
          ) : null}
          {notice.canChooseOrigin ? (
            <Button
              size="sm"
              type="button"
              variant="outline"
              disabled={busy}
              onClick={onChooseOrigin}
            >
              Choose origin
            </Button>
          ) : null}
        </span>
      </AlertDescription>
    </Alert>
  );
}

function AgentMessage({ message }: { readonly message: ChatMessage }) {
  const isUser = message.role === "user";
  const parts = message.parts ?? [];

  return (
    <article className={cn("flex", isUser ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "flex max-w-[88%] flex-col gap-2 rounded-lg border px-3 py-2 text-sm",
          isUser
            ? "border-primary/20 bg-primary text-primary-foreground"
            : "border-border bg-background text-foreground"
        )}
      >
        <p
          className={cn(
            "text-xs font-medium",
            isUser ? "text-primary-foreground/75" : "text-muted-foreground"
          )}
        >
          {isUser ? "You" : "Ceird"}
        </p>
        {parts.map((part) => (
          <AgentMessagePart key={getMessagePartKey(part)} part={part} />
        ))}
      </div>
    </article>
  );
}

function AgentMessagePart({ part }: { readonly part: ChatPart }) {
  const { actionLookup, onToolApprovalResponse } =
    useAgentConversationContext();

  if (part.type === "text" && part.text) {
    return <p className="leading-6 whitespace-pre-wrap">{part.text}</p>;
  }

  if (part.type.startsWith("tool-") || part.type === "dynamic-tool") {
    const state = getToolPartState(part);
    const approval = getToolApproval(part);
    const input = getToolInput(part);
    const output = getToolOutput(part);
    const toolName = getToolName(part);
    const action = actionLookup.get(toolName);

    if (state === "waiting-approval" && approval?.id !== undefined) {
      return (
        <AgentToolCard action={action} state={state} toolName={toolName}>
          <ApprovalReview
            action={action}
            approvalId={approval.id}
            input={input}
            toolName={toolName}
            onToolApprovalResponse={onToolApprovalResponse}
          />
        </AgentToolCard>
      );
    }

    return (
      <AgentToolCard action={action} state={state} toolName={toolName}>
        <ToolPayloadPreview input={input} output={output} toolName={toolName} />
      </AgentToolCard>
    );
  }

  return null;
}

function useAgentConversationContext() {
  const context = React.use(AgentConversationContext);

  if (context === null) {
    throw new Error("Agent conversation context is required.");
  }

  return context;
}

function AgentToolCard({
  action,
  children,
  state,
  toolName,
}: {
  readonly action: AgentActionManifestItem | undefined;
  readonly children: React.ReactNode;
  readonly state: ToolStateLabel;
  readonly toolName: string;
}) {
  return (
    <section className="flex flex-col gap-3 rounded-lg border bg-muted/20 p-3">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2">
          <div className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md border bg-background text-muted-foreground">
            <AgentIcon icon={getToolIcon(state)} strokeWidth={2} />
          </div>
          <div className="flex min-w-0 flex-col gap-1">
            <span className="truncate font-medium">
              {action?.display.label ?? toolName}
            </span>
            <span className="text-xs text-muted-foreground">
              {action?.display.summary ?? "Agent tool call"}
            </span>
          </div>
        </div>
        <Badge variant={state === "error" ? "destructive" : "outline"}>
          {TOOL_STATE_LABELS[state]}
        </Badge>
      </div>

      {children}
    </section>
  );
}

function ApprovalReview({
  action,
  approvalId,
  input,
  toolName,
  onToolApprovalResponse,
}: {
  readonly action: AgentActionManifestItem | undefined;
  readonly approvalId: string;
  readonly input: unknown;
  readonly toolName: string;
  readonly onToolApprovalResponse: (response: ToolApprovalResponse) => void;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-md border bg-background p-3">
      <div className="flex flex-col gap-1">
        <span className="text-sm font-medium">Review before Ceird acts</span>
        <span className="text-xs text-muted-foreground">
          {getApprovalRiskLabel(action)} action against{" "}
          {action?.display.target ?? toolName}.
        </span>
      </div>
      <ToolPayloadPreview
        input={input}
        output={undefined}
        toolName={toolName}
      />
      <Separator />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">
          This decision is recorded with the conversation.
        </span>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => {
              onToolApprovalResponse({ approved: false, id: approvalId });
            }}
          >
            Reject
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={() => {
              onToolApprovalResponse({ approved: true, id: approvalId });
            }}
          >
            Approve
          </Button>
        </div>
      </div>
    </div>
  );
}

function ToolPayloadPreview({
  input,
  output,
  toolName,
}: {
  readonly input: unknown;
  readonly output: unknown;
  readonly toolName: string;
}) {
  const proximityOutput = React.useMemo(() => {
    if (!isAgentProximityToolName(toolName) || output === undefined) {
      return null;
    }

    return renderAgentProximityToolOutput({
      output,
      toolName,
    });
  }, [output, toolName]);

  if (input === undefined && output === undefined) {
    return null;
  }

  if (proximityOutput !== null) {
    return <div className="text-xs">{proximityOutput}</div>;
  }

  return (
    <div className="grid grid-cols-1 gap-2 text-xs md:grid-cols-2">
      {input === undefined ? null : (
        <PayloadBlock label="Input" value={formatPayload(input)} />
      )}
      {output === undefined ? null : (
        <PayloadBlock label="Result" value={formatPayload(output)} />
      )}
    </div>
  );
}

function PayloadBlock({
  label,
  value,
}: {
  readonly label: string;
  readonly value: string;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-md border bg-background p-2">
      <span className="font-medium text-muted-foreground">{label}</span>
      <code className="max-h-24 overflow-auto break-words whitespace-pre-wrap text-foreground">
        {value}
      </code>
    </div>
  );
}

function buildActionLookup(actions: readonly AgentActionManifestItem[]) {
  const lookup = new Map<string, AgentActionManifestItem>();

  for (const action of actions) {
    lookup.set(action.name, action);
    lookup.set(action.modelName, action);
  }

  return lookup;
}

function getToolName(part: ChatPart) {
  if ("toolName" in part && typeof part.toolName === "string") {
    return part.toolName;
  }

  return part.type.startsWith("tool-")
    ? part.type.slice("tool-".length)
    : "Tool";
}

function getToolIcon(state: ToolStateLabel) {
  switch (state) {
    case "complete":
    case "approved": {
      return CheckmarkCircle02Icon;
    }
    case "waiting-approval": {
      return ShieldUserIcon;
    }
    case "error":
    case "denied": {
      return AlertCircleIcon;
    }
    default: {
      return ToolsIcon;
    }
  }
}

function getApprovalRiskLabel(action: AgentActionManifestItem | undefined) {
  if (action?.kind === "destructive") {
    return "Destructive";
  }

  if (action?.kind === "write") {
    return "Write";
  }

  return "Approval-gated";
}

function formatPayload(value: unknown) {
  if (typeof value === "string") {
    return value;
  }

  return JSON.stringify(value, null, 2) ?? "null";
}

function getAgentLocationFailureMessage(
  cause: Cause.Cause<BrowserGeolocationError>
) {
  const failure = Cause.findErrorOption(cause);
  const failureMessage = Option.isSome(failure)
    ? formatBrowserGeolocationError(failure.value)
    : "Ceird could not get your current location.";

  return `${failureMessage} Allow location access and send again, or enable location access in Settings.`;
}

function createAgentProximityOriginContextId(): AgentProximityOriginContextIdType {
  const randomId =
    typeof globalThis.crypto?.randomUUID === "function"
      ? globalThis.crypto.randomUUID()
      : createFallbackUuid();

  return `${AGENT_PROXIMITY_CONTEXT_ID_PREFIX}${randomId}`;
}

function createFallbackUuid() {
  const bytes = new Uint8Array(16);

  if (typeof globalThis.crypto?.getRandomValues === "function") {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }

  const versionByte = bytes.at(6);
  const variantByte = bytes.at(8);

  if (versionByte === undefined || variantByte === undefined) {
    throw new Error("Expected UUID byte buffer to contain 16 bytes");
  }

  bytes[6] = (versionByte % 16) + 64;
  bytes[8] = (variantByte % 64) + 128;

  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, "0"));

  return [
    hex.slice(0, 4).join(""),
    hex.slice(4, 6).join(""),
    hex.slice(6, 8).join(""),
    hex.slice(8, 10).join(""),
    hex.slice(10, 16).join(""),
  ].join("-");
}

function sendAgentProximityOriginContext(
  agent: AgentConnection,
  contextId: AgentProximityOriginContextIdType,
  origin: ProximityOriginInput
) {
  const frame = makeAgentProximityOriginContextFrame(contextId, origin);

  try {
    agent.send(JSON.stringify(frame));

    return true;
  } catch {
    return false;
  }
}

function getConnectTokenCacheTtl(tokenExpiresInSeconds: number) {
  return Math.max(
    0,
    Math.min(
      tokenExpiresInSeconds * 1000 - AGENT_CONNECT_TOKEN_CACHE_SAFETY_MS,
      AGENT_CONNECT_TOKEN_MAX_CACHE_MS
    )
  );
}

function getThreadStateLabel(status: ThreadState["status"]) {
  switch (status) {
    case "ready": {
      return "Connected";
    }
    case "error": {
      return "Needs attention";
    }
    case "loading": {
      return "Preparing";
    }
    default: {
      return "Idle";
    }
  }
}

function formatRoleLabel(role: OrganizationRole) {
  return role
    .split("_")
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(" ");
}

function getMessageKey(message: ChatMessage) {
  return message.id ?? `${message.role ?? "message"}-${hashKey(message.parts)}`;
}

function getMessagePartKey(part: ChatPart) {
  if ("id" in part && typeof part.id === "string") {
    return `${part.type}-${part.id}`;
  }

  if ("toolCallId" in part && typeof part.toolCallId === "string") {
    return `${part.type}-${part.toolCallId}`;
  }

  if (part.type === "text") {
    return `${part.type}-${hashKey(part.text)}`;
  }

  return `${part.type}-${hashKey(part)}`;
}

function hashKey(value: unknown) {
  const source =
    typeof value === "string" ? value : (JSON.stringify(value) ?? "unknown");
  let hash = 0;

  for (let index = 0; index < source.length; index += 1) {
    hash = (hash * 31 + (source.codePointAt(index) ?? 0)) % 1_000_000_007;
  }

  return Math.abs(hash).toString(36);
}

function getAgentLocationPreferenceBlockedMessage(
  status: Exclude<RouteProximityLocationPreferenceStatus, "enabled">
) {
  return status === "disabled"
    ? "Location access is off. Enable location access in Settings to use near-me agent requests."
    : "Ceird could not check location access. Try again, or enable location access in Settings.";
}

function resolveBrowserAgentHost() {
  return resolveAgentHost(
    typeof window === "undefined" ? undefined : window.location.origin
  );
}
