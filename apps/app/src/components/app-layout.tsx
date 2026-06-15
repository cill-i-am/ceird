"use client";
import type { OrganizationId, OrganizationRole } from "@ceird/identity-core";
import { Outlet } from "@tanstack/react-router";
import * as React from "react";

import { AppSidebar } from "#/components/app-sidebar";
import type { NavUserAccount } from "#/components/nav-user";
import { SiteHeader } from "#/components/site-header";
import { SidebarInset, SidebarProvider } from "#/components/ui/sidebar";
import {
  GLOBAL_AGENT_CHAT_OPEN_EVENT,
  GlobalAgentChat,
} from "#/features/agent/global-agent-chat";
import { EmailVerificationBanner } from "#/features/auth/email-verification-banner";
import {
  AppAgentCommandActions,
  AppGlobalCommandActions,
} from "#/features/command-bar/app-global-command-actions";
import { CommandBarProvider } from "#/features/command-bar/command-bar";
import { useAppHotkey } from "#/hotkeys/use-app-hotkey";

export type AppLayoutUser =
  | (NavUserAccount & {
      emailVerified: boolean;
    })
  | null;

export interface AppLayoutProps {
  activeOrganizationId?: OrganizationId | null | undefined;
  currentOrganizationRole?: OrganizationRole | undefined;
  user: AppLayoutUser;
}

export function AppLayout({
  activeOrganizationId,
  currentOrganizationRole,
  user,
}: AppLayoutProps) {
  const canUseAgent =
    activeOrganizationId !== null &&
    activeOrganizationId !== undefined &&
    currentOrganizationRole !== undefined;
  const [agentChatOpen, setAgentChatOpen] = React.useState(false);
  const [agentChatControlsReady, setAgentChatControlsReady] =
    React.useState(false);
  const previousActiveOrganizationId = React.useRef(activeOrganizationId);

  const openAgentChat = React.useCallback(() => {
    if (!canUseAgent) {
      return;
    }

    setAgentChatOpen(true);
  }, [canUseAgent]);
  const openAgentChatRef = React.useRef(openAgentChat);
  openAgentChatRef.current = openAgentChat;

  useAppHotkey("openAgentChat", openAgentChat, {
    enabled: canUseAgent && agentChatControlsReady,
  });

  React.useEffect(() => {
    const handleOpenAgentChatEvent = () => {
      openAgentChatRef.current();
    };

    window.addEventListener(
      GLOBAL_AGENT_CHAT_OPEN_EVENT,
      handleOpenAgentChatEvent
    );
    setAgentChatControlsReady(true);

    return () => {
      window.removeEventListener(
        GLOBAL_AGENT_CHAT_OPEN_EVENT,
        handleOpenAgentChatEvent
      );
      setAgentChatControlsReady(false);
    };
  }, []);

  React.useEffect(() => {
    if (canUseAgent) {
      return;
    }

    setAgentChatOpen(false);
  }, [canUseAgent]);

  React.useEffect(() => {
    if (previousActiveOrganizationId.current === activeOrganizationId) {
      return;
    }

    previousActiveOrganizationId.current = activeOrganizationId;
    setAgentChatOpen(false);
  }, [activeOrganizationId]);

  return (
    <CommandBarProvider>
      <AppGlobalCommandActions />
      <AppAgentCommandActions
        activeOrganizationId={activeOrganizationId}
        currentOrganizationRole={currentOrganizationRole}
      />
      <SidebarProvider className="[--header-height:calc(--spacing(15))]">
        <AppSidebar
          activeOrganizationId={activeOrganizationId}
          currentOrganizationRole={currentOrganizationRole}
          user={user}
        />
        <SidebarInset className="min-h-svh overflow-hidden border border-border/60 bg-background/94 shadow-[0_1px_0_color-mix(in_oklab,var(--border)_65%,transparent)] supports-[backdrop-filter]:bg-background/88">
          <SiteHeader
            agentChatOpen={agentChatOpen}
            agentChatControlsReady={agentChatControlsReady}
            canUseAgent={canUseAgent}
            currentOrganizationRole={currentOrganizationRole}
            onOpenAgentChat={openAgentChat}
          />
          <div className="flex flex-1 flex-col overflow-x-clip">
            {user && !user.emailVerified ? (
              <EmailVerificationBanner
                email={user.email}
                emailVerified={user.emailVerified}
              />
            ) : null}
            <Outlet />
          </div>
        </SidebarInset>
      </SidebarProvider>
      <GlobalAgentChat
        activeOrganizationId={activeOrganizationId}
        currentOrganizationRole={currentOrganizationRole}
        onOpenChange={setAgentChatOpen}
        open={agentChatOpen}
      />
    </CommandBarProvider>
  );
}
