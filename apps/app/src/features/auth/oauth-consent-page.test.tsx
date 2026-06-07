import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { authClient as AuthClient } from "#/lib/auth-client";

import { OAuthConsentPage, getConsentErrorNotice } from "./oauth-consent-page";

const {
  mockedConsent,
  mockedGetSession,
  mockedOrganizationList,
  mockedPublicClient,
} = vi.hoisted(() => ({
  mockedConsent: vi.fn<
    (input: { accept: boolean; oauth_query?: string }) => Promise<{
      data: { url?: string } | null;
      error: {
        code?: string;
        error?: string;
        error_description?: string;
        message?: string;
        status?: number;
        statusText?: string;
      } | null;
    }>
  >(),
  mockedGetSession: vi.fn<
    () => Promise<{
      data: { session: { activeOrganizationId?: string | null } } | null;
      error: { message?: string } | null;
    }>
  >(),
  mockedOrganizationList: vi.fn<
    () => Promise<{
      data: readonly { id: string; name: string; slug: string }[] | null;
      error: { message?: string } | null;
    }>
  >(),
  mockedPublicClient: vi.fn<
    (input: { query: { client_id: string } }) => Promise<{
      data: {
        client_id: string;
        client_name?: string;
        client_uri?: string;
        policy_uri?: string;
        tos_uri?: string;
      } | null;
      error: { message?: string } | null;
    }>
  >(),
}));

vi.mock(import("#/lib/auth-client"), () => ({
  authClient: {
    getSession: mockedGetSession,
    organization: {
      list: mockedOrganizationList,
    },
    oauth2: {
      consent: mockedConsent,
      publicClient: mockedPublicClient,
    },
  } as unknown as typeof AuthClient,
}));

const validSearch = {
  client_id: "mcp-field-agent",
  redirect_uri: "https://agent.example.com/oauth/callback",
  scope: "openid profile email ceird:read ceird:write",
};

function createDeferredResult<Value>() {
  return (
    Promise as unknown as {
      withResolvers: <Value>() => {
        promise: Promise<Value>;
        resolve: (value: Value) => void;
      };
    }
  ).withResolvers<Value>();
}

async function findEnabledAllowAccessButton() {
  const button = await screen.findByRole("button", { name: "Allow access" });

  await waitFor(() => {
    expect(button).toBeEnabled();
  });

  return button;
}

describe("OAuth consent page", () => {
  let originalLocation: Location;
  let assignedUrl: string | undefined;

  beforeEach(() => {
    originalLocation = window.location;
    assignedUrl = undefined;
    mockedConsent.mockResolvedValue({
      data: { url: "https://agent.example.com/oauth/callback?code=abc" },
      error: null,
    });
    mockedGetSession.mockResolvedValue({
      data: { session: { activeOrganizationId: "org_active" } },
      error: null,
    });
    mockedOrganizationList.mockResolvedValue({
      data: [
        {
          id: "org_active",
          name: "Northwind Field Ops",
          slug: "northwind-field-ops",
        },
      ],
      error: null,
    });
    mockedPublicClient.mockImplementation(({ query }) =>
      Promise.resolve({
        data: {
          client_id: query.client_id,
        },
        error: null,
      })
    );

    Object.defineProperty(window, "location", {
      configurable: true,
      value: {
        ...originalLocation,
        assign: (url: string) => {
          assignedUrl = url;
        },
      },
    });
  });

  afterEach(() => {
    Object.defineProperty(window, "location", {
      configurable: true,
      value: originalLocation,
    });
    vi.clearAllMocks();
  });

  it("renders requested scopes with friendly labels and redirect host", async () => {
    render(<OAuthConsentPage search={validSearch} />);

    expect(
      screen.getByRole("heading", { name: "Review app access" })
    ).toBeInTheDocument();
    expect(screen.getByText("mcp-field-agent")).toBeInTheDocument();
    expect(screen.getByText("agent.example.com")).toBeInTheDocument();
    expect(screen.getByText("Confirm your identity")).toBeInTheDocument();
    expect(screen.getByText("View workspace data")).toBeInTheDocument();
    expect(screen.getByText("Change workspace data")).toBeInTheDocument();
    expect(screen.getByText("Review high-risk access")).toBeInTheDocument();
    await expect(
      screen.findByText("Northwind Field Ops")
    ).resolves.toBeInTheDocument();
  }, 10_000);

  it("fetches and displays public client metadata when available", async () => {
    mockedPublicClient.mockResolvedValueOnce({
      data: {
        client_id: "mcp-field-agent",
        client_name: "Field Ops Agent",
        client_uri: "https://agent.example.com/app",
        policy_uri: "https://agent.example.com/privacy",
        tos_uri: "https://agent.example.com/terms",
      },
      error: null,
    });

    render(<OAuthConsentPage search={validSearch} />);

    await expect(
      screen.findByText("Field Ops Agent")
    ).resolves.toBeInTheDocument();
    expect(screen.getByText("mcp-field-agent")).toBeInTheDocument();
    expect(mockedPublicClient).toHaveBeenCalledWith({
      query: {
        client_id: "mcp-field-agent",
      },
    });
    expect(
      screen.getAllByRole("link", { name: "agent.example.com" })
    ).toHaveLength(3);
  }, 10_000);

  it("falls back to signed query details when public client metadata fails", async () => {
    mockedPublicClient.mockResolvedValueOnce({
      data: null,
      error: { message: "not found" },
    });

    render(<OAuthConsentPage search={validSearch} />);

    expect(screen.getByText("mcp-field-agent")).toBeInTheDocument();
    await expect(
      screen.findByText(
        "Client details unavailable. Showing the signed authorization request."
      )
    ).resolves.toBeInTheDocument();
  }, 10_000);

  it("groups admin, offline, identity, and unknown scopes into semantic rows", async () => {
    render(
      <OAuthConsentPage
        search={{
          ...validSearch,
          scope:
            "openid profile email offline_access ceird:read ceird:write ceird:admin vendor:unknown",
        }}
      />
    );

    expect(
      screen.getByText("Administer workspace settings")
    ).toBeInTheDocument();
    expect(screen.getByText("Change workspace data")).toBeInTheDocument();
    expect(screen.getByText("View workspace data")).toBeInTheDocument();
    expect(
      screen.getByText("Keep access after this session")
    ).toBeInTheDocument();
    expect(screen.getByText("Confirm your identity")).toBeInTheDocument();
    expect(
      screen.getByText("Requested access Ceird does not recognize")
    ).toBeInTheDocument();
    expect(screen.getByText("vendor:unknown")).toBeInTheDocument();
    await expect(
      screen.findByText("Northwind Field Ops")
    ).resolves.toBeInTheDocument();
  }, 10_000);

  it("renders consent details from the signed query prefix", async () => {
    render(
      <OAuthConsentPage
        rawSearch={
          "?client_id=signed-client&redirect_uri=https%3A%2F%2Fsigned.example.com%2Fcallback&scope=openid%20ceird%3Aadmin&sig=abc&client_id=forged-client&redirect_uri=https%3A%2F%2Fforged.example.com%2Fcallback&scope=openid"
        }
        search={{
          client_id: "forged-client",
          redirect_uri: "https://forged.example.com/callback",
          scope: "openid",
        }}
      />
    );

    expect(screen.getByText("signed-client")).toBeInTheDocument();
    expect(screen.getByText("signed.example.com")).toBeInTheDocument();
    expect(
      screen.getByText("Administer workspace settings")
    ).toBeInTheDocument();
    expect(screen.queryByText("forged-client")).not.toBeInTheDocument();
    expect(screen.queryByText("forged.example.com")).not.toBeInTheDocument();
    await expect(
      screen.findByText("Northwind Field Ops")
    ).resolves.toBeInTheDocument();
  }, 10_000);

  it("shows an invalid state when client_id is missing", () => {
    render(
      <OAuthConsentPage
        search={{
          scope: "openid email",
        }}
      />
    );

    expect(
      screen.getByRole("heading", { name: "Consent link expired" })
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Allow access" })
    ).not.toBeInTheDocument();
  }, 10_000);

  it("approves the consent request", async () => {
    const user = userEvent.setup();
    render(<OAuthConsentPage search={validSearch} />);

    await user.click(await findEnabledAllowAccessButton());

    await waitFor(() => {
      expect(mockedConsent).toHaveBeenCalledWith({ accept: true });
    });
  }, 10_000);

  it("submits the signed query prefix with consent decisions", async () => {
    const user = userEvent.setup();
    const rawSearch =
      "?client_id=signed-client&redirect_uri=https%3A%2F%2Fsigned.example.com%2Fcallback&scope=openid%20ceird%3Aadmin&exp=9999999999&ba_iat=123&sig=abc&client_id=forged-client";
    render(
      <OAuthConsentPage
        rawSearch={rawSearch}
        search={{
          client_id: "forged-client",
          redirect_uri: "https://forged.example.com/callback",
          scope: "openid",
        }}
      />
    );

    await user.click(await findEnabledAllowAccessButton());

    await waitFor(() => {
      expect(mockedConsent).toHaveBeenCalledWith({
        accept: true,
        oauth_query:
          "client_id=signed-client&redirect_uri=https%3A%2F%2Fsigned.example.com%2Fcallback&scope=openid+ceird%3Aadmin&exp=9999999999&ba_iat=123&sig=abc",
      });
    });
  }, 10_000);

  it("denies the consent request", async () => {
    const user = userEvent.setup();
    render(<OAuthConsentPage search={validSearch} />);

    await user.click(screen.getByRole("button", { name: "Deny" }));

    await waitFor(() => {
      expect(mockedConsent).toHaveBeenCalledWith({ accept: false });
    });
  }, 10_000);

  it("blocks Ceird scope approval when there is no active workspace but still allows denial", async () => {
    const user = userEvent.setup();
    mockedGetSession.mockResolvedValueOnce({
      data: { session: { activeOrganizationId: null } },
      error: null,
    });

    render(<OAuthConsentPage search={validSearch} />);

    await expect(
      screen.findByText("Choose a workspace first")
    ).resolves.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Allow access" })).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Allow access" }));
    expect(mockedConsent).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Deny" }));

    await waitFor(() => {
      expect(mockedConsent).toHaveBeenCalledWith({ accept: false });
    });
  }, 10_000);

  it("redirects to the returned URL after consent", async () => {
    const user = userEvent.setup();
    render(<OAuthConsentPage search={validSearch} />);

    await user.click(await findEnabledAllowAccessButton());

    await waitFor(() => {
      expect(assignedUrl).toBe(
        "https://agent.example.com/oauth/callback?code=abc"
      );
    });

    expect(screen.getByRole("button", { name: "Allow access" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Deny" })).toBeDisabled();
  }, 10_000);

  it("re-enables consent actions after a recoverable authorization error", async () => {
    const user = userEvent.setup();
    mockedConsent.mockResolvedValueOnce({
      data: null,
      error: { message: "Invalid authorization request" },
    });

    render(<OAuthConsentPage search={validSearch} />);

    await user.click(await findEnabledAllowAccessButton());

    await expect(
      screen.findByText(
        "We couldn't approve this request. Return to the app or agent and try again."
      )
    ).resolves.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Allow access" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Deny" })).toBeEnabled();
  }, 10_000);

  it("shows targeted email verification copy when consent is blocked", async () => {
    const user = userEvent.setup();
    mockedConsent.mockResolvedValueOnce({
      data: null,
      error: {
        code: "EMAIL_NOT_VERIFIED",
        message: "Email not verified",
        status: 403,
      },
    });

    render(<OAuthConsentPage search={validSearch} />);

    await user.click(await findEnabledAllowAccessButton());

    await expect(
      screen.findByText("Verify your email first")
    ).resolves.toBeInTheDocument();
    expect(
      screen.getByText(
        "Check your inbox and verify your email before approving agent access. Then return to the app or agent and try again."
      )
    ).toBeInTheDocument();
  }, 10_000);

  it("maps known Better Auth consent errors to safe notification copy", () => {
    expect(
      getConsentErrorNotice("allow", {
        error: "invalid_request",
        error_description: "missing oauth query",
        status: 400,
      })
    ).toStrictEqual({
      title: "Consent link expired",
      description:
        "This authorization request is no longer valid. Return to the app or agent and start a fresh request.",
    });

    expect(
      getConsentErrorNotice("allow", {
        error: "invalid_signature",
        status: 400,
      })
    ).toStrictEqual({
      title: "Consent link changed",
      description:
        "This authorization request could not be verified. Return to the app or agent and start a fresh request.",
    });

    expect(
      getConsentErrorNotice("allow", {
        code: "OAUTH_ACTIVE_ORGANIZATION_REQUIRED",
        message:
          "Choose a workspace before approving this Ceird authorization request.",
        status: 400,
      })
    ).toStrictEqual({
      title: "Choose a workspace first",
      description:
        "Select a Ceird workspace, then return to the app or agent and start a fresh authorization request.",
    });

    expect(getConsentErrorNotice("deny", { status: 429 })).toStrictEqual({
      title: "Too many attempts",
      description:
        "Wait a moment before trying this authorization request again.",
    });
  });

  it("ignores a second consent action while a request is pending", async () => {
    const user = userEvent.setup();
    const consentResult =
      createDeferredResult<Awaited<ReturnType<typeof mockedConsent>>>();

    mockedConsent.mockReturnValueOnce(consentResult.promise);

    render(<OAuthConsentPage search={validSearch} />);

    await user.click(await findEnabledAllowAccessButton());
    await user.click(screen.getByRole("button", { name: "Deny" }));

    expect(mockedConsent).toHaveBeenCalledExactlyOnceWith({ accept: true });
    expect(screen.getByRole("button", { name: "Deny" })).toBeDisabled();

    consentResult.resolve({
      data: { url: "https://agent.example.com/oauth/callback?code=abc" },
      error: null,
    });

    await waitFor(() => {
      expect(assignedUrl).toBe(
        "https://agent.example.com/oauth/callback?code=abc"
      );
    });
  }, 10_000);
});
