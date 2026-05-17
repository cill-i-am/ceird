import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";

import type * as AuthClientModule from "#/lib/auth-client";

import { SignupPage } from "./signup-page";

const {
  mockedGetSession,
  mockedNavigate,
  mockedSignInEmail,
  mockedSignUpEmail,
} = vi.hoisted(() => ({
  mockedGetSession: vi.fn<
    () => Promise<{
      data: null;
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
}));

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

describe("signup page", () => {
  beforeEach(() => {
    window.history.replaceState({}, "", "http://localhost:3000/signup");
    mockedGetSession.mockResolvedValue({ data: null, error: null });
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
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("submits valid signup data to Better Auth", async () => {
    const user = userEvent.setup();

    render(<SignupPage />);

    await user.type(screen.getByLabelText("Name"), "Taylor Example");
    await user.type(screen.getByLabelText("Email"), "person@example.com");
    await user.type(screen.getByLabelText("Password"), "password123");
    await user.click(screen.getByRole("button", { name: /sign up/i }));

    await waitFor(() => {
      expect(mockedSignUpEmail).toHaveBeenCalledWith({
        name: "Taylor Example",
        email: "person@example.com",
        password: "password123",
        callbackURL: "http://localhost:3000/verify-email?status=success",
      });
    });
    await waitFor(() => {
      expect(mockedNavigate).toHaveBeenCalledWith({
        to: "/",
      });
    });
    expect(mockedSignInEmail).not.toHaveBeenCalled();
  }, 10_000);

  it("confirms a session before continuing after invitation signup", async () => {
    const user = userEvent.setup();

    render(<SignupPage search={{ invitation: "inv_123" }} />);

    await user.type(screen.getByLabelText("Name"), "Taylor Example");
    await user.type(screen.getByLabelText("Email"), "person@example.com");
    await user.type(screen.getByLabelText("Password"), "password123");
    await user.click(screen.getByRole("button", { name: /sign up/i }));

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
    await user.type(screen.getByLabelText("Password"), "password123");
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
      screen.findByText("Use at least 8 characters.")
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
