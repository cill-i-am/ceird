import {
  AGENT_ACTIONS_MANIFEST,
  AGENT_PROXIMITY_ORIGIN_CONTEXT_ID_BODY_KEY,
  AGENT_PROXIMITY_ORIGIN_CONTEXT_MESSAGE_TYPE,
} from "@ceird/agents-core";
import type {
  JobProximityResponse,
  JobRoutePreviewResponse,
  WorkItemIdType,
} from "@ceird/jobs-core";
import type {
  ProximityOriginSuggestion,
  TypedOrigin,
} from "@ceird/proximity-core";
import type {
  GooglePlaceIdType,
  SiteIdType,
  SiteProximityResponse,
} from "@ceird/sites-core";
import type * as AiChatReactModule from "@cloudflare/ai-chat/react";
import {
  act,
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type * as AgentsReactModule from "agents/react";
import { Effect } from "effect";
import type { ComponentProps } from "react";

import type * as DrawerModule from "#/components/ui/drawer";
import type * as ResponsiveDrawerModule from "#/components/ui/responsive-drawer";
import type * as ProximityApiModule from "#/features/proximity/proximity-api";
import type * as UserPreferencesApiModule from "#/features/settings/user-preferences-api";
import type * as AgentOriginModule from "#/lib/agent-origin";

import type * as AgentClientModule from "./agent-client";
import { GlobalAgentChat } from "./global-agent-chat";

type TestAgentThread = Awaited<
  ReturnType<typeof AgentClientModule.ensureCurrentAgentThread>
>;
type TestPreparedAgentSession = Awaited<
  ReturnType<typeof AgentClientModule.prepareCurrentAgentSession>
>;
type UseAgentChatOptions = Parameters<typeof AiChatReactModule.useAgentChat>[0];

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

const routeSummary = {
  computedAt: "2026-06-06T10:00:00.000Z",
  distanceMeters: 4200,
  durationSeconds: 840,
  provider: "google_routes",
  providerRequestKind: "matrix",
  routeStatus: "ok",
  trafficAware: true,
} as const;

const originSummary = {
  computedAt: "2026-06-06T10:00:00.000Z",
  coordinates: { latitude: 53.349_805, longitude: -6.260_31 },
  displayText: "Current location",
  mode: "current_location",
} as const;

function firstFixtureItem<T>(items: readonly T[], label: string): T {
  const [item] = items;

  if (item === undefined) {
    throw new Error(`Expected ${label} fixture to include an item`);
  }

  return item;
}

const mappedSite = {
  addressLine1: "1 Custom House Quay",
  county: "Dublin",
  country: "IE",
  displayLocation: "1 Custom House Quay, Dublin, D01 X2X2",
  eircode: "D01 X2X2",
  formattedAddress: "1 Custom House Quay, Dublin, D01 X2X2, Ireland",
  googlePlaceId: "ChIJdocklands" as GooglePlaceIdType,
  hasUsableCoordinates: true,
  id: "33333333-3333-4333-8333-333333333333" as SiteIdType,
  labels: [],
  latitude: 53.3498,
  locationProvider: "google_places",
  locationResolvedAt: "2026-04-27T10:00:00.000Z",
  locationStatus: "google_resolved",
  longitude: -6.2603,
  name: "Docklands Campus",
  town: "Dublin",
} satisfies SiteProximityResponse["rows"][number]["site"];

const nearbyJobResponse: JobProximityResponse = {
  meta: {
    candidateCount: 1,
    candidateLimitApplied: false,
    excluded: [],
    rankedCandidateLimit: 100,
  },
  origin: originSummary,
  rows: [
    {
      job: {
        createdAt: "2026-04-23T11:00:00.000Z",
        id: "11111111-1111-4111-8111-111111111111" as WorkItemIdType,
        kind: "job",
        labels: [],
        priority: "urgent",
        status: "new",
        title: "Inspect boiler",
        updatedAt: "2026-04-23T12:00:00.000Z",
      },
      routeSummary,
      site: mappedSite,
    },
  ],
};

const nearbySiteResponse: SiteProximityResponse = {
  meta: {
    candidateCount: 1,
    candidateLimitApplied: false,
    excluded: [],
    rankedCandidateLimit: 100,
  },
  origin: originSummary,
  rows: [
    {
      activeJobCount: 2,
      highestActiveJobPriority: "urgent",
      routeSummary,
      site: mappedSite,
    },
  ],
};

const jobRoutePreviewResponse: JobRoutePreviewResponse = {
  job: firstFixtureItem(nearbyJobResponse.rows, "nearby jobs").job,
  origin: originSummary,
  routeLine: {
    coordinates: [
      { latitude: 53.349_805, longitude: -6.260_31 },
      { latitude: 53.3498, longitude: -6.2603 },
    ],
    format: "geojson_linestring",
  },
  routeSummary,
  site: mappedSite,
};

function missingAgentHost(): string | undefined {
  return undefined;
}

const {
  mockedAutocompleteProximityOrigin,
  mockedAuthorizeCurrentAgentThread,
  mockedAddToolApprovalResponse,
  mockedAgentSend,
  mockedEnsureCurrentAgentThread,
  mockedGetCurrentUserPreferences,
  mockedPrepareCurrentAgentSession,
  mockedResolveAgentHost,
  mockedResolveProximityOriginPlace,
  mockedSendMessage,
  mockedUpdateCurrentUserPreferences,
  mockedUseAgent,
  mockedUseAgentChat,
} = vi.hoisted(() => ({
  mockedAutocompleteProximityOrigin:
    vi.fn<typeof ProximityApiModule.autocompleteProximityOrigin>(),
  mockedAuthorizeCurrentAgentThread:
    vi.fn<typeof AgentClientModule.authorizeCurrentAgentThread>(),
  mockedAddToolApprovalResponse:
    vi.fn<
      (response: { readonly approved: boolean; readonly id: string }) => void
    >(),
  mockedAgentSend: vi.fn<(data: string) => void>(),
  mockedEnsureCurrentAgentThread:
    vi.fn<typeof AgentClientModule.ensureCurrentAgentThread>(),
  mockedGetCurrentUserPreferences: vi.fn<
    () => Promise<{
      preferences: {
        routeProximityLocationEnabled: boolean;
        updatedAt: string;
      };
    }>
  >(),
  mockedPrepareCurrentAgentSession:
    vi.fn<typeof AgentClientModule.prepareCurrentAgentSession>(),
  mockedResolveAgentHost: vi.fn<typeof AgentOriginModule.resolveAgentHost>(),
  mockedResolveProximityOriginPlace:
    vi.fn<typeof ProximityApiModule.resolveProximityOriginPlace>(),
  mockedSendMessage:
    vi.fn<(message: { readonly text: string }) => Promise<void>>(),
  mockedUpdateCurrentUserPreferences:
    vi.fn<typeof UserPreferencesApiModule.updateCurrentUserPreferences>(),
  mockedUseAgent: vi.fn<typeof AgentsReactModule.useAgent>(),
  mockedUseAgentChat: vi.fn<typeof AiChatReactModule.useAgentChat>(),
}));

vi.mock(import("./agent-client"), () => ({
  authorizeCurrentAgentThread: mockedAuthorizeCurrentAgentThread,
  ensureCurrentAgentThread: mockedEnsureCurrentAgentThread,
  prepareCurrentAgentSession: mockedPrepareCurrentAgentSession,
}));

vi.mock(import("#/lib/agent-origin"), () => ({
  resolveAgentHost: mockedResolveAgentHost,
}));

vi.mock(import("#/features/settings/user-preferences-api"), () => ({
  getCurrentUserPreferences: mockedGetCurrentUserPreferences,
  updateCurrentUserPreferences: mockedUpdateCurrentUserPreferences,
}));

vi.mock(import("#/features/proximity/proximity-api"), () => ({
  autocompleteProximityOrigin: mockedAutocompleteProximityOrigin,
  resolveProximityOriginPlace: mockedResolveProximityOriginPlace,
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
  const getToolPartState = ((part: { readonly state?: string }) => {
    switch (part.state) {
      case "approval-requested": {
        return "waiting-approval";
      }
      case "approved":
      case "denied":
      case "error":
      case "loading":
      case "streaming": {
        return part.state;
      }
      default: {
        return "complete";
      }
    }
  }) as typeof AiChatReactModule.getToolPartState;

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

vi.mock(import("#/components/ui/drawer"), () => ({
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
}));

describe("global agent chat", () => {
  let originalGeolocation: Geolocation | undefined;

  beforeEach(() => {
    originalGeolocation = navigator.geolocation;
    const preparedSession = {
      authorization: {
        agentInstanceName: thread.agentInstanceName,
        token: "agent-connect-token",
      },
      manifest: AGENT_ACTIONS_MANIFEST,
      thread,
      tokenExpiresInSeconds: 300,
    } satisfies TestPreparedAgentSession;

    mockedAuthorizeCurrentAgentThread.mockResolvedValue({
      agentInstanceName: thread.agentInstanceName,
      token: "agent-connect-token",
    });
    mockedEnsureCurrentAgentThread.mockResolvedValue(thread);
    mockedGetCurrentUserPreferences.mockResolvedValue({
      preferences: {
        routeProximityLocationEnabled: true,
        updatedAt: "2026-06-06T10:00:00.000Z",
      },
    });
    mockedUpdateCurrentUserPreferences.mockResolvedValue({
      preferences: {
        routeProximityLocationEnabled: true,
        updatedAt: "2026-06-06T10:01:00.000Z",
      },
    });
    mockedAutocompleteProximityOrigin.mockReturnValue(
      Effect.succeed({ suggestions: [] })
    );
    mockedResolveProximityOriginPlace.mockReturnValue(
      Effect.succeed({
        origin: {
          coordinates: { latitude: 53.349_805, longitude: -6.260_31 },
          displayText: "Docklands depot",
          mode: "typed_origin",
          originToken:
            "v1.typedOrigin.testSignature" as TypedOrigin["originToken"],
          placeId: "ChIJdocklandsDepot" as TypedOrigin["placeId"],
        },
      })
    );
    mockedPrepareCurrentAgentSession.mockResolvedValue(preparedSession);
    mockedResolveAgentHost.mockReturnValue("agent.example.com");
    mockedSendMessage.mockImplementation(async () => {});
    mockedAgentSend.mockImplementation(() => {});
    mockedUseAgent.mockReturnValue({
      addEventListener: () => {},
      agent: "ceird-agent",
      getHttpUrl: () => "https://agent.example.com/agents/ceird-agent/thread",
      name: thread.agentInstanceName,
      path: [{ agent: "ceird-agent", name: thread.agentInstanceName }],
      removeEventListener: () => {},
      send: mockedAgentSend,
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
    cleanup();
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: originalGeolocation,
    });
    vi.resetAllMocks();
  });

  it("stays hidden when there is no active organization", () => {
    render(<GlobalAgentChat activeOrganizationId={null} />);

    expect(
      screen.queryByRole("button", { name: /ask ceird/i })
    ).not.toBeInTheDocument();
  });

  it("stays hidden until the active organization role is known", () => {
    render(<GlobalAgentChat activeOrganizationId={"org_123" as never} />);

    expect(
      screen.queryByRole("button", { name: /ask ceird/i })
    ).not.toBeInTheDocument();
  });

  it("ignores app-level open events until agent access is available", () => {
    render(<GlobalAgentChat activeOrganizationId={"org_123" as never} />);

    act(() => {
      window.dispatchEvent(new CustomEvent("ceird:agent-chat-open"));
    });

    expect(mockedEnsureCurrentAgentThread).not.toHaveBeenCalled();
    expect(mockedAuthorizeCurrentAgentThread).not.toHaveBeenCalled();
    expect(mockedPrepareCurrentAgentSession).not.toHaveBeenCalled();
  });

  it("opens one app-level drawer and prepares a single org agent session", async () => {
    const user = userEvent.setup();
    render(
      <GlobalAgentChat
        activeOrganizationId={"org_123" as never}
        currentOrganizationRole="owner"
      />
    );

    await user.click(screen.getByRole("button", { name: /ask ceird/i }));

    await expect(
      screen.findByRole("heading", { name: /ask ceird/i })
    ).resolves.toBeVisible();
    await waitFor(() => {
      expect(mockedPrepareCurrentAgentSession).toHaveBeenCalledOnce();
    });
    expect(screen.getByText(/owner access/i)).toBeVisible();
    const workspaceBadges = await screen.findAllByText("Read workspace");
    expect(workspaceBadges.length).toBeGreaterThan(0);
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
    mockedAuthorizeCurrentAgentThread.mockResolvedValueOnce({
      agentInstanceName:
        "org:org_123:user:user_123:thread:22222222-2222-4222-8222-222222222222" as TestAgentThread["agentInstanceName"],
      token: "wrong-thread-token",
    });
    await expect(refreshQuery()).rejects.toThrow(
      "Agent authorization returned a different thread."
    );
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

    await user.click(screen.getByRole("button", { name: /ask ceird/i }));

    await expect(
      screen.findByText(/agent worker origin is not configured/i)
    ).resolves.toBeVisible();
    expect(mockedPrepareCurrentAgentSession).not.toHaveBeenCalled();

    mockedResolveAgentHost.mockReturnValue("agent.example.com");
    await user.click(screen.getByRole("button", { name: /retry/i }));

    await waitFor(() => {
      expect(mockedPrepareCurrentAgentSession).toHaveBeenCalledOnce();
    });
  });

  it("keeps authorization failures inside the retryable drawer state", async () => {
    const user = userEvent.setup();
    mockedPrepareCurrentAgentSession.mockRejectedValueOnce(
      new Error("Agent authorization failed.")
    );
    render(
      <GlobalAgentChat
        activeOrganizationId={"org_123" as never}
        currentOrganizationRole="owner"
      />
    );

    await user.click(screen.getByRole("button", { name: /ask ceird/i }));

    await expect(
      screen.findByText("Agent authorization failed.")
    ).resolves.toBeVisible();
    expect(mockedUseAgent).not.toHaveBeenCalled();

    mockedPrepareCurrentAgentSession.mockResolvedValueOnce({
      authorization: {
        agentInstanceName: thread.agentInstanceName,
        token: "agent-connect-token",
      },
      manifest: AGENT_ACTIONS_MANIFEST,
      thread,
      tokenExpiresInSeconds: 300,
    });

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

    await user.click(screen.getByRole("button", { name: /ask ceird/i }));

    const drawer = await screen.findByTestId("agent-chat-drawer");
    expect(within(drawer).getByRole("log")).toHaveAttribute(
      "aria-live",
      "polite"
    );
    await expect(
      within(drawer).findByText("Add a label to the boiler job")
    ).resolves.toBeVisible();
    expect(
      within(drawer).getByText("I can do that. Which label?")
    ).toBeVisible();
    expect(within(drawer).getByText(/jobs.assignLabel/i)).toBeVisible();
    expect(within(drawer).getByText(/tool completed/i)).toBeVisible();

    await user.type(
      within(drawer).getByRole("textbox", { name: /message ask ceird/i }),
      "Use the urgent label"
    );
    await user.click(within(drawer).getByRole("button", { name: /^send$/i }));

    await waitFor(() => {
      expect(mockedSendMessage).toHaveBeenCalledWith({
        text: "Use the urgent label",
      });
    });
    expect(
      within(drawer).getByRole("textbox", { name: /message ask ceird/i })
    ).toHaveValue("");
  });

  it("attaches current location metadata to near-me prompts without changing visible text", async () => {
    const user = userEvent.setup();
    const getCurrentPosition = mockGeolocationSuccess({
      accuracy: 12,
      latitude: 53.349_805,
      longitude: -6.260_31,
    });
    render(
      <GlobalAgentChat
        activeOrganizationId={"org_123" as never}
        currentOrganizationRole="owner"
      />
    );

    await user.click(screen.getByRole("button", { name: /ask ceird/i }));

    const drawer = await screen.findByTestId("agent-chat-drawer");
    const textbox = within(drawer).getByRole("textbox", {
      name: /message ask ceird/i,
    });
    await user.type(textbox, "What are the closest jobs to me?");
    await user.click(within(drawer).getByRole("button", { name: /^send$/i }));

    await waitFor(() => {
      expect(mockedSendMessage).toHaveBeenCalledWith({
        text: "What are the closest jobs to me?",
      });
    });
    expect(getCurrentPosition).toHaveBeenCalledOnce();
    expect(mockedAgentSend).toHaveBeenCalledOnce();
    const frame = getLastProximityOriginContextFrame();
    expect(frame).toStrictEqual({
      contextId: expect.stringMatching(/^agent-origin-/),
      origin: {
        accuracyMeters: 12,
        coordinates: { latitude: 53.349_805, longitude: -6.260_31 },
        mode: "current_location",
      },
      type: AGENT_PROXIMITY_ORIGIN_CONTEXT_MESSAGE_TYPE,
    });
    const request = await getLastPrepareSendMessagesRequest()({
      id: "chat-id",
      messages: [],
      trigger: "submit-message",
    });
    expect(request).toStrictEqual({
      body: {
        [AGENT_PROXIMITY_ORIGIN_CONTEXT_ID_BODY_KEY]: frame.contextId,
      },
    });
    expect(JSON.stringify(request)).not.toContain("53.349805");
    expect(textbox).toHaveValue("");
  });

  it("attaches current location metadata to direct route prompts", async () => {
    const user = userEvent.setup();
    const getCurrentPosition = mockGeolocationSuccess({
      accuracy: 18,
      latitude: 53.349_805,
      longitude: -6.260_31,
    });
    render(
      <GlobalAgentChat
        activeOrganizationId={"org_123" as never}
        currentOrganizationRole="owner"
      />
    );

    await user.click(screen.getByRole("button", { name: /ask ceird/i }));

    const drawer = await screen.findByTestId("agent-chat-drawer");
    const textbox = within(drawer).getByRole("textbox", {
      name: /message ask ceird/i,
    });
    await user.type(textbox, "Directions to Docklands Campus");
    await user.click(within(drawer).getByRole("button", { name: /^send$/i }));

    await waitFor(() => {
      expect(mockedSendMessage).toHaveBeenCalledWith({
        text: "Directions to Docklands Campus",
      });
    });
    expect(getCurrentPosition).toHaveBeenCalledOnce();
    expect(mockedAgentSend).toHaveBeenCalledOnce();
    expect(getLastProximityOriginContextFrame().origin).toStrictEqual({
      accuracyMeters: 18,
      coordinates: { latitude: 53.349_805, longitude: -6.260_31 },
      mode: "current_location",
    });
  });

  it("keeps a near-me draft when current location cannot be read", async () => {
    const user = userEvent.setup();
    const getCurrentPosition = mockGeolocationFailure({
      code: 1,
      message: "Permission denied",
    });
    render(
      <GlobalAgentChat
        activeOrganizationId={"org_123" as never}
        currentOrganizationRole="owner"
      />
    );

    await user.click(screen.getByRole("button", { name: /ask ceird/i }));

    const drawer = await screen.findByTestId("agent-chat-drawer");
    const textbox = within(drawer).getByRole("textbox", {
      name: /message ask ceird/i,
    });
    await user.type(textbox, "nearest sites");
    await user.click(within(drawer).getByRole("button", { name: /^send$/i }));

    await expect(
      within(drawer).findByText(/current location unavailable/i)
    ).resolves.toBeVisible();
    expect(getCurrentPosition).toHaveBeenCalledOnce();
    expect(mockedAgentSend).not.toHaveBeenCalled();
    expect(mockedSendMessage).not.toHaveBeenCalled();
    expect(textbox).toHaveValue("nearest sites");
  });

  it("uses a selected typed origin when current location is unavailable", async () => {
    const user = userEvent.setup();
    const getCurrentPosition = mockGeolocationFailure({
      code: 1,
      message: "Permission denied",
    });
    const suggestion = {
      displayText: "Docklands depot",
      placeId: "ChIJdocklandsDepot" as TypedOrigin["placeId"],
      secondaryText: "Dublin",
    } satisfies ProximityOriginSuggestion;
    const typedOrigin: TypedOrigin = {
      coordinates: { latitude: 53.349_805, longitude: -6.260_31 },
      displayText: suggestion.displayText,
      mode: "typed_origin",
      originToken: "v1.typedOrigin.testSignature" as TypedOrigin["originToken"],
      placeId: suggestion.placeId,
    };
    mockedAutocompleteProximityOrigin.mockReturnValue(
      Effect.succeed({ suggestions: [suggestion] })
    );
    mockedResolveProximityOriginPlace.mockReturnValue(
      Effect.succeed({ origin: typedOrigin })
    );
    render(
      <GlobalAgentChat
        activeOrganizationId={"org_123" as never}
        currentOrganizationRole="owner"
      />
    );

    await user.click(screen.getByRole("button", { name: /ask ceird/i }));

    const drawer = await screen.findByTestId("agent-chat-drawer");
    const textbox = within(drawer).getByRole("textbox", {
      name: /message ask ceird/i,
    });
    await user.type(textbox, "nearest sites");
    await user.click(within(drawer).getByRole("button", { name: /^send$/i }));

    await user.click(
      await within(drawer).findByRole("button", { name: /choose origin/i })
    );
    await user.type(
      await screen.findByRole("searchbox", {
        name: /search address, eircode or place/i,
      }),
      "Docklands depot"
    );
    await user.click(await screen.findByRole("button", { name: /docklands/i }));
    await user.click(
      screen.getByRole("button", { name: /use selected origin/i })
    );

    await waitFor(() => {
      expect(mockedSendMessage).toHaveBeenCalledWith({ text: "nearest sites" });
    });
    expect(getCurrentPosition).toHaveBeenCalledOnce();
    expect(mockedResolveProximityOriginPlace).toHaveBeenCalledWith({
      placeId: suggestion.placeId,
      rawInput: "Docklands depot",
      sessionToken: expect.any(String),
    });
    expect(getLastProximityOriginContextFrame().origin).toStrictEqual(
      typedOrigin
    );
    expect(textbox).toHaveValue("");
  });

  it("does not send a selected typed origin after the origin dialog is closed", async () => {
    const user = userEvent.setup();
    mockGeolocationFailure({
      code: 1,
      message: "Permission denied",
    });
    const suggestion = {
      displayText: "Docklands depot",
      placeId: "ChIJdocklandsDepot" as TypedOrigin["placeId"],
      secondaryText: "Dublin",
    } satisfies ProximityOriginSuggestion;
    const typedOrigin: TypedOrigin = {
      coordinates: { latitude: 53.349_805, longitude: -6.260_31 },
      displayText: suggestion.displayText,
      mode: "typed_origin",
      originToken: "v1.typedOrigin.testSignature" as TypedOrigin["originToken"],
      placeId: suggestion.placeId,
    };
    const placeResolution = Promise.withResolvers<{ origin: TypedOrigin }>();
    mockedAutocompleteProximityOrigin.mockReturnValue(
      Effect.succeed({ suggestions: [suggestion] })
    );
    mockedResolveProximityOriginPlace.mockReturnValue(
      Effect.promise(() => placeResolution.promise)
    );
    render(
      <GlobalAgentChat
        activeOrganizationId={"org_123" as never}
        currentOrganizationRole="owner"
      />
    );

    await user.click(screen.getByRole("button", { name: /ask ceird/i }));

    const drawer = await screen.findByTestId("agent-chat-drawer");
    const textbox = within(drawer).getByRole("textbox", {
      name: /message ask ceird/i,
    });
    await user.type(textbox, "nearest sites");
    await user.click(within(drawer).getByRole("button", { name: /^send$/i }));
    await user.click(
      await within(drawer).findByRole("button", { name: /choose origin/i })
    );
    await user.type(
      await screen.findByRole("searchbox", {
        name: /search address, eircode or place/i,
      }),
      "Docklands depot"
    );
    await user.click(await screen.findByRole("button", { name: /docklands/i }));
    await user.click(
      screen.getByRole("button", { name: /use selected origin/i })
    );

    const originDialog = screen.getByRole("dialog");
    await user.click(
      within(originDialog).getByRole("button", { name: /close/i })
    );
    await waitFor(() => {
      expect(originDialog).not.toBeInTheDocument();
    });
    placeResolution.resolve({ origin: typedOrigin });
    await Promise.resolve();

    expect(mockedAgentSend).not.toHaveBeenCalled();
    expect(mockedSendMessage).not.toHaveBeenCalled();
    expect(textbox).toHaveValue("nearest sites");
  });

  it("blocks near-me prompts before geolocation when location preference is disabled", async () => {
    const user = userEvent.setup();
    const getCurrentPosition = mockGeolocationSuccess({
      latitude: 53.349_805,
      longitude: -6.260_31,
    });
    mockedGetCurrentUserPreferences.mockResolvedValueOnce({
      preferences: {
        routeProximityLocationEnabled: false,
        updatedAt: "2026-06-06T10:00:00.000Z",
      },
    });
    render(
      <GlobalAgentChat
        activeOrganizationId={"org_123" as never}
        currentOrganizationRole="owner"
      />
    );

    await user.click(screen.getByRole("button", { name: /ask ceird/i }));

    const drawer = await screen.findByTestId("agent-chat-drawer");
    const textbox = within(drawer).getByRole("textbox", {
      name: /message ask ceird/i,
    });
    await user.type(textbox, "nearest jobs to me");
    await user.click(within(drawer).getByRole("button", { name: /^send$/i }));

    await expect(
      within(drawer).findByText(/location access is off/i)
    ).resolves.toBeVisible();
    expect(getCurrentPosition).not.toHaveBeenCalled();
    expect(mockedAgentSend).not.toHaveBeenCalled();
    expect(mockedSendMessage).not.toHaveBeenCalled();
    expect(textbox).toHaveValue("nearest jobs to me");
  });

  it("enables location sharing inline before retrying a near-me prompt", async () => {
    const user = userEvent.setup();
    const getCurrentPosition = mockGeolocationSuccess({
      accuracy: 10,
      latitude: 53.349_805,
      longitude: -6.260_31,
    });
    mockedGetCurrentUserPreferences.mockResolvedValueOnce({
      preferences: {
        routeProximityLocationEnabled: false,
        updatedAt: "2026-06-06T10:00:00.000Z",
      },
    });
    render(
      <GlobalAgentChat
        activeOrganizationId={"org_123" as never}
        currentOrganizationRole="owner"
      />
    );

    await user.click(screen.getByRole("button", { name: /ask ceird/i }));

    const drawer = await screen.findByTestId("agent-chat-drawer");
    const textbox = within(drawer).getByRole("textbox", {
      name: /message ask ceird/i,
    });
    await user.type(textbox, "nearest jobs to me");
    await user.click(within(drawer).getByRole("button", { name: /^send$/i }));

    await user.click(
      await within(drawer).findByRole("button", {
        name: /enable current-location access/i,
      })
    );

    await waitFor(() => {
      expect(mockedSendMessage).toHaveBeenCalledWith({
        text: "nearest jobs to me",
      });
    });
    expect(mockedUpdateCurrentUserPreferences).toHaveBeenCalledWith({
      routeProximityLocationEnabled: true,
    });
    expect(getCurrentPosition).toHaveBeenCalledOnce();
    expect(getLastProximityOriginContextFrame().origin).toStrictEqual({
      accuracyMeters: 10,
      coordinates: { latitude: 53.349_805, longitude: -6.260_31 },
      mode: "current_location",
    });
    expect(textbox).toHaveValue("");
  });

  it("does not send stale near-me prompts after the chat unmounts during geolocation", async () => {
    const user = userEvent.setup();
    const geolocation = mockGeolocationDeferredSuccess({
      latitude: 53.349_805,
      longitude: -6.260_31,
    });
    const { rerender } = render(
      <GlobalAgentChat
        activeOrganizationId={"org_123" as never}
        currentOrganizationRole="owner"
      />
    );

    await user.click(screen.getByRole("button", { name: /ask ceird/i }));

    const drawer = await screen.findByTestId("agent-chat-drawer");
    await user.type(
      within(drawer).getByRole("textbox", { name: /message ask ceird/i }),
      "nearest jobs to me"
    );
    await user.click(within(drawer).getByRole("button", { name: /^send$/i }));

    expect(geolocation.getCurrentPosition).toHaveBeenCalledOnce();
    rerender(<GlobalAgentChat activeOrganizationId={null} />);

    act(() => {
      geolocation.resolve();
    });

    await waitFor(() => {
      expect(mockedSendMessage).not.toHaveBeenCalled();
    });
    expect(mockedAgentSend).not.toHaveBeenCalled();
  });

  it("does not request geolocation after the chat unmounts during preference lookup", async () => {
    const user = userEvent.setup();
    const getCurrentPosition = mockGeolocationSuccess({
      latitude: 53.349_805,
      longitude: -6.260_31,
    });
    const preferenceLookup =
      Promise.withResolvers<
        Awaited<ReturnType<typeof mockedGetCurrentUserPreferences>>
      >();
    mockedGetCurrentUserPreferences.mockImplementationOnce(
      () => preferenceLookup.promise
    );
    const { rerender } = render(
      <GlobalAgentChat
        activeOrganizationId={"org_123" as never}
        currentOrganizationRole="owner"
      />
    );

    await user.click(screen.getByRole("button", { name: /ask ceird/i }));

    const drawer = await screen.findByTestId("agent-chat-drawer");
    await user.type(
      within(drawer).getByRole("textbox", { name: /message ask ceird/i }),
      "nearest jobs to me"
    );
    await user.click(within(drawer).getByRole("button", { name: /^send$/i }));

    await waitFor(() => {
      expect(mockedGetCurrentUserPreferences).toHaveBeenCalledOnce();
    });
    rerender(<GlobalAgentChat activeOrganizationId={null} />);

    act(() => {
      preferenceLookup.resolve({
        preferences: {
          routeProximityLocationEnabled: true,
          updatedAt: "2026-06-06T10:00:00.000Z",
        },
      });
    });

    expect(getCurrentPosition).not.toHaveBeenCalled();
    expect(mockedAgentSend).not.toHaveBeenCalled();
    expect(mockedSendMessage).not.toHaveBeenCalled();
  });

  it("sends non-proximity prompts without requesting location metadata", async () => {
    const user = userEvent.setup();
    const getCurrentPosition = mockGeolocationSuccess({
      latitude: 53.349_805,
      longitude: -6.260_31,
    });
    render(
      <GlobalAgentChat
        activeOrganizationId={"org_123" as never}
        currentOrganizationRole="owner"
      />
    );

    await user.click(screen.getByRole("button", { name: /ask ceird/i }));

    const drawer = await screen.findByTestId("agent-chat-drawer");
    await user.type(
      within(drawer).getByRole("textbox", { name: /message ask ceird/i }),
      "List open labels"
    );
    await user.click(within(drawer).getByRole("button", { name: /^send$/i }));

    await waitFor(() => {
      expect(mockedSendMessage).toHaveBeenCalledWith({
        text: "List open labels",
      });
    });
    expect(getCurrentPosition).not.toHaveBeenCalled();
    expect(
      getLastPrepareSendMessagesRequest()({
        id: "chat-id",
        messages: [],
        trigger: "submit-message",
      })
    ).toStrictEqual({});
  });

  it("does not attach current location metadata when a route prompt has a typed origin", async () => {
    const user = userEvent.setup();
    const getCurrentPosition = mockGeolocationSuccess({
      latitude: 53.349_805,
      longitude: -6.260_31,
    });
    render(
      <GlobalAgentChat
        activeOrganizationId={"org_123" as never}
        currentOrganizationRole="owner"
      />
    );

    await user.click(screen.getByRole("button", { name: /ask ceird/i }));

    const drawer = await screen.findByTestId("agent-chat-drawer");
    await user.type(
      within(drawer).getByRole("textbox", { name: /message ask ceird/i }),
      "Directions from the depot to Docklands Campus"
    );
    await user.click(within(drawer).getByRole("button", { name: /^send$/i }));

    await waitFor(() => {
      expect(mockedSendMessage).toHaveBeenCalledWith({
        text: "Directions from the depot to Docklands Campus",
      });
    });
    expect(getCurrentPosition).not.toHaveBeenCalled();
    expect(mockedAgentSend).not.toHaveBeenCalled();
    expect(
      getLastPrepareSendMessagesRequest()({
        id: "chat-id",
        messages: [],
        trigger: "submit-message",
      })
    ).toStrictEqual({});
  });

  it("renders nearby job tool output as compact route rows", async () => {
    const user = userEvent.setup();
    mockedUseAgentChat.mockReturnValue(
      makeChatReturnValue([
        {
          id: "message-nearby-jobs",
          parts: [
            {
              output: nearbyJobResponse,
              state: "output-available",
              toolName: "rankNearbyJobs",
              type: "tool-rankNearbyJobs",
            },
          ],
          role: "assistant",
        },
      ])
    );
    render(
      <GlobalAgentChat
        activeOrganizationId={"org_123" as never}
        currentOrganizationRole="owner"
      />
    );

    await user.click(screen.getByRole("button", { name: /ask ceird/i }));

    const drawer = await screen.findByTestId("agent-chat-drawer");
    expect(within(drawer).getByText("Closest jobs")).toBeVisible();
    expect(within(drawer).getByText("Inspect boiler")).toBeVisible();
    expect(within(drawer).getByText("14 min")).toBeVisible();
    expect(within(drawer).getByText("4.2 km")).toBeVisible();
    expect(
      within(drawer).queryByText(/durationSeconds/)
    ).not.toBeInTheDocument();
  });

  it("renders nearby site and route preview tool output inline", async () => {
    const user = userEvent.setup();
    mockedUseAgentChat.mockReturnValue(
      makeChatReturnValue([
        {
          id: "message-route-preview",
          parts: [
            {
              output: nearbySiteResponse,
              state: "output-available",
              toolName: "rankNearbySites",
              type: "tool-rankNearbySites",
            },
            {
              output: jobRoutePreviewResponse,
              state: "output-available",
              toolName: "getJobRoutePreview",
              type: "tool-getJobRoutePreview",
            },
          ],
          role: "assistant",
        },
      ])
    );
    render(
      <GlobalAgentChat
        activeOrganizationId={"org_123" as never}
        currentOrganizationRole="owner"
      />
    );

    await user.click(screen.getByRole("button", { name: /ask ceird/i }));

    const drawer = await screen.findByTestId("agent-chat-drawer");
    expect(within(drawer).getByText("Closest sites")).toBeVisible();
    expect(
      within(drawer).getAllByText("Docklands Campus").length
    ).toBeGreaterThan(0);
    expect(within(drawer).getByText("Route preview")).toBeVisible();
    expect(
      within(drawer).getAllByRole("link", { name: /open in maps/i }).length
    ).toBeGreaterThan(0);
    expect(within(drawer).queryByText(/routeLine/)).not.toBeInTheDocument();
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

    await user.click(screen.getByRole("button", { name: /ask ceird/i }));

    const drawer = await screen.findByTestId("agent-chat-drawer");
    expect(within(drawer).getByText("Approval required")).toBeVisible();
    expect(within(drawer).getByText(/review before ceird acts/i)).toBeVisible();

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

  it("does not show approval controls without an approval decision id", async () => {
    const user = userEvent.setup();
    mockedUseAgentChat.mockReturnValue({
      clearHistory: () => {},
      error: undefined,
      isStreaming: false,
      messages: [
        {
          id: "message-missing-approval-id",
          parts: [
            {
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

    await user.click(screen.getByRole("button", { name: /ask ceird/i }));

    const drawer = await screen.findByTestId("agent-chat-drawer");
    expect(within(drawer).getByText("Approval required")).toBeVisible();
    expect(
      within(drawer).queryByText(/review before ceird acts/i)
    ).not.toBeInTheDocument();
    expect(
      within(drawer).queryByRole("button", { name: /approve/i })
    ).not.toBeInTheDocument();
    expect(within(drawer).getByText(/label_123/)).toBeVisible();
  });
});

function makeChatReturnValue(
  messages: readonly {
    readonly id: string;
    readonly parts: readonly Record<string, unknown>[];
    readonly role: "assistant" | "user";
  }[]
) {
  return {
    clearHistory: () => {},
    error: undefined,
    isStreaming: false,
    messages,
    addToolApprovalResponse: mockedAddToolApprovalResponse,
    sendMessage: mockedSendMessage,
    status: "ready",
  } as unknown as ReturnType<typeof AiChatReactModule.useAgentChat>;
}

function getLastPrepareSendMessagesRequest() {
  const options = mockedUseAgentChat.mock.calls.at(-1)?.[0] as
    | UseAgentChatOptions
    | undefined;

  if (options?.prepareSendMessagesRequest === undefined) {
    throw new Error("Expected prepareSendMessagesRequest option.");
  }

  return options.prepareSendMessagesRequest;
}

function getLastProximityOriginContextFrame() {
  const payload = mockedAgentSend.mock.calls.at(-1)?.[0];

  if (payload === undefined) {
    throw new Error("Expected agent proximity origin context frame.");
  }

  return JSON.parse(payload) as {
    readonly contextId: string;
    readonly origin: unknown;
    readonly type: string;
  };
}

function mockGeolocationSuccess({
  accuracy,
  latitude,
  longitude,
}: {
  readonly accuracy?: number;
  readonly latitude: number;
  readonly longitude: number;
}) {
  const getCurrentPosition = vi.fn<Geolocation["getCurrentPosition"]>(
    (success) => {
      success({
        coords: {
          accuracy,
          latitude,
          longitude,
        },
      } as GeolocationPosition);
    }
  );

  Object.defineProperty(navigator, "geolocation", {
    configurable: true,
    value: { getCurrentPosition },
  });

  return getCurrentPosition;
}

function mockGeolocationDeferredSuccess({
  accuracy,
  latitude,
  longitude,
}: {
  readonly accuracy?: number;
  readonly latitude: number;
  readonly longitude: number;
}) {
  let onSuccess: PositionCallback | null = null;
  const getCurrentPosition = vi.fn<Geolocation["getCurrentPosition"]>(
    (success) => {
      onSuccess = success;
    }
  );

  Object.defineProperty(navigator, "geolocation", {
    configurable: true,
    value: { getCurrentPosition },
  });

  return {
    getCurrentPosition,
    resolve: () => {
      onSuccess?.({
        coords: {
          accuracy,
          latitude,
          longitude,
        },
      } as GeolocationPosition);
    },
  };
}

function mockGeolocationFailure({
  code,
  message,
}: {
  readonly code: number;
  readonly message: string;
}) {
  const getCurrentPosition = vi.fn<Geolocation["getCurrentPosition"]>(
    (_success, error) => {
      error?.({ code, message } as GeolocationPositionError);
    }
  );

  Object.defineProperty(navigator, "geolocation", {
    configurable: true,
    value: { getCurrentPosition },
  });

  return getCurrentPosition;
}
