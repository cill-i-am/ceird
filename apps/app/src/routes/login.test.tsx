import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { authClient as AuthClient } from "#/lib/auth-client";

import { LoginPage } from "./login";

const { mockedGetSession, mockedSignInEmail } = vi.hoisted(() => ({
  mockedGetSession: vi.fn<
    () => Promise<{
      data: null;
      error: null;
    }>
  >(),
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

vi.mock(import("#/lib/auth-client"), () => ({
  authClient: {
    getSession: mockedGetSession,
    signIn: {
      email: mockedSignInEmail,
    },
  } as unknown as typeof AuthClient,
}));

describe("login route", () => {
  beforeEach(() => {
    mockedGetSession.mockResolvedValue({ data: null, error: null });
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
  }, 10_000);

  it("shows a server error when sign-in fails", async () => {
    mockedSignInEmail.mockResolvedValue({
      data: null,
      error: {
        message: "Invalid email or password",
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
      screen.findByText("Invalid email or password")
    ).resolves.toBeInTheDocument();
  }, 10_000);
});
