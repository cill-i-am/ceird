import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";

import type * as UserPreferencesApiModule from "#/features/settings/user-preferences-api";
import type * as AuthClientModule from "#/lib/auth-client";

import { listOrganizations } from "../organizations/organization-access";
import { clearOrganizationAccessClientCache } from "../organizations/organization-access-cache";
import { AUTH_CAPTCHA_RESPONSE_HEADER } from "./auth-captcha";
import { SignupPage } from "./signup-page";

const {
  mockedClearAppContextClientCache,
  mockedGetSession,
  mockedListOrganizations,
  mockedNavigate,
  mockedSignInEmail,
  mockedSignUpEmail,
  mockedUpdateCurrentUserPreferences,
} = vi.hoisted(() => ({
  mockedClearAppContextClientCache: vi.fn<() => void>(),
  mockedGetSession: vi.fn<
    () => Promise<{
      data: null;
      error: null;
    }>
  >(),
  mockedListOrganizations: vi.fn<
    () => Promise<{
      data: { id: string; name: string; slug: string }[] | null;
      error: null;
    }>
  >(),
  mockedNavigate: vi.fn<(options: { to: string }) => Promise<void>>(),
  mockedSignInEmail: vi.fn<
    (input: { email: string; password: string }) => Promise<{
      data: unknown;
      error: {
        message: string;
        status: number;
        statusText: string;
      } | null;
    }>
  >(),
  mockedSignUpEmail: vi.fn<
    (input: {
      name: string;
      email: string;
      password: string;
      callbackURL: string;
      fetchOptions?: {
        headers: Record<string, string>;
      };
    }) => Promise<{
      data: {
        token: string | null;
        user: {
          id: string;
          email: string;
          name: string;
          emailVerified: boolean;
          createdAt: Date;
          updatedAt: Date;
        };
      } | null;
      error: {
        message: string;
        status: number;
        statusText: string;
      } | null;
    }>
  >(),
  mockedUpdateCurrentUserPreferences:
    vi.fn<typeof UserPreferencesApiModule.updateCurrentUserPreferences>(),
}));

vi.mock(import("./app-context-client-cache-state"), async (importActual) => {
  const actual = await importActual();

  return {
    ...actual,
    clearAppContextClientCache:
      mockedClearAppContextClientCache as typeof actual.clearAppContextClientCache,
  };
});

vi.mock(import("./auth-navigation"), async (importActual) => {
  const actual = await importActual();

  return {
    ...actual,
    useAuthSuccessNavigation: () => () => mockedNavigate({ to: "/" }),
  };
});

vi.mock(import("@tanstack/react-router"), async (importActual) => {
  const actual = await importActual();

  return {
    ...actual,
    Link: (({
      children,
      search,
      to,
      viewTransition: _viewTransition,
      ...props
    }: ComponentProps<"a"> & {
      search?: Record<string, string | undefined>;
      to?: string;
      viewTransition?: unknown;
    }) => {
      const { href: initialHref } = props;
      let href = initialHref;

      if (typeof to === "string") {
        href = search?.invitation
          ? `${to}?invitation=${encodeURIComponent(search.invitation)}`
          : to;
      }

      return (
        <a data-router-link="true" href={href} {...props}>
          {children}
        </a>
      );
    }) as typeof actual.Link,
  };
});

vi.mock(import("#/lib/auth-client"), async () => {
  const actual =
    await vi.importActual<typeof AuthClientModule>("#/lib/auth-client");

  return {
    authClient: {
      getSession: mockedGetSession,
      organization: {
        list: mockedListOrganizations,
      },
      signIn: {
        email: mockedSignInEmail,
      },
      signUp: {
        email: mockedSignUpEmail,
      },
    } as unknown as typeof AuthClientModule.authClient,
    buildEmailVerificationRedirectTo: actual.buildEmailVerificationRedirectTo,
  };
});

vi.mock(import("#/features/settings/user-preferences-api"), () => ({
  updateCurrentUserPreferences: mockedUpdateCurrentUserPreferences,
}));

describe("signup page", () => {
  beforeEach(() => {
    window.history.replaceState({}, "", "http://localhost:3000/signup");
    mockedGetSession.mockResolvedValue({ data: null, error: null });
    mockedListOrganizations.mockResolvedValue({
      data: [{ id: "org_current", name: "Current Org", slug: "current" }],
      error: null,
    });
    mockedNavigate.mockResolvedValue();
    mockedSignInEmail.mockResolvedValue({
      data: {
        session: {
          id: "session_123",
        },
      },
      error: null,
    });
    mockedSignUpEmail.mockResolvedValue({
      data: {
        token: null,
        user: {
          id: "user_123",
          email: "person@example.com",
          name: "Taylor Example",
          emailVerified: false,
          createdAt: new Date("2026-04-03T12:00:00.000Z"),
          updatedAt: new Date("2026-04-03T12:00:00.000Z"),
        },
      },
      error: null,
    });
    mockedUpdateCurrentUserPreferences.mockResolvedValue({
      preferences: {
        routeProximityLocationEnabled: true,
        updatedAt: "2026-06-06T10:00:00.000Z",
      },
    });
  });

  afterEach(() => {
    clearOrganizationAccessClientCache();
    vi.unstubAllEnvs();
    delete (window as unknown as { turnstile?: unknown }).turnstile;
    document.querySelector("#ceird-turnstile-script")?.remove();
    vi.clearAllMocks();
  });

  it("submits valid signup data to Better Auth", async () => {
    const user = userEvent.setup();

    render(<SignupPage />);

    await user.type(screen.getByLabelText("Name"), "Taylor Example");
    await user.type(screen.getByLabelText("Email"), "person@example.com");
    await user.type(screen.getByLabelText("Password"), "password1234");
    await user.click(screen.getByRole("button", { name: /sign up/i }));

    await waitFor(() => {
      expect(mockedSignUpEmail).toHaveBeenCalledWith({
        name: "Taylor Example",
        email: "person@example.com",
        password: "password1234",
        callbackURL: "http://localhost:3000/verify-email?status=success",
      });
    });
    await waitFor(() => {
      expect(mockedNavigate).toHaveBeenCalledWith({
        to: "/",
      });
    });
    expect(mockedClearAppContextClientCache).toHaveBeenCalledOnce();
    expect(mockedSignInEmail).not.toHaveBeenCalled();
  }, 10_000);

  it("asks for route-aware location access during account creation without requesting coordinates", async () => {
    const user = userEvent.setup();
    const getCurrentPosition = vi.fn<Geolocation["getCurrentPosition"]>();

    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: { getCurrentPosition },
    });

    render(<SignupPage />);

    expect(
      screen.getByText(/traffic-aware nearby jobs and sites/i)
    ).toBeVisible();
    await user.click(
      screen.getByRole("checkbox", {
        name: /ask this device for location when i use near me/i,
      })
    );
    await user.type(screen.getByLabelText("Name"), "Taylor Example");
    await user.type(screen.getByLabelText("Email"), "person@example.com");
    await user.type(screen.getByLabelText("Password"), "password1234");
    await user.click(screen.getByRole("button", { name: /sign up/i }));

    await waitFor(() => {
      expect(mockedUpdateCurrentUserPreferences).toHaveBeenCalledWith({
        routeProximityLocationEnabled: true,
      });
    });
    expect(getCurrentPosition).not.toHaveBeenCalled();
    expect(
      JSON.stringify(mockedUpdateCurrentUserPreferences.mock.calls)
    ).not.toContain("latitude");
    await waitFor(() => {
      expect(mockedNavigate).toHaveBeenCalledWith({
        to: "/",
      });
    });
  }, 10_000);

  it("lets new users skip the location access preference during signup", async () => {
    const user = userEvent.setup();

    render(<SignupPage />);

    await user.type(screen.getByLabelText("Name"), "Taylor Example");
    await user.type(screen.getByLabelText("Email"), "person@example.com");
    await user.type(screen.getByLabelText("Password"), "password1234");
    await user.click(screen.getByRole("button", { name: /sign up/i }));

    await waitFor(() => {
      expect(mockedNavigate).toHaveBeenCalledWith({
        to: "/",
      });
    });
    expect(mockedUpdateCurrentUserPreferences).not.toHaveBeenCalled();
  }, 10_000);

  it("passes the Turnstile token header when signup captcha is enabled", async () => {
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

    render(<SignupPage />);

    await user.type(screen.getByLabelText("Name"), "Taylor Example");
    await user.type(screen.getByLabelText("Email"), "person@example.com");
    await user.type(screen.getByLabelText("Password"), "password1234");

    const submitButton = screen.getByRole("button", { name: /sign up/i });
    await waitFor(() => expect(submitButton).toBeEnabled());
    await user.click(submitButton);

    await waitFor(() => {
      expect(mockedSignUpEmail).toHaveBeenCalledWith({
        name: "Taylor Example",
        email: "person@example.com",
        password: "password1234",
        callbackURL: "http://localhost:3000/verify-email?status=success",
        fetchOptions: {
          headers: {
            [AUTH_CAPTCHA_RESPONSE_HEADER]: "captcha-token",
          },
        },
      });
    });
  }, 10_000);

  it("clears stale organization cache after successful sign-up", async () => {
    mockedListOrganizations
      .mockResolvedValueOnce({
        data: [{ id: "org_previous", name: "Previous Org", slug: "previous" }],
        error: null,
      })
      .mockResolvedValue({
        data: [{ id: "org_current", name: "Current Org", slug: "current" }],
        error: null,
      });

    await expect(listOrganizations()).resolves.toStrictEqual([
      { id: "org_previous", name: "Previous Org", slug: "previous" },
    ]);

    const user = userEvent.setup();

    render(<SignupPage />);

    await user.type(screen.getByLabelText("Name"), "Taylor Example");
    await user.type(screen.getByLabelText("Email"), "person@example.com");
    await user.type(screen.getByLabelText("Password"), "password1234");
    await user.click(screen.getByRole("button", { name: /sign up/i }));

    await waitFor(() => {
      expect(mockedNavigate).toHaveBeenCalledWith({
        to: "/",
      });
    });

    await expect(listOrganizations()).resolves.toStrictEqual([
      { id: "org_current", name: "Current Org", slug: "current" },
    ]);
    expect(mockedListOrganizations).toHaveBeenCalledTimes(2);
  }, 10_000);

  it("continues after invitation signup without forcing a second sign-in", async () => {
    const user = userEvent.setup();

    render(<SignupPage search={{ invitation: "inv_123" }} />);

    await user.type(screen.getByLabelText("Name"), "Taylor Example");
    await user.type(screen.getByLabelText("Email"), "person@example.com");
    await user.type(screen.getByLabelText("Password"), "password1234");
    await user.click(screen.getByRole("button", { name: /sign up/i }));

    await waitFor(() => {
      expect(mockedNavigate).toHaveBeenCalledWith({
        to: "/",
      });
    });
    expect(mockedSignInEmail).not.toHaveBeenCalled();
  }, 10_000);

  it("shows a safe server error when sign-up fails", async () => {
    mockedSignUpEmail.mockResolvedValue({
      data: null,
      error: {
        message: "User already exists",
        status: 409,
        statusText: "Conflict",
      },
    });

    const user = userEvent.setup();

    render(<SignupPage />);

    await user.type(screen.getByLabelText("Name"), "Taylor Example");
    await user.type(screen.getByLabelText("Email"), "person@example.com");
    await user.type(screen.getByLabelText("Password"), "password1234");
    await user.click(screen.getByRole("button", { name: /sign up/i }));

    await expect(
      screen.findByText("We couldn't create your account. Please try again.")
    ).resolves.toBeInTheDocument();
  }, 10_000);

  it("shows password length errors inline", async () => {
    const user = userEvent.setup();

    render(<SignupPage />);

    await user.type(screen.getByLabelText("Name"), "Taylor Example");
    await user.type(screen.getByLabelText("Email"), "person@example.com");
    await user.type(screen.getByLabelText("Password"), "short");
    await user.click(screen.getByRole("button", { name: /sign up/i }));

    await expect(
      screen.findByText("Use 12 to 256 characters.")
    ).resolves.toBeInTheDocument();
    expect(mockedSignUpEmail).not.toHaveBeenCalled();
  }, 10_000);

  it("keeps invitation navigation while showing the product context", () => {
    render(<SignupPage search={{ invitation: "inv_123" }} />);

    expect(screen.getByLabelText("Auth context column")).toBeInTheDocument();
    expect(
      document.querySelector('[data-slot="entry-product-headline"]')
    ).toHaveTextContent("Run your work. Together.");
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute(
      "href",
      "/login?invitation=inv_123"
    );
  }, 10_000);
});
