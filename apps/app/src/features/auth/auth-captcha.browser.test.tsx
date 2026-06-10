import { render, screen, waitFor } from "@testing-library/react";

import {
  AUTH_CAPTCHA_RESPONSE_HEADER,
  AuthCaptchaChallenge,
  isAuthCaptchaChallengeRequired,
  makeAuthCaptchaFetchOptions,
  readAuthCaptchaTurnstileSiteKey,
} from "./auth-captcha";

interface TestTurnstileRenderOptions {
  readonly action: string;
  readonly callback: (token: string) => void;
  readonly sitekey: string;
}

describe("auth captcha", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    delete (window as unknown as { turnstile?: unknown }).turnstile;
    document.querySelector("#ceird-turnstile-script")?.remove();
    vi.clearAllMocks();
  });

  it("does not require a captcha challenge by default", () => {
    const onTokenChange = vi.fn<(token?: string) => void>();

    render(
      <AuthCaptchaChallenge
        action="signup"
        resetKey={0}
        onTokenChange={onTokenChange}
      />
    );

    expect(isAuthCaptchaChallengeRequired()).toBeFalsy();
    expect(readAuthCaptchaTurnstileSiteKey()).toBeUndefined();
    expect(screen.queryByLabelText("Security check")).not.toBeInTheDocument();
    expect(onTokenChange).not.toHaveBeenCalled();
  }, 1000);

  it("renders Turnstile and emits the challenge token when enabled", async () => {
    const onTokenChange = vi.fn<(token?: string) => void>();
    const renderTurnstile = vi.fn<
      (container: HTMLElement, options: TestTurnstileRenderOptions) => string
    >(
      (
        _container: HTMLElement,
        options: TestTurnstileRenderOptions
      ): string => {
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
      <AuthCaptchaChallenge
        action="signup"
        resetKey={0}
        onTokenChange={onTokenChange}
      />
    );

    await waitFor(() => {
      expect(renderTurnstile).toHaveBeenCalledWith(
        expect.any(HTMLElement),
        expect.objectContaining({
          action: "signup",
          sitekey: "turnstile-site-key",
        })
      );
    });
    expect(onTokenChange).toHaveBeenCalledWith("captcha-token");
  }, 1000);

  it("can retry loading Turnstile after a script failure", async () => {
    const onTokenChange = vi.fn<(token?: string) => void>();

    vi.stubEnv("VITE_AUTH_CAPTCHA_ENABLED", "true");
    vi.stubEnv("VITE_AUTH_CAPTCHA_TURNSTILE_SITE_KEY", "turnstile-site-key");

    const firstRender = render(
      <AuthCaptchaChallenge
        action="signup"
        resetKey={0}
        onTokenChange={onTokenChange}
      />
    );

    const failedScript = await waitFor(() => {
      const script = document.querySelector("#ceird-turnstile-script");

      if (!(script instanceof HTMLScriptElement)) {
        throw new Error("Expected Turnstile script to be appended");
      }

      return script;
    });

    failedScript.dispatchEvent(new Event("error"));

    await expect(
      screen.findByText(
        "We couldn't load the security check. Refresh and try again."
      )
    ).resolves.toBeInTheDocument();
    expect(document.querySelector("#ceird-turnstile-script")).toBeNull();

    firstRender.unmount();

    const renderTurnstile = vi.fn<
      (container: HTMLElement, options: TestTurnstileRenderOptions) => string
    >((_container, options) => {
      options.callback("captcha-token");
      return "widget_123";
    });
    (
      window as unknown as { turnstile: { render: typeof renderTurnstile } }
    ).turnstile = {
      render: renderTurnstile,
    };

    render(
      <AuthCaptchaChallenge
        action="signup"
        resetKey={0}
        onTokenChange={onTokenChange}
      />
    );

    await waitFor(() => {
      expect(renderTurnstile).toHaveBeenCalledWith(
        expect.any(HTMLElement),
        expect.objectContaining({
          action: "signup",
          sitekey: "turnstile-site-key",
        })
      );
    });
    expect(onTokenChange).toHaveBeenCalledWith("captcha-token");
  }, 1000);

  it("builds Better Auth fetch options with the captcha response header", () => {
    expect(makeAuthCaptchaFetchOptions()).toBeUndefined();
    expect(makeAuthCaptchaFetchOptions("captcha-token")).toStrictEqual({
      fetchOptions: {
        headers: {
          [AUTH_CAPTCHA_RESPONSE_HEADER]: "captcha-token",
        },
      },
    });
  }, 1000);
});
