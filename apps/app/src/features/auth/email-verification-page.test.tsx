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

describe("email verification page", () => {
  it("shows the invalid-link state by default", () => {
    render(<EmailVerificationPage />);

    expect(
      screen.getByRole("heading", {
        name: "This verification link can't be used.",
      })
    ).toBeInTheDocument();
    expect(screen.getByText("Verification link invalid")).toBeInTheDocument();
    expect(
      screen.getByText("This verification link is invalid or has expired.")
    ).toBeInTheDocument();

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
      screen.getByRole("heading", { name: "Your email is verified." })
    ).toBeInTheDocument();
    expect(screen.getByText("Email verified")).toBeInTheDocument();
    expect(
      screen.getByText("Your email address is verified.")
    ).toBeInTheDocument();
  }, 10_000);

  it("shows the invalid-link state for invalid-token search", () => {
    render(<EmailVerificationPage search={{ status: "invalid-token" }} />);

    expect(
      screen.getByRole("heading", {
        name: "This verification link can't be used.",
      })
    ).toBeInTheDocument();
    expect(screen.getByText("Verification link invalid")).toBeInTheDocument();
    expect(
      screen.getByText("This verification link is invalid or has expired.")
    ).toBeInTheDocument();
  }, 10_000);
});
