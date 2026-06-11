import type * as RouterModule from "@tanstack/react-router";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";

import type * as AppContextClientCacheModule from "#/features/auth/app-context-client-cache";
import type { authClient as AuthClient } from "#/lib/auth-client";

import { listOrganizations } from "../organizations/organization-access";
import { clearOrganizationAccessClientCache } from "../organizations/organization-access-cache";
import { LoginPage } from "./login-page";

const {
  mockedClearAppContextClientCache,
  mockedGetSession,
  mockedListOrganizations,
  mockedNavigate,
  mockedSignInEmail,
  mockedVerifyBackupCode,
  mockedVerifyTotp,
} = vi.hoisted(() => ({
  mockedClearAppContextClientCache: vi.fn<() => void>(),
  mockedGetSession: vi.fn<
    () => Promise<{
      data: { session: { id: string } } | null;
      error: { message: string } | null;
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
      data: {
        session?: {
          id: string;
        };
        twoFactorRedirect?: boolean;
      } | null;
      error: {
        message: string;
        status: number;
        statusText: string;
      } | null;
    }>
  >(),
  mockedVerifyBackupCode: vi.fn<
    (input: { code: string }) => Promise<{
      data: { token: string } | null;
      error: {
        message: string;
        status: number;
        statusText: string;
      } | null;
    }>
  >(),
  mockedVerifyTotp: vi.fn<
    (input: { code: string }) => Promise<{
      data: { token: string } | null;
      error: {
        message: string;
        status: number;
        statusText: string;
      } | null;
    }>
  >(),
}));

vi.mock(import("./app-context-client-cache-state"), async (importActual) => {
  const actual = await importActual();

  return {
    ...actual,
    clearAppContextClientCache:
      mockedClearAppContextClientCache as typeof actual.clearAppContextClientCache,
  };
});

vi.mock(import("./app-context-client-cache"), () => ({
  getCachedClientAppContext: vi.fn<
    typeof AppContextClientCacheModule.getCachedClientAppContext
  >(() =>
    Promise.resolve({
      activeOrganizationId: null,
      currentOrganizationRole: undefined,
      organizations: undefined,
      session: null,
    } as unknown as Awaited<
      ReturnType<typeof AppContextClientCacheModule.getCachedClientAppContext>
    >)
  ),
  readFreshCachedClientAppContext:
    vi.fn<typeof AppContextClientCacheModule.readFreshCachedClientAppContext>(),
}));

vi.mock(import("./app-server-context"), () => ({
  readGlobalAppServerContext: () => ({}),
}));

vi.mock(import("./auth-navigation"), async (importActual) => {
  const actual = await importActual();

  return {
    ...actual,
    useAuthSuccessNavigation: () => () => mockedNavigate({ to: "/" }),
  };
});

vi.mock(import("@tanstack/react-router"), () => ({
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
  }) as typeof RouterModule.Link,
  redirect: vi.fn<(options: unknown) => unknown>((options) => ({
    options,
  })) as unknown as typeof RouterModule.redirect,
  useNavigate: (() =>
    mockedNavigate) as unknown as typeof RouterModule.useNavigate,
}));

vi.mock(import("#/lib/auth-client"), () => ({
  authClient: {
    getSession: mockedGetSession,
    organization: {
      list: mockedListOrganizations,
    },
    signIn: {
      email: mockedSignInEmail,
    },
    twoFactor: {
      verifyBackupCode: mockedVerifyBackupCode,
      verifyTotp: mockedVerifyTotp,
    },
  } as unknown as typeof AuthClient,
}));

describe("login page", () => {
  beforeEach(() => {
    mockedGetSession.mockResolvedValue({
      data: { session: { id: "session_123" } },
      error: null,
    });
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
    mockedVerifyBackupCode.mockResolvedValue({
      data: { token: "two-factor-session-token" },
      error: null,
    });
    mockedVerifyTotp.mockResolvedValue({
      data: { token: "two-factor-session-token" },
      error: null,
    });
  });

  afterEach(() => {
    clearOrganizationAccessClientCache();
    vi.clearAllMocks();
  });

  it("submits valid credentials to Better Auth", async () => {
    const user = userEvent.setup();

    render(<LoginPage />);

    await user.type(screen.getByLabelText("Email"), "person@example.com");
    await user.type(screen.getByLabelText("Password"), "password1234");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => {
      expect(mockedSignInEmail).toHaveBeenCalledWith({
        email: "person@example.com",
        password: "password1234",
      });
    });
    await waitFor(() => {
      expect(mockedNavigate).toHaveBeenCalledWith({
        to: "/",
      });
    });
    expect(mockedClearAppContextClientCache).toHaveBeenCalledOnce();
  }, 10_000);

  it("shows an error when sign-in succeeds but no browser session is available", async () => {
    mockedGetSession.mockResolvedValue({
      data: null,
      error: null,
    });

    const user = userEvent.setup();

    render(<LoginPage />);

    await user.type(screen.getByLabelText("Email"), "person@example.com");
    await user.type(screen.getByLabelText("Password"), "password123");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    await expect(
      screen.findByText(
        "We couldn't start your session. Refresh and try signing in again."
      )
    ).resolves.toBeInTheDocument();
    expect(mockedNavigate).not.toHaveBeenCalled();
    expect(mockedClearAppContextClientCache).not.toHaveBeenCalled();
  }, 10_000);

  it("clears stale organization cache after successful sign-in", async () => {
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

    render(<LoginPage />);

    await user.type(screen.getByLabelText("Email"), "person@example.com");
    await user.type(screen.getByLabelText("Password"), "password1234");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

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

  it("continues into a TOTP challenge when Better Auth requires 2FA", async () => {
    mockedSignInEmail.mockResolvedValue({
      data: { twoFactorRedirect: true },
      error: null,
    });
    const user = userEvent.setup();

    render(<LoginPage search={{ invitation: "inv_123" }} />);

    await user.type(screen.getByLabelText("Email"), "person@example.com");
    await user.type(screen.getByLabelText("Password"), "password1234");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    await expect(
      screen.findByRole("heading", { name: "Verify your sign-in" })
    ).resolves.toBeVisible();
    expect(mockedNavigate).not.toHaveBeenCalled();
    expect(mockedClearAppContextClientCache).not.toHaveBeenCalled();
    expect(screen.getByText("person@example.com")).toBeVisible();

    await user.type(screen.getByLabelText("Authenticator code"), "123456");
    await user.click(screen.getByRole("button", { name: "Verify sign-in" }));

    await waitFor(() => {
      expect(mockedVerifyTotp).toHaveBeenCalledWith({ code: "123456" });
    });
    expect(mockedVerifyTotp).not.toHaveBeenCalledWith(
      expect.objectContaining({ trustDevice: expect.any(Boolean) })
    );
    await waitFor(() => {
      expect(mockedNavigate).toHaveBeenCalledWith({ to: "/" });
    });
    expect(mockedClearAppContextClientCache).toHaveBeenCalledOnce();
  }, 10_000);

  it("lets users complete the 2FA challenge with a backup code", async () => {
    mockedSignInEmail.mockResolvedValue({
      data: { twoFactorRedirect: true },
      error: null,
    });
    const user = userEvent.setup();

    render(<LoginPage />);

    await user.type(screen.getByLabelText("Email"), "person@example.com");
    await user.type(screen.getByLabelText("Password"), "password1234");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    await expect(
      screen.findByRole("heading", { name: "Verify your sign-in" })
    ).resolves.toBeVisible();
    await user.click(screen.getByRole("button", { name: "Use a backup code" }));
    await user.type(screen.getByLabelText("Backup code"), "alpha-0001");
    await user.click(screen.getByRole("button", { name: "Verify sign-in" }));

    await waitFor(() => {
      expect(mockedVerifyBackupCode).toHaveBeenCalledWith({
        code: "alpha-0001",
      });
    });
    expect(mockedVerifyBackupCode).not.toHaveBeenCalledWith(
      expect.objectContaining({ trustDevice: expect.any(Boolean) })
    );
    await waitFor(() => {
      expect(mockedNavigate).toHaveBeenCalledWith({ to: "/" });
    });
  }, 10_000);

  it("returns to sign-in with the email preserved and password cleared after an expired 2FA challenge", async () => {
    mockedSignInEmail.mockResolvedValue({
      data: { twoFactorRedirect: true },
      error: null,
    });
    mockedVerifyTotp.mockResolvedValue({
      data: null,
      error: {
        message: "Two-factor verification session expired.",
        status: 401,
        statusText: "Unauthorized",
      },
    });
    const user = userEvent.setup();

    render(<LoginPage />);

    await user.type(screen.getByLabelText("Email"), "person@example.com");
    await user.type(screen.getByLabelText("Password"), "password1234");
    await user.click(screen.getByRole("button", { name: /sign in/i }));
    await user.type(
      await screen.findByLabelText("Authenticator code"),
      "123456"
    );
    await user.click(screen.getByRole("button", { name: "Verify sign-in" }));

    await expect(
      screen.findByText(
        "That verification session expired. Sign in again to get a new challenge."
      )
    ).resolves.toBeVisible();
    await user.click(screen.getByRole("button", { name: "Sign in again" }));

    expect(screen.getByLabelText("Email")).toHaveValue("person@example.com");
    expect(screen.getByLabelText("Password")).toHaveValue("");
  }, 10_000);

  it("preserves invitation continuation in the forgot-password link", () => {
    render(<LoginPage search={{ invitation: "inv_123" }} />);

    expect(screen.getByLabelText("Auth context column")).toBeInTheDocument();
    expect(
      document.querySelector('[data-slot="entry-product-headline"]')
    ).toHaveTextContent("Run your work. Together.");
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);

    const link = screen.getByRole("link", { name: "Forgot password?" });

    expect(link).toHaveAttribute("href", "/forgot-password?invitation=inv_123");
    expect(link).toHaveAttribute("data-router-link", "true");
  }, 10_000);

  it("shows a safe server error when sign-in fails", async () => {
    mockedSignInEmail.mockResolvedValue({
      data: null,
      error: {
        message: "There is no account for that email address",
        status: 401,
        statusText: "Unauthorized",
      },
    });

    const user = userEvent.setup();

    render(<LoginPage />);

    await user.type(screen.getByLabelText("Email"), "person@example.com");
    await user.type(screen.getByLabelText("Password"), "password1234");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    await expect(
      screen.findByText(
        "We couldn't sign you in. Check your email and password and try again."
      )
    ).resolves.toBeInTheDocument();
  }, 10_000);

  it("allows short existing passwords to reach Better Auth during sign-in", async () => {
    const user = userEvent.setup();

    render(<LoginPage />);

    await user.type(screen.getByLabelText("Email"), "person@example.com");
    await user.type(screen.getByLabelText("Password"), "short");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => {
      expect(mockedSignInEmail).toHaveBeenCalledWith({
        email: "person@example.com",
        password: "short",
      });
    });
  }, 10_000);

  it("requires a password before submitting sign-in", async () => {
    const user = userEvent.setup();

    render(<LoginPage />);

    await user.type(screen.getByLabelText("Email"), "person@example.com");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    await expect(
      screen.findByText("This field is required.")
    ).resolves.toBeInTheDocument();
    expect(mockedSignInEmail).not.toHaveBeenCalled();
  }, 10_000);
});
