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
  it("shows the success state by default", () => {
    render(<EmailVerificationPage />);

    expect(screen.getByText("Email verified")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Your email address is verified. You can continue in the app or sign in again if needed."
      )
    ).toBeInTheDocument();

    const appLink = screen.getByRole("link", { name: "Go to the app" });
    expect(appLink).toHaveAttribute("href", "/");
    expect(appLink).toHaveAttribute("data-router-link", "true");
  }, 10_000);

  it("shows the invalid-link state for invalid_token", () => {
    render(<EmailVerificationPage search={{ error: "invalid_token" }} />);

    expect(screen.getByText("Verification link invalid")).toBeInTheDocument();
    expect(
      screen.getByText(
        "This verification link is invalid or has expired. Request a fresh verification email from the app."
      )
    ).toBeInTheDocument();
  }, 10_000);
});
