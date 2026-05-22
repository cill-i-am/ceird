import type * as AiChatReactModule from "@cloudflare/ai-chat/react";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type * as AgentsReactModule from "agents/react";
import type { ComponentProps } from "react";

import type * as DrawerModule from "#/components/ui/drawer";
import type * as ResponsiveDrawerModule from "#/components/ui/responsive-drawer";
import type * as AgentOriginModule from "#/lib/agent-origin";

import type * as AgentClientModule from "./agent-client";
import { GlobalAgentChat } from "./global-agent-chat";

type TestAgentThread = Awaited<
  ReturnType<typeof AgentClientModule.ensureCurrentAgentThread>
>;

const thread: TestAgentThread = {
  agentInstanceName:
    "org:org_123:user:user_123:thread:11111111-1111-4111-8111-111111111111" as TestAgentThread["agentInstanceName"],
  createdAt: "2026-05-21T09:00:00.000Z",
  id: "11111111-1111-4111-8111-111111111111" as TestAgentThread["id"],
  lastMessageAt: null,
  status: "active",
  title: "New conversation",
  updatedAt: "2026-05-21T09:00:00.000Z",
};

function missingAgentHost(): string | undefined {
  return undefined;
}

const {
  mockedAuthorizeCurrentAgentThread,
  mockedAddToolApprovalResponse,
  mockedEnsureCurrentAgentThread,
  mockedResolveAgentHost,
  mockedSendMessage,
  mockedUseAgent,
  mockedUseAgentChat,
} = vi.hoisted(() => ({
  mockedAuthorizeCurrentAgentThread:
    vi.fn<typeof AgentClientModule.authorizeCurrentAgentThread>(),
  mockedAddToolApprovalResponse:
    vi.fn<
      (response: { readonly approved: boolean; readonly id: string }) => void
    >(),
  mockedEnsureCurrentAgentThread:
    vi.fn<typeof AgentClientModule.ensureCurrentAgentThread>(),
  mockedResolveAgentHost: vi.fn<typeof AgentOriginModule.resolveAgentHost>(),
  mockedSendMessage:
    vi.fn<(message: { readonly text: string }) => Promise<void>>(),
  mockedUseAgent: vi.fn<typeof AgentsReactModule.useAgent>(),
  mockedUseAgentChat: vi.fn<typeof AiChatReactModule.useAgentChat>(),
}));

vi.mock(import("./agent-client"), () => ({
  authorizeCurrentAgentThread: mockedAuthorizeCurrentAgentThread,
  ensureCurrentAgentThread: mockedEnsureCurrentAgentThread,
}));

vi.mock(import("#/lib/agent-origin"), () => ({
  resolveAgentHost: mockedResolveAgentHost,
}));

vi.mock(import("agents/react"), () => ({
  useAgent: mockedUseAgent as typeof AgentsReactModule.useAgent,
}));

vi.mock(import("@cloudflare/ai-chat/react"), () => {
  const getToolApproval = ((part: { readonly approval?: unknown }) =>
    part.approval) as typeof AiChatReactModule.getToolApproval;
  const getToolInput = ((part: { readonly input?: unknown }) =>
    part.input) as typeof AiChatReactModule.getToolInput;
  const getToolOutput = ((part: { readonly output?: unknown }) =>
    part.output) as typeof AiChatReactModule.getToolOutput;
  const getToolPartState = ((part: { readonly state?: string }) =>
    part.state === "approval-requested"
      ? "waiting-approval"
      : "complete") as typeof AiChatReactModule.getToolPartState;

  return {
    getToolApproval,
    getToolInput,
    getToolOutput,
    getToolPartState,
    useAgentChat: mockedUseAgentChat as typeof AiChatReactModule.useAgentChat,
  };
});

vi.mock(import("#/components/ui/responsive-drawer"), () => {
  const ResponsiveDrawer = (({
    children,
    open,
  }: ComponentProps<"div"> & { readonly open?: boolean }) =>
    open ? (
      <div data-testid="agent-chat-drawer">{children}</div>
    ) : null) as typeof ResponsiveDrawerModule.ResponsiveDrawer;

  return { ResponsiveDrawer };
});

vi.mock(import("#/components/ui/drawer"), async (importActual) => {
  const actual = await importActual<typeof DrawerModule>();

  return {
    ...actual,
    DrawerClose: (({
      children,
    }: ComponentProps<typeof DrawerModule.DrawerClose>) => (
      <>{children}</>
    )) as typeof DrawerModule.DrawerClose,
    DrawerContent: (({ children, ...props }: ComponentProps<"section">) => (
      <section {...props}>{children}</section>
    )) as typeof DrawerModule.DrawerContent,
    DrawerDescription: ((props: ComponentProps<"p">) => (
      <p {...props} />
    )) as typeof DrawerModule.DrawerDescription,
    DrawerFooter: ((props: ComponentProps<"div">) => (
      <div {...props} />
    )) as typeof DrawerModule.DrawerFooter,
    DrawerHeader: ((props: ComponentProps<"div">) => (
      <div {...props} />
    )) as typeof DrawerModule.DrawerHeader,
    DrawerTitle: (({ children, ...props }: ComponentProps<"h2">) => (
      <h2 {...props}>{children}</h2>
    )) as typeof DrawerModule.DrawerTitle,
  };
});

describe("global agent chat", () => {
  beforeEach(() => {
    mockedAuthorizeCurrentAgentThread.mockResolvedValue({
      agentInstanceName: thread.agentInstanceName,
      token: "agent-connect-token",
    });
    mockedEnsureCurrentAgentThread.mockResolvedValue(thread);
    mockedResolveAgentHost.mockReturnValue("agent.example.com");
    mockedSendMessage.mockImplementation(async () => {});
    mockedUseAgent.mockReturnValue({
      addEventListener: () => {},
      agent: "ceird-agent",
      getHttpUrl: () => "https://agent.example.com/agents/ceird-agent/thread",
      name: thread.agentInstanceName,
      path: [{ agent: "ceird-agent", name: thread.agentInstanceName }],
      removeEventListener: () => {},
      send: () => {},
    } as unknown as ReturnType<typeof AgentsReactModule.useAgent>);
    mockedUseAgentChat.mockReturnValue({
      clearHistory: () => {},
      error: undefined,
      isStreaming: false,
      messages: [
        {
          id: "message-1",
          parts: [{ text: "Add a label to the boiler job", type: "text" }],
          role: "user",
        },
        {
          id: "message-2",
          parts: [
            { text: "I can do that. Which label?", type: "text" },
            { toolName: "jobs.assignLabel", type: "tool-jobs.assignLabel" },
          ],
          role: "assistant",
        },
      ],
      addToolApprovalResponse: mockedAddToolApprovalResponse,
      sendMessage: mockedSendMessage,
      status: "ready",
    } as unknown as ReturnType<typeof AiChatReactModule.useAgentChat>);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("stays hidden when there is no active organization", () => {
    render(<GlobalAgentChat activeOrganizationId={null} />);

    expect(
      screen.queryByRole("button", { name: /open ceird agent/i })
    ).not.toBeInTheDocument();
  });

  it("stays hidden until the active organization role is known", () => {
    render(<GlobalAgentChat activeOrganizationId={"org_123" as never} />);

    expect(
      screen.queryByRole("button", { name: /open ceird agent/i })
    ).not.toBeInTheDocument();
  });

  it("ignores app-level open events until agent access is available", () => {
    render(<GlobalAgentChat activeOrganizationId={"org_123" as never} />);

    act(() => {
      window.dispatchEvent(new CustomEvent("ceird:agent-chat-open"));
    });

    expect(mockedEnsureCurrentAgentThread).not.toHaveBeenCalled();
    expect(mockedAuthorizeCurrentAgentThread).not.toHaveBeenCalled();
  });

  it("opens one app-level drawer and authorizes the org user thread", async () => {
    const user = userEvent.setup();
    render(
      <GlobalAgentChat
        activeOrganizationId={"org_123" as never}
        currentOrganizationRole="owner"
      />
    );

    await user.click(screen.getByRole("button", { name: /open ceird agent/i }));

    await expect(
      screen.findByRole("heading", { name: /ceird agent/i })
    ).resolves.toBeVisible();
    expect(mockedEnsureCurrentAgentThread).toHaveBeenCalledOnce();
    await waitFor(() => {
      expect(mockedUseAgent).toHaveBeenCalledWith(
        expect.objectContaining({
          agent: "CeirdAgent",
          cacheTtl: expect.any(Number),
          host: "agent.example.com",
          name: thread.agentInstanceName,
          query: expect.any(Function),
          queryDeps: [thread.id],
        })
      );
    });
    const useAgentOptions = mockedUseAgent.mock.calls.at(-1)?.[0];
    expect(useAgentOptions?.cacheTtl).toBeLessThan(300_000);
    mockedAuthorizeCurrentAgentThread.mockClear();
    const refreshQuery = useAgentOptions?.query as () => Promise<{
      readonly token: string;
    }>;
    await expect(refreshQuery()).resolves.toStrictEqual({
      token: "agent-connect-token",
    });
    expect(mockedAuthorizeCurrentAgentThread).not.toHaveBeenCalled();
    mockedAuthorizeCurrentAgentThread.mockResolvedValueOnce({
      agentInstanceName: thread.agentInstanceName,
      token: "agent-connect-token-refreshed",
    });
    await expect(refreshQuery()).resolves.toStrictEqual({
      token: "agent-connect-token-refreshed",
    });
    expect(mockedAuthorizeCurrentAgentThread).toHaveBeenCalledWith(thread.id);
    const useAgentChatOptions = mockedUseAgentChat.mock.calls.at(-1)?.[0];
    expect(useAgentChatOptions?.getInitialMessages).toBeUndefined();
  });

  it("shows a retryable configuration error before creating a thread", async () => {
    const user = userEvent.setup();
    mockedResolveAgentHost.mockImplementation(missingAgentHost);
    render(
      <GlobalAgentChat
        activeOrganizationId={"org_123" as never}
        currentOrganizationRole="owner"
      />
    );

    await user.click(screen.getByRole("button", { name: /open ceird agent/i }));

    await expect(
      screen.findByText(/agent worker origin is not configured/i)
    ).resolves.toBeVisible();
    expect(mockedEnsureCurrentAgentThread).not.toHaveBeenCalled();

    mockedResolveAgentHost.mockReturnValue("agent.example.com");
    await user.click(screen.getByRole("button", { name: /retry/i }));

    await waitFor(() => {
      expect(mockedEnsureCurrentAgentThread).toHaveBeenCalledOnce();
    });
  });

  it("keeps authorization failures inside the retryable drawer state", async () => {
    const user = userEvent.setup();
    mockedAuthorizeCurrentAgentThread
      .mockRejectedValueOnce(new Error("Agent authorization failed."))
      .mockResolvedValueOnce({
        agentInstanceName: thread.agentInstanceName,
        token: "agent-connect-token",
      });
    render(
      <GlobalAgentChat
        activeOrganizationId={"org_123" as never}
        currentOrganizationRole="owner"
      />
    );

    await user.click(screen.getByRole("button", { name: /open ceird agent/i }));

    await expect(
      screen.findByText("Agent authorization failed.")
    ).resolves.toBeVisible();
    expect(mockedUseAgent).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: /retry/i }));

    await waitFor(() => {
      expect(mockedUseAgent).toHaveBeenCalledWith(
        expect.objectContaining({
          query: expect.any(Function),
        })
      );
    });
  });

  it("renders chat messages, tool activity, and submits prompts", async () => {
    const user = userEvent.setup();
    render(
      <GlobalAgentChat
        activeOrganizationId={"org_123" as never}
        currentOrganizationRole="owner"
      />
    );

    await user.click(screen.getByRole("button", { name: /open ceird agent/i }));

    const drawer = await screen.findByTestId("agent-chat-drawer");
    await expect(
      within(drawer).findByText("Add a label to the boiler job")
    ).resolves.toBeVisible();
    expect(
      within(drawer).getByText("I can do that. Which label?")
    ).toBeVisible();
    expect(within(drawer).getByText(/jobs.assignLabel/i)).toBeVisible();

    await user.type(
      within(drawer).getByRole("textbox", { name: /message ceird agent/i }),
      "Use the urgent label"
    );
    await user.click(within(drawer).getByRole("button", { name: /^send$/i }));

    await waitFor(() => {
      expect(mockedSendMessage).toHaveBeenCalledWith({
        text: "Use the urgent label",
      });
    });
    expect(
      within(drawer).getByRole("textbox", { name: /message ceird agent/i })
    ).toHaveValue("");
  });

  it("lets users approve or reject approval-gated tool calls", async () => {
    const user = userEvent.setup();
    mockedUseAgentChat.mockReturnValue({
      clearHistory: () => {},
      error: undefined,
      isStreaming: false,
      messages: [
        {
          id: "message-approval",
          parts: [
            {
              approval: { id: "approval-delete-label" },
              input: { labelId: "label_123" },
              state: "approval-requested",
              toolName: "deleteLabel",
              type: "tool-deleteLabel",
            },
          ],
          role: "assistant",
        },
      ],
      addToolApprovalResponse: mockedAddToolApprovalResponse,
      sendMessage: mockedSendMessage,
      status: "ready",
    } as unknown as ReturnType<typeof AiChatReactModule.useAgentChat>);
    render(
      <GlobalAgentChat
        activeOrganizationId={"org_123" as never}
        currentOrganizationRole="owner"
      />
    );

    await user.click(screen.getByRole("button", { name: /open ceird agent/i }));

    const drawer = await screen.findByTestId("agent-chat-drawer");
    expect(within(drawer).getByText("deleteLabel")).toBeVisible();
    expect(within(drawer).getByText("Approval needed")).toBeVisible();

    await user.click(within(drawer).getByRole("button", { name: /approve/i }));
    expect(mockedAddToolApprovalResponse).toHaveBeenCalledWith({
      approved: true,
      id: "approval-delete-label",
    });

    await user.click(within(drawer).getByRole("button", { name: /reject/i }));
    expect(mockedAddToolApprovalResponse).toHaveBeenCalledWith({
      approved: false,
      id: "approval-delete-label",
    });
  });
});
