import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Schema } from "effect";
import type { ComponentProps } from "react";

import type { authClient as AuthClient } from "#/lib/auth-client";

import { loginSchema } from "./auth-schemas";
import { LoginPage } from "./login-page";

const { mockedGetSession, mockedNavigate, mockedSignInEmail } = vi.hoisted(
  () => ({
    mockedGetSession: vi.fn<
      () => Promise<{
        data: null;
        error: null;
      }>
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
  })
);

vi.mock(import("./auth-navigation"), () => ({
  useAuthSuccessNavigation: () => () => mockedNavigate({ to: "/" }),
}));

vi.mock(import("@tanstack/react-router"), async (importActual) => {
  const actual = await importActual();

  return {
    ...actual,
    Link: (({
      children,
      to,
      ...props
    }: ComponentProps<"a"> & { to?: string }) => (
      <a
        data-router-link="true"
        href={typeof to === "string" ? to : props.href}
        {...props}
      >
        {children}
      </a>
    )) as typeof actual.Link,
  };
});

vi.mock(import("#/lib/auth-client"), () => ({
  authClient: {
    getSession: mockedGetSession,
    signIn: {
      email: mockedSignInEmail,
    },
  } as unknown as typeof AuthClient,
}));

describe("login page", () => {
  beforeEach(() => {
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
  });

  afterEach(() => {
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
  }, 10_000);

  it("shows a forgot-password link to the public reset request page", () => {
    render(<LoginPage />);

    const link = screen.getByRole("link", { name: "Forgot password?" });

    expect(link).toHaveAttribute("href", "/forgot-password");
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
  }, 10_000);

  it("uses the shared login schema for submit validation", async () => {
    const user = userEvent.setup();
    const standardSchema = Schema.standardSchemaV1(loginSchema);
    const result = standardSchema["~standard"].validate({
      email: "person@example.com",
      password: "short",
    });

    if ("issues" in result === false || result.issues === undefined) {
      throw new Error("Expected login schema validation issues");
    }

    const expectedMessage = result.issues[0]?.message;

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
