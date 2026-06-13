import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type * as AuthClientModule from "#/lib/auth-client";

import { UserSecuritySessionsPanel } from "./user-security-sessions-panel";

type TestSession = ReturnType<typeof makeSession>;
interface AuthClientError {
  readonly message?: string;
  readonly status?: number;
}
type GetSessionMock = () => Promise<{
  readonly data: {
    readonly session: {
      readonly id?: string;
      readonly token?: string;
    };
  } | null;
  readonly error: AuthClientError | null;
}>;
type ListSessionsMock = () => Promise<{
  readonly data: readonly TestSession[] | null;
  readonly error: AuthClientError | null;
}>;
type RevokeOtherSessionsMock = () => Promise<{
  readonly data: { readonly status: boolean } | null;
  readonly error: AuthClientError | null;
}>;
type RevokeSessionMock = (input: { readonly token: string }) => Promise<{
  readonly data: { readonly status: boolean } | null;
  readonly error: AuthClientError | null;
}>;

const {
  mockedGetSession,
  mockedListSessions,
  mockedRevokeOtherSessions,
  mockedRevokeSession,
} = vi.hoisted(() => ({
  mockedGetSession: vi.fn<GetSessionMock>(),
  mockedListSessions: vi.fn<ListSessionsMock>(),
  mockedRevokeOtherSessions: vi.fn<RevokeOtherSessionsMock>(),
  mockedRevokeSession: vi.fn<RevokeSessionMock>(),
}));

vi.mock(import("#/lib/auth-client"), async () => {
  const actual =
    await vi.importActual<typeof AuthClientModule>("#/lib/auth-client");

  return {
    ...actual,
    authClient: {
      ...actual.authClient,
      getSession:
        mockedGetSession as unknown as typeof actual.authClient.getSession,
      listSessions:
        mockedListSessions as unknown as typeof actual.authClient.listSessions,
      revokeOtherSessions:
        mockedRevokeOtherSessions as unknown as typeof actual.authClient.revokeOtherSessions,
      revokeSession:
        mockedRevokeSession as unknown as typeof actual.authClient.revokeSession,
    } satisfies typeof actual.authClient,
  };
});

describe("user security sessions panel", () => {
  const currentSession = makeSession({
    token: "token_current",
    updatedAt: "2026-06-07T08:30:00.000Z",
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36",
  });
  const otherSession = makeSession({
    id: "session_other",
    token: "token_other",
    updatedAt: "2026-06-07T07:10:00.000Z",
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:139.0) Gecko/20100101 Firefox/139.0",
  });

  beforeEach(() => {
    mockedGetSession.mockResolvedValue({
      data: {
        session: {
          id: currentSession.id,
          token: currentSession.token,
        },
      },
      error: null,
    });
    mockedListSessions.mockResolvedValue({
      data: [otherSession, currentSession],
      error: null,
    });
    mockedRevokeOtherSessions.mockResolvedValue({
      data: { status: true },
      error: null,
    });
    mockedRevokeSession.mockResolvedValue({
      data: { status: true },
      error: null,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("shows a stable loading state before sessions resolve", async () => {
    const listResult = createDeferred<Awaited<ReturnType<ListSessionsMock>>>();
    mockedListSessions.mockReturnValueOnce(listResult.promise);

    render(<UserSecuritySessionsPanel />);

    expect(screen.getByText("Loading active sessions…")).toBeInTheDocument();

    listResult.resolve({
      data: [currentSession],
      error: null,
    });

    await expect(screen.findByText("Chrome on macOS")).resolves.toBeVisible();
  });

  it("lists active sessions with current-device marking and no raw user agent", async () => {
    render(<UserSecuritySessionsPanel />);

    await expect(screen.findByText("Chrome on macOS")).resolves.toBeVisible();
    expect(screen.getByText("Firefox on Windows")).toBeVisible();
    expect(screen.getByText("This device")).toBeVisible();
    expect(
      screen.getByText("Sign out from the account menu to end this session.")
    ).toBeVisible();
    expect(screen.queryByText(/Mozilla/)).not.toBeInTheDocument();
    expect(screen.queryByText(/token_/)).not.toBeInTheDocument();
  });

  it("marks the current session by id when Better Auth omits the current token", async () => {
    mockedGetSession.mockResolvedValueOnce({
      data: {
        session: {
          id: currentSession.id,
        },
      },
      error: null,
    });

    render(<UserSecuritySessionsPanel />);

    const currentSessionText = await screen.findByText("Chrome on macOS");
    const currentSessionRow = getRequiredElement(
      currentSessionText.closest("li")
    );

    expect(within(currentSessionRow).getByText("This device")).toBeVisible();
    expect(
      within(currentSessionRow).queryByRole("button", {
        name: "Revoke session",
      })
    ).not.toBeInTheDocument();
  });

  it("shows the no-other-sessions state without a bulk revoke action", async () => {
    mockedListSessions.mockResolvedValueOnce({
      data: [currentSession],
      error: null,
    });

    render(<UserSecuritySessionsPanel />);

    await expect(
      screen.findByText("No other active sessions.")
    ).resolves.toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Revoke other sessions" })
    ).not.toBeInTheDocument();
  });

  it("fails closed when the current session cannot be resolved", async () => {
    mockedGetSession.mockResolvedValueOnce({
      data: null,
      error: { message: "Session unavailable", status: 503 },
    });
    mockedListSessions.mockResolvedValueOnce({
      data: [otherSession, currentSession],
      error: null,
    });

    render(<UserSecuritySessionsPanel />);

    await expect(
      screen.findByText("We couldn't load active sessions. Please try again.")
    ).resolves.toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Revoke session" })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Revoke other sessions" })
    ).not.toBeInTheDocument();
  });

  it("revokes one other session after inline confirmation", async () => {
    const interaction = userEvent.setup();

    render(<UserSecuritySessionsPanel />);

    const otherSessionText = await screen.findByText("Firefox on Windows");
    const otherSessionRow = getRequiredElement(otherSessionText.closest("li"));

    await interaction.click(
      within(otherSessionRow).getByRole("button", {
        name: "Revoke session",
      })
    );

    expect(
      within(otherSessionRow).getByText("Revoke this session?")
    ).toBeVisible();

    mockedListSessions.mockResolvedValueOnce({
      data: [currentSession],
      error: null,
    });

    await interaction.click(
      within(otherSessionRow).getByRole("button", {
        name: "Revoke session",
      })
    );

    await waitFor(() => {
      expect(mockedRevokeSession).toHaveBeenCalledWith({
        token: "token_other",
      });
    });
    await expect(
      screen.findByText("Session revoked.")
    ).resolves.toHaveAttribute("role", "status");
    expect(screen.queryByText("Firefox on Windows")).not.toBeInTheDocument();
  });

  it("revokes all other sessions after inline confirmation", async () => {
    const interaction = userEvent.setup();

    render(<UserSecuritySessionsPanel />);

    await screen.findByText("Firefox on Windows");
    await interaction.click(
      screen.getByRole("button", { name: "Revoke other sessions" })
    );

    const confirmation = screen.getByRole("group", {
      name: "Confirm revoking other sessions",
    });
    expect(confirmation).toBeVisible();

    mockedListSessions.mockResolvedValueOnce({
      data: [currentSession],
      error: null,
    });

    await interaction.click(
      within(confirmation).getByRole("button", {
        name: "Revoke other sessions",
      })
    );

    await waitFor(() => {
      expect(mockedRevokeOtherSessions).toHaveBeenCalledOnce();
    });
    await expect(
      screen.findByText("Other sessions revoked.")
    ).resolves.toHaveAttribute("role", "status");
    expect(screen.queryByText("Firefox on Windows")).not.toBeInTheDocument();
  });

  it("shows load and revoke failure copy without hiding retry actions", async () => {
    const interaction = userEvent.setup();
    mockedListSessions.mockResolvedValueOnce({
      data: null,
      error: { message: "Unavailable", status: 500 },
    });

    render(<UserSecuritySessionsPanel />);

    await expect(
      screen.findByText("We couldn't load active sessions. Please try again.")
    ).resolves.toBeVisible();

    await interaction.click(screen.getByRole("button", { name: "Try again" }));
    await screen.findByText("Firefox on Windows");

    mockedRevokeSession.mockResolvedValueOnce({
      data: null,
      error: { message: "Rejected", status: 500 },
    });

    const otherSessionRow = getRequiredElement(
      screen.getByText("Firefox on Windows").closest("li")
    );

    await interaction.click(
      within(otherSessionRow).getByRole("button", {
        name: "Revoke session",
      })
    );
    await interaction.click(
      within(otherSessionRow).getByRole("button", {
        name: "Revoke session",
      })
    );

    await expect(
      screen.findByText("We couldn't revoke that session. Please try again.")
    ).resolves.toHaveAttribute("role", "alert");
    expect(screen.getByText("Firefox on Windows")).toBeVisible();
  });
});

function makeSession({
  createdAt = "2026-06-01T10:00:00.000Z",
  expiresAt = "2026-07-01T10:00:00.000Z",
  id = "session_current",
  token,
  updatedAt,
  userAgent,
}: {
  readonly createdAt?: string;
  readonly expiresAt?: string;
  readonly id?: string;
  readonly token: string;
  readonly updatedAt: string;
  readonly userAgent: string;
}) {
  return {
    activeOrganizationId: null,
    createdAt,
    expiresAt,
    id,
    ipAddress: "203.0.113.10",
    token,
    updatedAt,
    userAgent,
    userId: "user_123",
  };
}

function getRequiredElement<ElementType extends Element>(
  element: ElementType | null
): ElementType {
  if (element === null) {
    throw new Error("Expected element to exist.");
  }

  return element;
}

function createDeferred<Value = unknown>() {
  const { promise, resolve } = (
    Promise as unknown as {
      withResolvers: <Value>() => {
        promise: Promise<Value>;
        resolve: (value: Value) => void;
      };
    }
  ).withResolvers<Value>();

  return {
    promise,
    resolve,
  };
}
