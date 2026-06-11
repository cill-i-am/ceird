import type * as TanStackReactRouter from "@tanstack/react-router";
import { render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";

import { EmailVerificationPage } from "./email-verification-page";

vi.mock(import("@tanstack/react-router"), async () => {
  const actual = await vi.importActual<typeof TanStackReactRouter>(
    "@tanstack/react-router"
  );

  return {
    ...actual,
    Link: (({
      children,
      to,
      viewTransition: _viewTransition,
      ...props
    }: ComponentProps<"a"> & { to?: string; viewTransition?: unknown }) => (
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

describe("email verification page", () => {
  it("shows the invalid-link state by default", () => {
    render(<EmailVerificationPage />);

    expect(
      screen.getByRole("heading", {
        name: "Verification link expired",
      })
    ).toBeInTheDocument();
    expect(screen.queryByText("Verification issue")).not.toBeInTheDocument();
    expect(
      screen.getByText(
        "Use the newest email verification link, or return to sign in and request a fresh one."
      )
    ).toBeInTheDocument();
    expect(
      screen.queryByLabelText("Auth context column")
    ).not.toBeInTheDocument();

    const appLink = screen.getByRole("link", { name: "Go to the app" });
    expect(appLink).toHaveAttribute("href", "/");
    expect(appLink).toHaveAttribute("data-router-link", "true");

    const loginLink = screen.getByRole("link", { name: "Back to login" });
    expect(loginLink).toHaveAttribute("href", "/login");
    expect(loginLink).toHaveAttribute("data-router-link", "true");
  }, 10_000);

  it("shows the success state for status=success", () => {
    render(<EmailVerificationPage search={{ status: "success" }} />);

    expect(
      screen.getByRole("heading", { name: "Email verified" })
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Your email address is verified. You can continue safely."
      )
    ).toBeInTheDocument();
    expect(screen.queryByText("Verified")).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText("Auth context column")
    ).not.toBeInTheDocument();
  }, 10_000);

  it("shows the invalid-link state for invalid-token search", () => {
    render(<EmailVerificationPage search={{ status: "invalid-token" }} />);

    expect(
      screen.getByRole("heading", {
        name: "Verification link expired",
      })
    ).toBeInTheDocument();
    expect(screen.queryByText("Verification issue")).not.toBeInTheDocument();
    expect(
      screen.getByText(
        "Use the newest email verification link, or return to sign in and request a fresh one."
      )
    ).toBeInTheDocument();
  }, 10_000);
});
