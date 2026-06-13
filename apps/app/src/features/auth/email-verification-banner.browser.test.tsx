import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type * as AuthClientModule from "#/lib/auth-client";

import { AUTH_CAPTCHA_RESPONSE_HEADER } from "./auth-captcha";
import { EmailVerificationBanner } from "./email-verification-banner";

const { mockedSendVerificationEmail } = vi.hoisted(() => ({
  mockedSendVerificationEmail: vi.fn<
    (input: {
      email: string;
      callbackURL: string;
      fetchOptions?: {
        headers: Record<string, string>;
      };
    }) => Promise<{
      data: unknown;
      error: { status: number; message: string; statusText: string } | null;
    }>
  >(),
}));

vi.mock(import("#/lib/auth-client"), async () => {
  const actual =
    await vi.importActual<typeof AuthClientModule>("#/lib/auth-client");

  return {
    authClient: {
      sendVerificationEmail: mockedSendVerificationEmail,
    } as unknown as typeof AuthClientModule.authClient,
    buildEmailVerificationRedirectTo: actual.buildEmailVerificationRedirectTo,
  };
});

const verificationSuccessCallbackUrl = () =>
  `${window.location.origin}/verify-email?status=success`;

describe("email verification banner", () => {
  beforeEach(() => {
    window.history.replaceState({}, "", "/tasks");
    mockedSendVerificationEmail.mockResolvedValue({
      data: { ok: true },
      error: null,
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    delete (window as unknown as { turnstile?: unknown }).turnstile;
    document.querySelector("#ceird-turnstile-script")?.remove();
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
          callbackURL: verificationSuccessCallbackUrl(),
        });
      });
    }
  );

  it(
    "passes the Turnstile token header when resend captcha is enabled",
    {
      timeout: 10_000,
    },
    async () => {
      const user = userEvent.setup();
      const renderTurnstile = vi.fn<
        (
          container: HTMLElement,
          options: { callback: (token: string) => void }
        ) => string
      >(
        (
          _container: HTMLElement,
          options: { callback: (token: string) => void }
        ) => {
          options.callback("captcha-token");
          return "widget_123";
        }
      );

      vi.stubEnv("VITE_AUTH_CAPTCHA_ENABLED", "true");
      vi.stubEnv("VITE_AUTH_CAPTCHA_TURNSTILE_SITE_KEY", "turnstile-site-key");
      (
        window as unknown as { turnstile: { render: typeof renderTurnstile } }
      ).turnstile = {
        render: renderTurnstile,
      };

      render(
        <EmailVerificationBanner
          email="person@example.com"
          emailVerified={false}
        />
      );

      const resendButton = screen.getByRole("button", {
        name: "Resend verification email",
      });
      await waitFor(() => expect(resendButton).toBeEnabled());
      await user.click(resendButton);

      await waitFor(() => {
        expect(mockedSendVerificationEmail).toHaveBeenCalledWith({
          email: "person@example.com",
          callbackURL: verificationSuccessCallbackUrl(),
          fetchOptions: {
            headers: {
              [AUTH_CAPTCHA_RESPONSE_HEADER]: "captcha-token",
            },
          },
        });
      });
    }
  );

  it(
    "resets the Turnstile token after successful resend",
    {
      timeout: 10_000,
    },
    async () => {
      const user = userEvent.setup();
      const captchaTokens = ["captcha-token-1", "captcha-token-2"];
      const renderTurnstile = vi.fn<
        (
          container: HTMLElement,
          options: { callback: (token: string) => void }
        ) => string
      >((_container, options) => {
        const token = captchaTokens.shift();

        if (!token) {
          throw new Error("Expected another captcha token");
        }

        options.callback(token);
        return `widget-${token}`;
      });

      vi.stubEnv("VITE_AUTH_CAPTCHA_ENABLED", "true");
      vi.stubEnv("VITE_AUTH_CAPTCHA_TURNSTILE_SITE_KEY", "turnstile-site-key");
      (
        window as unknown as { turnstile: { render: typeof renderTurnstile } }
      ).turnstile = {
        render: renderTurnstile,
      };

      render(
        <EmailVerificationBanner
          email="person@example.com"
          emailVerified={false}
        />
      );

      const resendButton = screen.getByRole("button", {
        name: "Resend verification email",
      });
      await waitFor(() => expect(resendButton).toBeEnabled());
      await user.click(resendButton);

      await waitFor(() =>
        expect(mockedSendVerificationEmail).toHaveBeenCalledOnce()
      );
      await waitFor(() => expect(renderTurnstile).toHaveBeenCalledTimes(2));
      await waitFor(() => expect(resendButton).toBeEnabled());
      await user.click(resendButton);

      await waitFor(() => {
        expect(mockedSendVerificationEmail).toHaveBeenNthCalledWith(1, {
          email: "person@example.com",
          callbackURL: verificationSuccessCallbackUrl(),
          fetchOptions: {
            headers: {
              [AUTH_CAPTCHA_RESPONSE_HEADER]: "captcha-token-1",
            },
          },
        });
        expect(mockedSendVerificationEmail).toHaveBeenNthCalledWith(2, {
          email: "person@example.com",
          callbackURL: verificationSuccessCallbackUrl(),
          fetchOptions: {
            headers: {
              [AUTH_CAPTCHA_RESPONSE_HEADER]: "captcha-token-2",
            },
          },
        });
      });
    }
  );

  it(
    "keeps the reminder as a warning alert and announces resend confirmation inline",
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

      const successMessage = await screen.findByText(
        "Another verification email has been requested."
      );

      expect(successMessage).toHaveAttribute("aria-live", "polite");
      expect(
        screen.getByRole("alert", { name: "Email verification reminder" })
      ).toBeInTheDocument();
    }
  );

  it("uses a mobile-safe layout for long email addresses", () => {
    render(
      <EmailVerificationBanner
        email="avery.long.email.address.for.site.supervisors@example-contractors.invalid"
        emailVerified={false}
      />
    );

    const alert = screen.getByRole("alert", {
      name: "Email verification reminder",
    });
    const emailText = screen.getByText(
      /avery\.long\.email\.address\.for\.site\.supervisors/i
    );
    const resendButton = screen.getByRole("button", {
      name: "Resend verification email",
    });

    expect(alert).toHaveClass("overflow-hidden");
    expect(emailText).not.toHaveClass("truncate");
    expect(emailText).toHaveClass("[overflow-wrap:anywhere]");
    expect(resendButton).toHaveClass("w-full");
  });
});
