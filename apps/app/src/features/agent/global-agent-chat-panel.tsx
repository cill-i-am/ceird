"use client";

import type { AgentConnectAuthorization } from "@ceird/agents-core";
import type { OrganizationId, OrganizationRole } from "@ceird/identity-core";
import {
  getToolApproval,
  getToolInput,
  getToolOutput,
  getToolPartState,
  useAgentChat,
} from "@cloudflare/ai-chat/react";
import { useAgent } from "agents/react";
import type { UIMessage } from "ai";
import { Bot, SendHorizontal, Sparkles, X } from "lucide-react";
import * as React from "react";

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
import { ResponsiveDrawer } from "#/components/ui/responsive-drawer";
import { Textarea } from "#/components/ui/textarea";
import { activeElementIsInside } from "#/hotkeys/focus";
import { ShortcutHint } from "#/hotkeys/hotkey-display";
import { HOTKEYS } from "#/hotkeys/hotkey-registry";
import { useAppHotkey } from "#/hotkeys/use-app-hotkey";
import { resolveAgentHost } from "#/lib/agent-origin";
import { cn } from "#/lib/utils";

import {
  authorizeCurrentAgentThread,
  ensureCurrentAgentThread,
} from "./agent-client";

const AGENT_HOST_MISSING_MESSAGE = "The Agent Worker origin is not configured.";
const AGENT_CONNECT_TOKEN_CACHE_TTL_MS = 240_000;

interface AgentChatSessionState {
  readonly authorization: AgentConnectAuthorization;
  readonly host: string;
  readonly threadId: Awaited<ReturnType<typeof ensureCurrentAgentThread>>["id"];
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

type ChatPart = UIMessage["parts"][number];
type ChatMessage = UIMessage;
interface ToolApprovalResponse {
  readonly approved: boolean;
  readonly id: string;
}
type ToolStateLabel = ReturnType<typeof getToolPartState>;

const TOOL_STATE_LABELS = {
  approved: "Approved",
  complete: "Complete",
  denied: "Rejected",
  error: "Error",
  loading: "Working",
  streaming: "Working",
  "waiting-approval": "Approval needed",
} satisfies Record<ToolStateLabel, string>;

interface GlobalAgentChatProps {
  readonly activeOrganizationId?: OrganizationId | null | undefined;
  readonly currentOrganizationRole?: OrganizationRole | undefined;
  readonly onOpenChange: (open: boolean) => void;
  readonly open: boolean;
}

type ThreadState =
  | { readonly status: "idle"; readonly session: null; readonly error: null }
  | { readonly status: "loading"; readonly session: null; readonly error: null }
  | {
      readonly status: "ready";
      readonly session: AgentChatSessionState;
      readonly error: null;
    }
  | {
      readonly status: "error";
      readonly session: null;
      readonly error: string;
    };

const loadingThreadState: ThreadState = {
  error: null,
  status: "loading",
  session: null,
};

export function GlobalAgentChatPanel({
  activeOrganizationId,
  currentOrganizationRole,
  onOpenChange,
  open,
}: GlobalAgentChatProps) {
  const hasAgentAccess =
    activeOrganizationId !== null && activeOrganizationId !== undefined;
  const hasActiveOrganizationRole = currentOrganizationRole !== undefined;
  const canUseAgent = hasAgentAccess && hasActiveOrganizationRole;
  const [threadState, setThreadState] =
    React.useState<ThreadState>(loadingThreadState);

  const handleOpenChange = React.useCallback(
    (nextOpen: boolean) => {
      onOpenChange(nextOpen);
    },
    [onOpenChange]
  );

  React.useEffect(() => {
    if (canUseAgent) {
      return;
    }

    onOpenChange(false);
  }, [canUseAgent, onOpenChange]);

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
            status: "error",
            session: null,
          };
        }

        const thread = await ensureCurrentAgentThread();
        const authorization = await authorizeCurrentAgentThread(thread.id);

        return {
          error: null,
          session: { authorization, host, threadId: thread.id },
          status: "ready",
        };
      } catch (error: unknown) {
        return {
          error:
            error instanceof Error
              ? error.message
              : "The agent thread could not be prepared.",
          status: "error",
          session: null,
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
  }, [activeOrganizationId, canUseAgent, threadState.status]);

  if (!canUseAgent) {
    return null;
  }

  return (
    <ResponsiveDrawer open={open} onOpenChange={handleOpenChange}>
      <DrawerContent className="route-drawer-content route-side-drawer-content flex max-h-[92vh] w-full flex-col overflow-hidden p-2 data-[vaul-drawer-direction=bottom]:min-h-[70vh] data-[vaul-drawer-direction=right]:inset-y-0 data-[vaul-drawer-direction=right]:right-0 data-[vaul-drawer-direction=right]:h-full data-[vaul-drawer-direction=right]:max-h-none data-[vaul-drawer-direction=right]:sm:max-w-xl">
        <DrawerHeader className="shrink-0 border-b px-5 py-4 text-left md:px-6">
          <div className="flex min-w-0 items-start justify-between gap-4">
            <div className="min-w-0">
              <DrawerTitle className="flex items-center gap-2">
                <Bot className="size-4 text-primary" aria-hidden="true" />
                Ceird Agent
              </DrawerTitle>
              <DrawerDescription>
                Ask for any action available in this organization.
              </DrawerDescription>
            </div>
            <DrawerClose asChild>
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                aria-label="Close Ceird Agent"
              >
                <X className="size-4" aria-hidden="true" />
              </Button>
            </DrawerClose>
          </div>
        </DrawerHeader>

        <div className="flex min-h-0 flex-1 flex-col">
          <AgentChatBody
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

function AgentChatBody({
  onRetry,
  threadState,
}: {
  readonly onRetry: () => void;
  readonly threadState: ThreadState;
}) {
  if (threadState.status === "loading") {
    return (
      <div className="flex flex-1 items-center justify-center px-6 py-10 text-sm text-muted-foreground">
        Preparing the agent
      </div>
    );
  }

  if (threadState.status === "error") {
    return (
      <div className="flex flex-1 items-center justify-center px-6 py-10">
        <div className="max-w-sm space-y-3 rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          <p>{threadState.error}</p>
          <Button type="button" variant="outline" size="sm" onClick={onRetry}>
            Retry
          </Button>
        </div>
      </div>
    );
  }

  if (threadState.status !== "ready") {
    return (
      <div className="flex flex-1 items-center justify-center px-6 py-10 text-sm text-muted-foreground">
        Open the agent to start a new conversation.
      </div>
    );
  }

  return (
    <React.Suspense
      fallback={
        <div className="flex flex-1 items-center justify-center px-6 py-10 text-sm text-muted-foreground">
          Preparing the agent
        </div>
      }
    >
      <AgentChatSession session={threadState.session} />
    </React.Suspense>
  );
}

function AgentChatSession({
  session,
}: {
  readonly session: AgentChatSessionState;
}) {
  const initialAuthorizationRef =
    React.useRef<AgentConnectAuthorization | null>(null);
  const initialAuthorizationAgentNameRef = React.useRef<string | null>(null);

  if (
    initialAuthorizationAgentNameRef.current !==
    session.authorization.agentInstanceName
  ) {
    initialAuthorizationRef.current = session.authorization;
    initialAuthorizationAgentNameRef.current =
      session.authorization.agentInstanceName;
  }

  const query = React.useCallback(async () => {
    const initialAuthorization = initialAuthorizationRef.current;

    if (initialAuthorization !== null) {
      initialAuthorizationRef.current = null;

      return { token: initialAuthorization.token };
    }

    const authorization = await authorizeCurrentAgentThread(session.threadId);

    if (
      authorization.agentInstanceName !==
      session.authorization.agentInstanceName
    ) {
      throw new Error("Agent authorization returned a different thread.");
    }

    return { token: authorization.token };
  }, [session.authorization.agentInstanceName, session.threadId]);
  const agent = useAgent({
    agent: "CeirdAgent",
    cacheTtl: AGENT_CONNECT_TOKEN_CACHE_TTL_MS,
    host: session.host,
    name: session.authorization.agentInstanceName,
    query,
    queryDeps: [session.threadId],
  });

  return <AgentConversation agent={agent} />;
}

function AgentConversation({ agent }: { readonly agent: AgentConnection }) {
  const {
    addToolApprovalResponse,
    error,
    isStreaming,
    messages,
    sendMessage,
    status,
  } = useAgentChat({
    agent,
  });
  const busy = status === "submitted" || status === "streaming" || isStreaming;

  return (
    <>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 sm:px-6">
        {messages.length === 0 ? (
          <div className="flex h-full min-h-64 flex-col items-center justify-center gap-3 text-center">
            <div className="flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Sparkles className="size-5" aria-hidden="true" />
            </div>
            <div className="max-w-xs space-y-1">
              <p className="font-medium">What should Ceird do?</p>
              <p className="text-sm text-muted-foreground">
                Create jobs, update sites, add labels, invite teammates, or ask
                for the next step.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((message) => (
              <AgentMessage
                key={getMessageKey(message)}
                message={message}
                onToolApprovalResponse={addToolApprovalResponse}
              />
            ))}
          </div>
        )}

        {busy ? (
          <p className="mt-4 text-xs text-muted-foreground">
            Ceird Agent is working
          </p>
        ) : null}

        {error ? (
          <p className="mt-4 rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {error.message}
          </p>
        ) : null}
      </div>

      <AgentComposer busy={busy} sendMessage={sendMessage} />
    </>
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
    <DrawerFooter className="shrink-0 gap-3 border-t px-5 py-3 sm:px-6">
      <div ref={composerRef} className="flex w-full items-end gap-2">
        <Textarea
          aria-label="Message Ceird Agent"
          className="max-h-32 min-h-12 flex-1 resize-none py-3"
          placeholder="Ask Ceird to do something"
          value={draft}
          onChange={(event) => {
            setDraft(event.currentTarget.value);
          }}
        />
        <Button
          type="button"
          size="icon-lg"
          aria-label="Send"
          disabled={!draft.trim() || busy}
          onClick={() => {
            void submitDraft();
          }}
        >
          <SendHorizontal className="size-4" aria-hidden="true" />
        </Button>
        <ShortcutHint
          decorative
          surface="button"
          hotkey={HOTKEYS.agentSubmit.hotkey}
          label={HOTKEYS.agentSubmit.label}
        />
      </div>
    </DrawerFooter>
  );
}

function AgentMessage({
  message,
  onToolApprovalResponse,
}: {
  readonly message: ChatMessage;
  readonly onToolApprovalResponse: (response: ToolApprovalResponse) => void;
}) {
  const isUser = message.role === "user";
  const parts = message.parts ?? [];

  return (
    <article className={cn("flex", isUser ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[85%] space-y-2 rounded-lg border px-3 py-2 text-sm",
          isUser
            ? "border-primary/20 bg-primary text-primary-foreground"
            : "border-border bg-muted/40 text-foreground"
        )}
      >
        <p
          className={cn(
            "text-xs",
            isUser ? "text-primary-foreground/70" : "text-muted-foreground"
          )}
        >
          {isUser ? "You" : "Ceird Agent"}
        </p>
        {parts.map((part) => (
          <AgentMessagePart
            key={getMessagePartKey(part)}
            part={part}
            onToolApprovalResponse={onToolApprovalResponse}
          />
        ))}
      </div>
    </article>
  );
}

function AgentMessagePart({
  part,
  onToolApprovalResponse,
}: {
  readonly part: ChatPart;
  readonly onToolApprovalResponse: (response: ToolApprovalResponse) => void;
}) {
  if (part.type === "text" && part.text) {
    return <p className="leading-6 whitespace-pre-wrap">{part.text}</p>;
  }

  if (part.type.startsWith("tool-") || part.type === "dynamic-tool") {
    const state = getToolPartState(part);
    const approval = getToolApproval(part);
    const input = getToolInput(part);
    const output = getToolOutput(part);
    const toolName = getToolName(part);

    return (
      <div className="space-y-2 rounded-md border border-border/70 bg-background/70 px-3 py-2">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate font-medium">{toolName}</span>
          <Badge variant="outline">{getToolStateLabel(state)}</Badge>
        </div>
        {input ? <ToolPayload label="Input" value={input} /> : null}
        {state === "waiting-approval" && approval ? (
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Button
              type="button"
              size="sm"
              onClick={() => {
                onToolApprovalResponse({
                  approved: true,
                  id: approval.id,
                });
              }}
            >
              Approve
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                onToolApprovalResponse({
                  approved: false,
                  id: approval.id,
                });
              }}
            >
              Reject
            </Button>
          </div>
        ) : null}
        {output ? <ToolPayload label="Result" value={output} /> : null}
      </div>
    );
  }

  return null;
}

function getToolStateLabel(state: ToolStateLabel): string {
  return TOOL_STATE_LABELS[state];
}

function getToolName(part: ChatPart) {
  if ("toolName" in part && typeof part.toolName === "string") {
    return part.toolName;
  }

  return part.type.startsWith("tool-")
    ? part.type.slice("tool-".length)
    : "Tool";
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

function ToolPayload({
  label,
  value,
}: {
  readonly label: string;
  readonly value: unknown;
}) {
  const renderedValue = React.useMemo(
    () => JSON.stringify(value, null, 2),
    [value]
  );

  return (
    <pre className="max-h-32 overflow-auto rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">
      {label}: {renderedValue}
    </pre>
  );
}

function resolveBrowserAgentHost() {
  return resolveAgentHost(
    typeof window === "undefined" ? undefined : window.location.origin
  );
}
