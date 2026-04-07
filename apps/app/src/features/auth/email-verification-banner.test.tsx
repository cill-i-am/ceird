import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type * as AuthClientModule from "#/lib/auth-client";

import { EmailVerificationBanner } from "./email-verification-banner";

const { mockedSendVerificationEmail } = vi.hoisted(() => ({
  mockedSendVerificationEmail: vi.fn<
    (input: { email: string; callbackURL: string }) => Promise<{
      data: unknown;
      error: { status: number; message: string; statusText: string } | null;
    }>
  >(),
}));

vi.mock(import("#/lib/auth-client"), () => ({
  authClient: {
    sendVerificationEmail: mockedSendVerificationEmail,
  } as unknown as typeof AuthClientModule.authClient,
  buildEmailVerificationRedirectTo: (origin: string) =>
    new URL("/verify-email", origin).toString(),
}));

describe("email verification banner", () => {
  beforeEach(() => {
    window.history.replaceState({}, "", "http://localhost:3000/tasks");
    mockedSendVerificationEmail.mockResolvedValue({
      data: { ok: true },
      error: null,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it(
    "renders nothing for verified users",
    {
      timeout: 10_000,
    },
    () => {
      const { container } = render(
        <EmailVerificationBanner
          email="person@example.com"
          emailVerified={true}
        />
      );

      expect(container).toBeEmptyDOMElement();
    }
  );

  it(
    "resends a verification email for unverified users",
    {
      timeout: 10_000,
    },
    async () => {
      const user = userEvent.setup();

      render(
        <EmailVerificationBanner
          email="person@example.com"
          emailVerified={false}
        />
      );

      await user.click(
        screen.getByRole("button", { name: "Resend verification email" })
      );

      await waitFor(() => {
        expect(mockedSendVerificationEmail).toHaveBeenCalledWith({
          email: "person@example.com",
          callbackURL: "http://localhost:3000/verify-email",
        });
      });
    }
  );
});
