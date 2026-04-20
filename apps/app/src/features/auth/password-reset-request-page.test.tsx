import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Schema } from "effect";
import type { ComponentProps } from "react";

import type { authClient as AuthClient } from "#/lib/auth-client";
import type * as AuthClientModule from "#/lib/auth-client";
import { buildPasswordResetRedirectTo } from "#/lib/auth-client";

import { passwordResetRequestSchema } from "./auth-schemas";
import { PasswordResetRequestPage } from "./password-reset-request-page";

const { mockedRequestPasswordReset } = vi.hoisted(() => ({
  mockedRequestPasswordReset: vi.fn<
    (input: { email: string; redirectTo: string }) => Promise<{
      data: { status: boolean } | null;
      error: {
        message: string;
        status: number;
        statusText: string;
      } | null;
    }>
  >(),
}));

vi.mock(import("#/lib/auth-client"), async () => {
  const actual =
    await vi.importActual<typeof AuthClientModule>("#/lib/auth-client");

  return {
    ...actual,
    authClient: {
      requestPasswordReset: mockedRequestPasswordReset,
    } as unknown as typeof AuthClient,
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
      ...props
    }: ComponentProps<"a"> & {
      search?: Record<string, string | undefined>;
      to?: string;
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

describe("password reset request page", () => {
  beforeEach(() => {
    mockedRequestPasswordReset.mockResolvedValue({
      data: { status: true },
      error: null,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("submits email and redirect target to Better Auth", async () => {
    const user = userEvent.setup();

    render(<PasswordResetRequestPage search={{ invitation: "inv_123" }} />);

    await user.type(screen.getByLabelText("Email"), "person@example.com");
    await user.click(screen.getByRole("button", { name: /send reset link/i }));

    await waitFor(() => {
      expect(mockedRequestPasswordReset).toHaveBeenCalledWith({
        email: "person@example.com",
        redirectTo: buildPasswordResetRedirectTo(
          window.location.origin,
          "inv_123"
        ),
      });
    });
  }, 10_000);

  it("shows the generic success state after submit", async () => {
    const user = userEvent.setup();

    render(<PasswordResetRequestPage search={{ invitation: "inv_123" }} />);

    await user.type(screen.getByLabelText("Email"), "person@example.com");
    await user.click(screen.getByRole("button", { name: /send reset link/i }));

    await expect(
      screen.findByText(
        "If an account exists for that email, a reset link will be sent."
      )
    ).resolves.toBeInTheDocument();
  }, 10_000);

  it("uses router links for back-to-login navigation before and after submit", async () => {
    const user = userEvent.setup();

    render(<PasswordResetRequestPage search={{ invitation: "inv_123" }} />);

    const initialBackLink = screen.getByRole("link", { name: "Back to login" });
    expect(initialBackLink).toHaveAttribute(
      "href",
      "/login?invitation=inv_123"
    );
    expect(initialBackLink).toHaveAttribute("data-router-link", "true");

    await user.type(screen.getByLabelText("Email"), "person@example.com");
    await user.click(screen.getByRole("button", { name: /send reset link/i }));

    const successBackLink = await screen.findByRole("link", {
      name: "Back to login",
    });
    expect(successBackLink).toHaveAttribute(
      "href",
      "/login?invitation=inv_123"
    );
    expect(successBackLink).toHaveAttribute("data-router-link", "true");
  }, 10_000);

  it("uses the shared password reset request schema for submit validation", async () => {
    const user = userEvent.setup();
    const standardSchema = Schema.standardSchemaV1(passwordResetRequestSchema);
    const result = standardSchema["~standard"].validate({
      email: "invalid-email",
    });

    if ("issues" in result === false || result.issues === undefined) {
      throw new Error(
        "Expected password reset request schema validation issues"
      );
    }

    const expectedMessage = result.issues[0]?.message;

    if (!expectedMessage) {
      throw new Error("Expected password reset request schema issue message");
    }

    render(<PasswordResetRequestPage />);

    await user.type(screen.getByLabelText("Email"), "invalid-email");
    await user.click(screen.getByRole("button", { name: /send reset link/i }));

    await expect(
      screen.findByText(expectedMessage)
    ).resolves.toBeInTheDocument();
    expect(mockedRequestPasswordReset).not.toHaveBeenCalled();
  }, 10_000);
});
