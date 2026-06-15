"use client";

import type { OrganizationId, OrganizationRole } from "@ceird/identity-core";
import * as React from "react";

export const GLOBAL_AGENT_CHAT_OPEN_EVENT = "ceird:agent-chat-open";

const GlobalAgentChatPanel = React.lazy(async () => {
  const { GlobalAgentChatPanel: Panel } =
    await import("./global-agent-chat-panel");

  return { default: Panel };
});

interface GlobalAgentChatProps {
  readonly activeOrganizationId?: OrganizationId | null | undefined;
  readonly currentOrganizationRole?: OrganizationRole | undefined;
  readonly onOpenChange: (open: boolean) => void;
  readonly open: boolean;
}

export function requestOpenGlobalAgentChat() {
  window.dispatchEvent(new CustomEvent(GLOBAL_AGENT_CHAT_OPEN_EVENT));
}

export function GlobalAgentChat({
  activeOrganizationId,
  currentOrganizationRole,
  onOpenChange,
  open,
}: GlobalAgentChatProps) {
  const canUseAgent =
    activeOrganizationId !== null &&
    activeOrganizationId !== undefined &&
    currentOrganizationRole !== undefined;

  if (!canUseAgent || !open) {
    return null;
  }

  return (
    <React.Suspense fallback={null}>
      <GlobalAgentChatPanel
        activeOrganizationId={activeOrganizationId}
        currentOrganizationRole={currentOrganizationRole}
        open={open}
        onOpenChange={onOpenChange}
      />
    </React.Suspense>
  );
}
