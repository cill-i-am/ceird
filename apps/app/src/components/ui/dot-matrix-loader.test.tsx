import { render, screen } from "@testing-library/react";

import {
  DotMatrixButtonLoader,
  DotMatrixLoadingState,
} from "./dot-matrix-loader";

describe("dot Matrix loader primitives", () => {
  it("renders a compact decorative button loading indicator", () => {
    const { container } = render(<DotMatrixButtonLoader visible />);

    const loader = container.querySelector("[data-dot-matrix-button-loader]");
    expect(loader).toBeInTheDocument();
    expect(loader).toHaveAttribute("aria-hidden", "true");
    expect(loader).toHaveClass("opacity-100");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  }, 10_000);

  it("keeps the compact loader mounted while hidden so it can animate out", () => {
    const { container } = render(<DotMatrixButtonLoader visible={false} />);

    const loader = container.querySelector("[data-dot-matrix-button-loader]");
    expect(loader).toHaveAttribute("aria-hidden", "true");
    expect(loader).toHaveClass("opacity-0");
    expect(loader).toHaveClass("scale-75");
    expect(loader).toHaveClass("w-0");
  }, 10_000);

  it("renders a non-button loading state with status text", () => {
    render(<DotMatrixLoadingState label="Loading invitations" />);

    expect(
      screen.getByRole("status", { name: "Loading invitations" })
    ).toBeInTheDocument();
    expect(screen.getByText("Loading invitations")).toBeInTheDocument();
  }, 10_000);
});
