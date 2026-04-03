import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { authClient as AuthClient } from "#/lib/auth-client";

import { SignupPage } from "./signup-page";

const { mockedGetSession, mockedSignUpEmail } = vi.hoisted(() => ({
  mockedGetSession: vi.fn<
    () => Promise<{
      data: null;
      error: null;
    }>
  >(),
  mockedSignUpEmail: vi.fn<
    (input: { name: string; email: string; password: string }) => Promise<{
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

vi.mock(import("#/lib/auth-client"), () => ({
  authClient: {
    getSession: mockedGetSession,
    signUp: {
      email: mockedSignUpEmail,
    },
  } as unknown as typeof AuthClient,
}));

describe("signup page", () => {
  beforeEach(() => {
    mockedGetSession.mockResolvedValue({ data: null, error: null });
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
    await user.type(screen.getByLabelText("Confirm password"), "password123");
    await user.click(screen.getByRole("button", { name: /sign up/i }));

    await waitFor(() => {
      expect(mockedSignUpEmail).toHaveBeenCalledWith({
        name: "Taylor Example",
        email: "person@example.com",
        password: "password123",
      });
    });
  }, 10_000);

  it("shows the password mismatch error inline", async () => {
    const user = userEvent.setup();

    render(<SignupPage />);

    await user.type(screen.getByLabelText("Name"), "Taylor Example");
    await user.type(screen.getByLabelText("Email"), "person@example.com");
    await user.type(screen.getByLabelText("Password"), "password123");
    await user.type(screen.getByLabelText("Confirm password"), "password124");
    await user.click(screen.getByRole("button", { name: /sign up/i }));

    await expect(
      screen.findByText("Passwords must match")
    ).resolves.toBeInTheDocument();
    expect(mockedSignUpEmail).not.toHaveBeenCalled();
  }, 10_000);
});
