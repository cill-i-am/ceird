"use client";

import type { OrganizationId, OrganizationRole } from "@ceird/identity-core";
import { Sparkles } from "lucide-react";
import * as React from "react";

import { buttonVariants } from "#/components/ui/button";
import { useAppHotkey } from "#/hotkeys/use-app-hotkey";
import { cn } from "#/lib/utils";

export const GLOBAL_AGENT_CHAT_OPEN_EVENT = "ceird:agent-chat-open";

const GlobalAgentChatPanel = React.lazy(async () => {
  const { GlobalAgentChatPanel: Panel } =
    await import("./global-agent-chat-panel");

  return { default: Panel };
});

interface GlobalAgentChatProps {
  readonly activeOrganizationId?: OrganizationId | null | undefined;
  readonly currentOrganizationRole?: OrganizationRole | undefined;
}

export function requestOpenGlobalAgentChat() {
  window.dispatchEvent(new CustomEvent(GLOBAL_AGENT_CHAT_OPEN_EVENT));
}

export function GlobalAgentChat({
  activeOrganizationId,
  currentOrganizationRole,
}: GlobalAgentChatProps) {
  const canUseAgent =
    activeOrganizationId !== null &&
    activeOrganizationId !== undefined &&
    currentOrganizationRole !== undefined;
  const [open, setOpen] = React.useState(false);
  const previousActiveOrganizationId = React.useRef(activeOrganizationId);

  const startAgentChat = React.useCallback(() => {
    if (!canUseAgent) {
      return;
    }

    setOpen(true);
  }, [canUseAgent]);
  const startAgentChatRef = React.useRef(startAgentChat);
  startAgentChatRef.current = startAgentChat;

  useAppHotkey("openAgentChat", startAgentChat, {
    enabled: canUseAgent,
  });

  React.useEffect(() => {
    const handleOpenAgentChatEvent = () => {
      startAgentChatRef.current();
    };

    window.addEventListener(
      GLOBAL_AGENT_CHAT_OPEN_EVENT,
      handleOpenAgentChatEvent
    );

    return () => {
      window.removeEventListener(
        GLOBAL_AGENT_CHAT_OPEN_EVENT,
        handleOpenAgentChatEvent
      );
    };
  }, []);

  React.useEffect(() => {
    if (canUseAgent) {
      return;
    }

    setOpen(false);
  }, [canUseAgent]);

  React.useEffect(() => {
    if (previousActiveOrganizationId.current === activeOrganizationId) {
      return;
    }

    previousActiveOrganizationId.current = activeOrganizationId;
    setOpen(false);
  }, [activeOrganizationId]);

  if (!canUseAgent) {
    return null;
  }

  return (
    <>
      <button
        type="button"
        className={cn(
          buttonVariants({ size: "sm" }),
          "fixed right-4 bottom-4 z-30 h-10 rounded-full px-4 shadow-lg shadow-primary/15 sm:right-5 sm:bottom-5"
        )}
        aria-label="Open Ceird Agent"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={startAgentChat}
      >
        <Sparkles className="size-4" aria-hidden="true" />
        <span>Agent</span>
      </button>

      {open ? (
        <React.Suspense fallback={null}>
          <GlobalAgentChatPanel
            activeOrganizationId={activeOrganizationId}
            currentOrganizationRole={currentOrganizationRole}
            open={open}
            onOpenChange={setOpen}
          />
        </React.Suspense>
      ) : null}
    </>
  );
}
