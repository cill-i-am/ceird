import type * as RouterModule from "@tanstack/react-router";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { memo } from "react";
import type { ComponentProps, ReactElement } from "react";

import type * as SidebarModule from "#/components/ui/sidebar";

import { AppLayout } from "./app-layout";

const {
  mockedAppSidebar,
  mockedEmailVerificationBanner,
  mockedGlobalAgentChat,
  mockedSiteHeader,
  mockedSidebarInset,
} = vi.hoisted(() => ({
  mockedAppSidebar: vi.fn<
    ({
      user,
    }: {
      user?: {
        name: string;
        email: string;
        image?: string | null;
      } | null;
    } & ComponentProps<"div">) => ReactElement
  >(
    ({
      activeOrganizationId: _activeOrganizationId,
      currentOrganizationRole: _currentOrganizationRole,
      user,
      ...props
    }: {
      activeOrganizationId?: unknown;
      currentOrganizationRole?: unknown;
      user?: {
        name: string;
        email: string;
        image?: string | null;
      } | null;
    } & ComponentProps<"div">) => (
      <aside data-testid="app-sidebar" {...props}>
        {user?.name ?? "missing user"}
      </aside>
    )
  ),
  mockedEmailVerificationBanner: vi.fn<
    ({
      email,
      emailVerified,
    }: {
      email: string;
      emailVerified: boolean;
    }) => ReactElement
  >(({ email, emailVerified }) => (
    <div data-testid="email-verification-banner">
      {email}:{String(emailVerified)}
    </div>
  )),
  mockedGlobalAgentChat: vi.fn<
    ({
      activeOrganizationId,
      currentOrganizationRole,
      onOpenChange,
      open,
    }: {
      activeOrganizationId?: unknown;
      currentOrganizationRole?: unknown;
      onOpenChange?: (open: boolean) => void;
      open?: boolean;
    }) => ReactElement | null
  >(({ activeOrganizationId, currentOrganizationRole, open }) =>
    activeOrganizationId && currentOrganizationRole ? (
      <div data-open={String(open)} data-testid="global-agent-chat" />
    ) : null
  ),
  mockedSiteHeader: vi.fn<
    ({
      agentChatOpen,
      canUseAgent,
      onOpenAgentChat,
    }: {
      agentChatOpen?: boolean;
      canUseAgent?: boolean;
      onOpenAgentChat?: () => void;
    }) => ReactElement
  >(({ agentChatOpen, canUseAgent, onOpenAgentChat }) => (
    <header
      data-agent-chat-open={String(agentChatOpen)}
      data-can-use-agent={String(canUseAgent)}
      data-testid="site-header"
    >
      {canUseAgent ? (
        <button type="button" onClick={onOpenAgentChat}>
          Ask Ceird
        </button>
      ) : null}
    </header>
  )),
  mockedSidebarInset: vi.fn<
    ({ children, ...props }: ComponentProps<"div">) => ReactElement
  >(({ children, ...props }: ComponentProps<"div">) => (
    <div data-testid="sidebar-inset" {...props}>
      {children}
    </div>
  )),
}));

const { mockedNavigate } = vi.hoisted(() => ({
  mockedNavigate: vi.fn<(...args: unknown[]) => unknown>(),
}));

vi.mock(import("@tanstack/react-router"), () => ({
  Outlet: memo(() => <div data-testid="app-layout-outlet" />),
  useNavigate: (() => mockedNavigate) as typeof RouterModule.useNavigate,
}));

vi.mock(import("#/components/ui/sidebar"), () => ({
  SidebarInset:
    mockedSidebarInset as unknown as typeof SidebarModule.SidebarInset,
  SidebarProvider: (({ children, ...props }: ComponentProps<"div">) => (
    <div data-testid="sidebar-provider" {...props}>
      {children}
    </div>
  )) as unknown as typeof SidebarModule.SidebarProvider,
}));

vi.mock(import("#/components/site-header"), () => ({
  SiteHeader: mockedSiteHeader,
}));

vi.mock(import("#/components/app-sidebar"), () => ({
  AppSidebar: mockedAppSidebar,
}));

vi.mock(import("#/features/auth/email-verification-banner"), () => ({
  EmailVerificationBanner: mockedEmailVerificationBanner,
}));

vi.mock(import("#/features/agent/global-agent-chat"), () => ({
  GLOBAL_AGENT_CHAT_OPEN_EVENT: "ceird:agent-chat-open" as const,
  GlobalAgentChat: mockedGlobalAgentChat,
  requestOpenGlobalAgentChat: vi.fn<() => void>(),
}));

describe("app layout", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it(
    "passes the provided session user into the app sidebar",
    {
      timeout: 10_000,
    },
    () => {
      render(
        <AppLayout
          user={{
            name: "Taylor Example",
            email: "person@example.com",
            emailVerified: false,
            image: null,
          }}
        />
      );

      expect(mockedAppSidebar).toHaveBeenCalledOnce();
      expect(mockedAppSidebar.mock.calls[0]?.[0]).toStrictEqual({
        activeOrganizationId: undefined,
        currentOrganizationRole: undefined,
        user: {
          name: "Taylor Example",
          email: "person@example.com",
          emailVerified: false,
          image: null,
        },
      });
      expect(mockedEmailVerificationBanner).toHaveBeenCalledOnce();
      expect(mockedEmailVerificationBanner.mock.calls[0]?.[0]).toStrictEqual({
        email: "person@example.com",
        emailVerified: false,
      });
      expect(screen.getByTestId("email-verification-banner")).toHaveTextContent(
        "person@example.com:false"
      );
      expect(screen.getByTestId("app-sidebar")).toHaveTextContent(
        "Taylor Example"
      );
      expect(mockedSidebarInset).toHaveBeenCalledOnce();
      expect(mockedSidebarInset.mock.calls[0]?.[0].className).toContain(
        "overflow-hidden"
      );
      expect(screen.getByTestId("sidebar-inset")).toContainElement(
        screen.getByTestId("app-layout-outlet")
      );
    }
  );

  it(
    "skips the verification banner for verified users",
    {
      timeout: 10_000,
    },
    () => {
      render(
        <AppLayout
          user={{
            name: "Taylor Example",
            email: "person@example.com",
            emailVerified: true,
            image: null,
          }}
        />
      );

      expect(mockedEmailVerificationBanner).not.toHaveBeenCalled();
      expect(
        screen.queryByTestId("email-verification-banner")
      ).not.toBeInTheDocument();
    }
  );

  it(
    "does not expose organization commands from the app shell",
    {
      timeout: 10_000,
    },
    async () => {
      render(
        <AppLayout
          user={{
            name: "Taylor Example",
            email: "person@example.com",
            emailVerified: true,
            image: null,
          }}
        />
      );

      fireEvent.keyDown(window, { key: "k", metaKey: true });

      await waitFor(() => {
        expect(
          screen.getByRole("option", { name: /open user settings/i })
        ).toBeInTheDocument();
      });

      expect(
        screen.queryByRole("option", { name: /go to jobs/i })
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("option", { name: /go to sites/i })
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("option", { name: /open organization settings/i })
      ).not.toBeInTheDocument();
    }
  );

  it(
    "wires the shell Ask Ceird action to the app-level agent chat",
    {
      timeout: 10_000,
    },
    () => {
      const { rerender } = render(
        <AppLayout
          activeOrganizationId={"org_123" as never}
          currentOrganizationRole="owner"
          user={{
            name: "Taylor Example",
            email: "person@example.com",
            emailVerified: true,
            image: null,
          }}
        />
      );

      expect(mockedGlobalAgentChat.mock.lastCall?.[0]).toStrictEqual({
        activeOrganizationId: "org_123",
        currentOrganizationRole: "owner",
        onOpenChange: expect.any(Function),
        open: false,
      });
      expect(
        screen.getByRole("button", { name: /ask ceird/i })
      ).toBeInTheDocument();
      expect(screen.getByTestId("site-header")).toHaveAttribute(
        "data-agent-chat-open",
        "false"
      );

      fireEvent.click(screen.getByRole("button", { name: /ask ceird/i }));

      expect(mockedGlobalAgentChat.mock.lastCall?.[0]).toStrictEqual({
        activeOrganizationId: "org_123",
        currentOrganizationRole: "owner",
        onOpenChange: expect.any(Function),
        open: true,
      });
      expect(screen.getByTestId("site-header")).toHaveAttribute(
        "data-agent-chat-open",
        "true"
      );

      rerender(
        <AppLayout
          activeOrganizationId={null}
          user={{
            name: "Taylor Example",
            email: "person@example.com",
            emailVerified: true,
            image: null,
          }}
        />
      );

      expect(mockedGlobalAgentChat.mock.lastCall?.[0]).toStrictEqual({
        activeOrganizationId: null,
        currentOrganizationRole: undefined,
        onOpenChange: expect.any(Function),
        open: false,
      });
      expect(
        screen.queryByRole("button", { name: /ask ceird/i })
      ).not.toBeInTheDocument();
    }
  );
});
