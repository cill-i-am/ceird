import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { authClient as AuthClient } from "#/lib/auth-client";

import { OAuthConsentPage } from "./oauth-consent-page";

const { mockedConsent } = vi.hoisted(() => ({
  mockedConsent: vi.fn<
    (input: { accept: boolean }) => Promise<{
      data: { url?: string } | null;
      error: { message?: string } | null;
    }>
  >(),
}));

vi.mock(import("#/lib/auth-client"), () => ({
  authClient: {
    oauth2: {
      consent: mockedConsent,
    },
  } as unknown as typeof AuthClient,
}));

const validSearch = {
  client_id: "mcp-field-agent",
  redirect_uri: "https://agent.example.com/oauth/callback",
  scope: "openid profile email ceird:read ceird:write",
};

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

  it("renders requested scopes with friendly labels and redirect host", () => {
    render(<OAuthConsentPage search={validSearch} />);

    expect(
      screen.getByRole("heading", { name: "Review app access" })
    ).toBeInTheDocument();
    expect(screen.getByText("mcp-field-agent")).toBeInTheDocument();
    expect(screen.getByText("agent.example.com")).toBeInTheDocument();
    expect(screen.getByText("Confirm your identity")).toBeInTheDocument();
    expect(screen.getByText("Read your Ceird data")).toBeInTheDocument();
    expect(screen.getByText("Update your Ceird data")).toBeInTheDocument();
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
      screen.queryByRole("button", { name: "Allow" })
    ).not.toBeInTheDocument();
  }, 10_000);

  it("approves the consent request", async () => {
    const user = userEvent.setup();
    render(<OAuthConsentPage search={validSearch} />);

    await user.click(screen.getByRole("button", { name: "Allow" }));

    await waitFor(() => {
      expect(mockedConsent).toHaveBeenCalledWith({ accept: true });
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

  it("redirects to the returned URL after consent", async () => {
    const user = userEvent.setup();
    render(<OAuthConsentPage search={validSearch} />);

    await user.click(screen.getByRole("button", { name: "Allow" }));

    await waitFor(() => {
      expect(assignedUrl).toBe(
        "https://agent.example.com/oauth/callback?code=abc"
      );
    });

    expect(screen.getByRole("button", { name: "Allow" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Deny" })).toBeDisabled();
  }, 10_000);

  it("re-enables consent actions after a recoverable authorization error", async () => {
    const user = userEvent.setup();
    mockedConsent.mockResolvedValueOnce({
      data: null,
      error: { message: "Invalid authorization request" },
    });

    render(<OAuthConsentPage search={validSearch} />);

    await user.click(screen.getByRole("button", { name: "Allow" }));

    expect(
      await screen.findByText(
        "We couldn't approve this request. Return to the app or agent and try again."
      )
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Allow" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Deny" })).toBeEnabled();
  }, 10_000);

  it("ignores a second consent action while a request is pending", async () => {
    const user = userEvent.setup();
    let resolveConsent:
      | ((value: Awaited<ReturnType<typeof mockedConsent>>) => void)
      | undefined;

    mockedConsent.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveConsent = resolve;
      })
    );

    render(<OAuthConsentPage search={validSearch} />);

    await user.click(screen.getByRole("button", { name: "Allow" }));
    await user.click(screen.getByRole("button", { name: "Deny" }));

    expect(mockedConsent).toHaveBeenCalledTimes(1);
    expect(mockedConsent).toHaveBeenCalledWith({ accept: true });
    expect(screen.getByRole("button", { name: "Deny" })).toBeDisabled();

    resolveConsent?.({
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
