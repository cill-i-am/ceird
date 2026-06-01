"use client";

import type {
  AgentActionManifestItem,
  PreparedAgentSession,
} from "@ceird/agents-core";
import type { OrganizationId, OrganizationRole } from "@ceird/identity-core";
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
import { activeElementIsInside } from "#/hotkeys/focus";
import { ShortcutHint } from "#/hotkeys/hotkey-display";
import { HOTKEYS } from "#/hotkeys/hotkey-registry";
import { useAppHotkey } from "#/hotkeys/use-app-hotkey";
import { resolveAgentHost } from "#/lib/agent-origin";
import { cn } from "#/lib/utils";

import {
  authorizeCurrentAgentThread,
  prepareCurrentAgentSession,
} from "./agent-client";

const AGENT_HOST_MISSING_MESSAGE = "The Agent Worker origin is not configured.";
const AGENT_CONNECT_TOKEN_CACHE_SAFETY_MS = 60_000;
const AGENT_CONNECT_TOKEN_MAX_CACHE_MS = 240_000;

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
      <div
        className="flex items-center gap-3 text-sm text-muted-foreground"
        role="status"
      >
        <AgentIcon icon={Clock03Icon} strokeWidth={2} />
        <span>Preparing workspace context</span>
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
  const {
    addToolApprovalResponse,
    error,
    isStreaming,
    messages,
    sendMessage,
    status,
  } = useAgentChat({ agent });
  const busy = status === "submitted" || status === "streaming" || isStreaming;
  const actionLookup = React.useMemo(
    () => buildActionLookup(actions),
    [actions]
  );
  const conversationContext = React.useMemo(
    () => ({
      actionLookup,
      onToolApprovalResponse: addToolApprovalResponse,
    }),
    [actionLookup, addToolApprovalResponse]
  );

  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-5 py-4 sm:px-6">
        {messages.length === 0 ? (
          <AgentEmptyState actions={actions} role={role} />
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
      <AgentComposer busy={busy} sendMessage={sendMessage} />
    </>
  );
}

function ConversationMeta({
  actions,
  busy,
  threadTitle,
}: {
  readonly actions: readonly AgentActionManifestItem[];
  readonly busy: boolean;
  readonly threadTitle: string;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
      <div className="flex min-w-0 items-center gap-2">
        <AgentIcon icon={Task01Icon} strokeWidth={2} />
        <span className="truncate">{threadTitle}</span>
      </div>
      <div className="flex items-center gap-2">
        <span>{actions.length} registered actions</span>
        {busy ? (
          <Badge variant="secondary" role="status">
            Working
          </Badge>
        ) : null}
      </div>
    </div>
  );
}

function AgentEmptyState({
  actions,
  role,
}: {
  readonly actions: readonly AgentActionManifestItem[];
  readonly role: OrganizationRole;
}) {
  const readActions = actions.filter((action) => action.kind === "read");
  const writeActions = actions.filter(
    (action) =>
      action.kind !== "read" && action.executionStatus === "executable"
  );

  return (
    <Empty className="min-h-80 border-0 p-4">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <AgentIcon icon={ShieldUserIcon} strokeWidth={2} />
        </EmptyMedia>
        <EmptyTitle>Ready for the workspace</EmptyTitle>
        <EmptyDescription>
          {formatRoleLabel(role)} access is active for this organization.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent className="max-w-lg">
        <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-3">
          <CapabilityTile
            icon={FileSearchIcon}
            label="Read workspace"
            value={`${readActions.length} tools`}
          />
          <CapabilityTile
            icon={Task01Icon}
            label="Draft changes"
            value={`${writeActions.length} tools`}
          />
          <CapabilityTile
            icon={CheckmarkCircle02Icon}
            label="Approval required"
            value="Before writes"
          />
        </div>
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
    <div className="flex min-w-0 flex-col gap-2 rounded-lg border bg-background px-3 py-3 text-left">
      <AgentIcon icon={icon} strokeWidth={2} />
      <div className="flex min-w-0 flex-col gap-1">
        <span className="truncate text-sm font-medium">{label}</span>
        <span className="truncate text-xs text-muted-foreground">{value}</span>
      </div>
    </div>
  );
}

function AgentComposer({
  busy,
  sendMessage,
}: {
  readonly busy: boolean;
  readonly sendMessage: (message: { readonly text: string }) => Promise<void>;
}) {
  const [draft, setDraft] = React.useState("");
  const composerRef = React.useRef<HTMLDivElement | null>(null);

  const submitDraft = React.useCallback(async () => {
    const text = draft.trim();

    if (!text || busy) {
      return;
    }

    setDraft("");
    await sendMessage({ text });
  }, [busy, draft, sendMessage]);

  useAppHotkey("agentSubmit", () => {
    if (activeElementIsInside(composerRef)) {
      void submitDraft();
    }
  });

  return (
    <DrawerFooter className="shrink-0 gap-3 border-t bg-background px-5 py-3 sm:px-6">
      <div ref={composerRef} className="flex w-full flex-col gap-2">
        <Textarea
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
          <Button
            type="button"
            size="sm"
            aria-label="Send"
            disabled={!draft.trim() || busy}
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
    </DrawerFooter>
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
        <ToolPayloadPreview input={input} output={output} />
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
    <section className="flex flex-col gap-3 rounded-lg border bg-muted/20 px-3 py-3">
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
    <div className="flex flex-col gap-3 rounded-md border bg-background px-3 py-3">
      <div className="flex flex-col gap-1">
        <span className="text-sm font-medium">Review before Ceird acts</span>
        <span className="text-xs text-muted-foreground">
          {getApprovalRiskLabel(action)} action against{" "}
          {action?.display.target ?? toolName}.
        </span>
      </div>
      <ToolPayloadPreview input={input} output={undefined} />
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
}: {
  readonly input: unknown;
  readonly output: unknown;
}) {
  if (input === undefined && output === undefined) {
    return null;
  }

  return (
    <div className="grid grid-cols-1 gap-2 text-xs md:grid-cols-2">
      {input !== undefined ? (
        <PayloadBlock label="Input" value={formatPayload(input)} />
      ) : null}
      {output !== undefined ? (
        <PayloadBlock label="Result" value={formatPayload(output)} />
      ) : null}
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
    <div className="flex min-w-0 flex-col gap-1 rounded-md border bg-background px-2 py-2">
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

function resolveBrowserAgentHost() {
  return resolveAgentHost(
    typeof window === "undefined" ? undefined : window.location.origin
  );
}
