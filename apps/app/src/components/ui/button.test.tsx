import { render, screen } from "@testing-library/react";

import { Button } from "./button";

describe("button", () => {
  it("shows the dot matrix indicator and busy state while loading", () => {
    render(<Button loading>Save changes</Button>);

    const button = screen.getByRole("button", { name: /save changes/i });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");
    expect(
      button.querySelector("[data-dot-matrix-button-loader]")
    ).toBeInTheDocument();
  }, 10_000);

  it("keeps the loading icon slot mounted when loading is false", () => {
    render(<Button loading={false}>Save changes</Button>);

    const button = screen.getByRole("button", { name: /save changes/i });
    expect(button.querySelector("[data-loading-slot]")).toBeInTheDocument();
  }, 10_000);

  it("does not force disabled when loading is false", () => {
    render(<Button loading={false}>Save changes</Button>);

    expect(screen.getByRole("button", { name: /save changes/i })).toBeEnabled();
  }, 10_000);

  it("does not reserve loading space unless a button opts into loading", () => {
    render(<Button>Save changes</Button>);

    const button = screen.getByRole("button", { name: /save changes/i });
    expect(button.querySelector("[data-loading-slot]")).not.toBeInTheDocument();
  }, 10_000);
});
