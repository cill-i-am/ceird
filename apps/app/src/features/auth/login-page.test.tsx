import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Schema } from "effect";
import type { ComponentProps } from "react";

import type { authClient as AuthClient } from "#/lib/auth-client";

import { listOrganizations } from "../organizations/organization-access";
import { clearOrganizationAccessClientCache } from "../organizations/organization-access-cache";
import { loginSchema } from "./auth-schemas";
import { LoginPage } from "./login-page";

const {
  mockedClearAppContextClientCache,
  mockedGetSession,
  mockedListOrganizations,
  mockedMirrorLocalAlchemyAuthSession,
  mockedNavigate,
  mockedSignInEmail,
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
  mockedMirrorLocalAlchemyAuthSession: vi.fn<
    (input: { email: string; password: string }) => Promise<boolean>
  >(),
  mockedNavigate: vi.fn<(options: { to: string }) => Promise<void>>(),
  mockedSignInEmail: vi.fn<
    (input: { email: string; password: string }) => Promise<{
      data: {
        session: {
          id: string;
        };
      } | null;
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

vi.mock(import("#/lib/auth-client"), () => ({
  authClient: {
    getSession: mockedGetSession,
    organization: {
      list: mockedListOrganizations,
    },
    signIn: {
      email: mockedSignInEmail,
    },
  } as unknown as typeof AuthClient,
  mirrorLocalAlchemyAuthSession: mockedMirrorLocalAlchemyAuthSession,
}));

describe("login page", () => {
  beforeEach(() => {
    mockedGetSession.mockResolvedValue({ data: null, error: null });
    mockedListOrganizations.mockResolvedValue({
      data: [{ id: "org_current", name: "Current Org", slug: "current" }],
      error: null,
    });
    mockedMirrorLocalAlchemyAuthSession.mockResolvedValue(true);
    mockedNavigate.mockResolvedValue();
    mockedSignInEmail.mockResolvedValue({
      data: {
        session: {
          id: "session_123",
        },
      },
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
    await user.type(screen.getByLabelText("Password"), "password123");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => {
      expect(mockedSignInEmail).toHaveBeenCalledWith({
        email: "person@example.com",
        password: "password123",
      });
    });
    await waitFor(() => {
      expect(mockedNavigate).toHaveBeenCalledWith({
        to: "/",
      });
    });
    expect(mockedMirrorLocalAlchemyAuthSession).toHaveBeenCalledWith({
      email: "person@example.com",
      password: "password123",
    });
    expect(mockedClearAppContextClientCache).toHaveBeenCalledOnce();
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
    await user.type(screen.getByLabelText("Password"), "password123");
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
    await user.type(screen.getByLabelText("Password"), "password123");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    await expect(
      screen.findByText(
        "We couldn't sign you in. Check your email and password and try again."
      )
    ).resolves.toBeInTheDocument();
    expect(mockedMirrorLocalAlchemyAuthSession).not.toHaveBeenCalled();
  }, 10_000);

  it("shows a safe local session error when the local mirror fails", async () => {
    mockedMirrorLocalAlchemyAuthSession.mockResolvedValue(false);

    const user = userEvent.setup();

    render(<LoginPage />);

    await user.type(screen.getByLabelText("Email"), "person@example.com");
    await user.type(screen.getByLabelText("Password"), "password123");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    await expect(
      screen.findByText(
        "We couldn't finish signing in locally. Please try again."
      )
    ).resolves.toBeInTheDocument();
    expect(mockedNavigate).not.toHaveBeenCalled();
  }, 10_000);

  it("uses the shared login schema for submit validation", async () => {
    const user = userEvent.setup();
    const standardSchema = Schema.toStandardSchemaV1(loginSchema);
    const result = standardSchema["~standard"].validate({
      email: "person@example.com",
      password: "short",
    });

    if ("issues" in result === false || result.issues === undefined) {
      throw new Error("Expected login schema validation issues");
    }

    const expectedMessage = "Use at least 8 characters.";

    if (!expectedMessage) {
      throw new Error("Expected login schema issue message");
    }

    render(<LoginPage />);

    await user.type(screen.getByLabelText("Email"), "person@example.com");
    await user.type(screen.getByLabelText("Password"), "short");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    await expect(
      screen.findByText(expectedMessage)
    ).resolves.toBeInTheDocument();
    expect(mockedSignInEmail).not.toHaveBeenCalled();
  }, 10_000);
});
