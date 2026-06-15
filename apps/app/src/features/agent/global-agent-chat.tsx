"use client";

import type { OrganizationId, OrganizationRole } from "@ceird/identity-core";

import { GlobalAgentChatPanel } from "./global-agent-chat-panel";

interface GlobalAgentChatProps {
  readonly activeOrganizationId?: OrganizationId | null | undefined;
  readonly currentOrganizationRole?: OrganizationRole | undefined;
  readonly onOpenChange: (open: boolean) => void;
  readonly open: boolean;
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
    <GlobalAgentChatPanel
      activeOrganizationId={activeOrganizationId}
      currentOrganizationRole={currentOrganizationRole}
      open={open}
      onOpenChange={onOpenChange}
    />
  );
}
