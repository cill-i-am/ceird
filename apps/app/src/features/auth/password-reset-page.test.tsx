import type * as TanStackReactRouter from "@tanstack/react-router";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";

import type { authClient as AuthClient } from "#/lib/auth-client";

import { PasswordResetPage } from "./password-reset-page";

const { mockedNavigate, mockedResetPassword } = vi.hoisted(() => ({
  mockedNavigate: vi.fn<(options: { to: string }) => Promise<void>>(),
  mockedResetPassword: vi.fn<
    (input: { token: string; newPassword: string }) => Promise<{
      data: { status: boolean } | null;
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
    resetPassword: mockedResetPassword,
  } as unknown as typeof AuthClient,
}));

vi.mock(import("@tanstack/react-router"), async () => {
  const actual = await vi.importActual<typeof TanStackReactRouter>(
    "@tanstack/react-router"
  );

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
    useNavigate: () =>
      mockedNavigate as unknown as ReturnType<typeof actual.useNavigate>,
  };
});

describe("password reset page", () => {
  beforeEach(() => {
    mockedNavigate.mockResolvedValue();
    mockedResetPassword.mockResolvedValue({
      data: { status: true },
      error: null,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("shows the invalid-link state when search contains INVALID_TOKEN", () => {
    render(<PasswordResetPage search={{ error: "INVALID_TOKEN" }} />);

    expect(
      screen.getByText("This password reset link is invalid or has expired.")
    ).toBeInTheDocument();

    const forgotPasswordLink = screen.getByRole("link", {
      name: "Request a new reset link",
    });
    expect(forgotPasswordLink).toHaveAttribute("href", "/forgot-password");
    expect(forgotPasswordLink).toHaveAttribute("data-router-link", "true");

    const loginLink = screen.getByRole("link", { name: "Back to login" });
    expect(loginLink).toHaveAttribute("href", "/login");
    expect(loginLink).toHaveAttribute("data-router-link", "true");
  }, 10_000);

  it("submits token and newPassword to Better Auth", async () => {
    const user = userEvent.setup();

    render(<PasswordResetPage search={{ token: "reset-token" }} />);

    await user.type(screen.getByLabelText("New password"), "password123");
    await user.type(screen.getByLabelText("Confirm password"), "password123");
    await user.click(screen.getByRole("button", { name: /reset password/i }));

    await waitFor(() => {
      expect(mockedResetPassword).toHaveBeenCalledWith({
        token: "reset-token",
        newPassword: "password123",
      });
    });
  }, 10_000);

  it("navigates to /login after a successful reset", async () => {
    const user = userEvent.setup();

    render(<PasswordResetPage search={{ token: "reset-token" }} />);

    await user.type(screen.getByLabelText("New password"), "password123");
    await user.type(screen.getByLabelText("Confirm password"), "password123");
    await user.click(screen.getByRole("button", { name: /reset password/i }));

    await waitFor(() => {
      expect(mockedNavigate).toHaveBeenCalledWith({
        to: "/login",
      });
    });
  }, 10_000);

  it("shows a safe form error and does not navigate when reset fails", async () => {
    mockedResetPassword.mockResolvedValue({
      data: null,
      error: {
        message: "invalid token",
        status: 400,
        statusText: "Bad Request",
      },
    });

    const user = userEvent.setup();

    render(<PasswordResetPage search={{ token: "reset-token" }} />);

    await user.type(screen.getByLabelText("New password"), "password123");
    await user.type(screen.getByLabelText("Confirm password"), "password123");
    await user.click(screen.getByRole("button", { name: /reset password/i }));

    await expect(
      screen.findByText("We couldn't reset your password. Please try again.")
    ).resolves.toBeInTheDocument();
    expect(mockedNavigate).not.toHaveBeenCalled();
  }, 10_000);

  it("shows the shared mismatch validation message and blocks submission", async () => {
    const user = userEvent.setup();

    render(<PasswordResetPage search={{ token: "reset-token" }} />);

    await user.type(screen.getByLabelText("New password"), "password123");
    await user.type(
      screen.getByLabelText("Confirm password"),
      "different-password"
    );
    await user.click(screen.getByRole("button", { name: /reset password/i }));

    await expect(
      screen.findByText("Passwords must match")
    ).resolves.toBeInTheDocument();
    expect(mockedResetPassword).not.toHaveBeenCalled();
    expect(mockedNavigate).not.toHaveBeenCalled();
  }, 10_000);
});
