import { render, screen } from "@testing-library/react";

import { RouteAwareNearMeButton } from "./route-aware-near-me-button";

describe("route-aware near-me button", () => {
  it("renders a guarded near-me action for jobs", () => {
    render(<RouteAwareNearMeButton target="jobs" />);

    expect(
      screen.getByRole("button", { name: "Find jobs near me" })
    ).toBeDisabled();
    expect(screen.getByText("Near me")).toBeVisible();
  });

  it("renders a guarded near-me action for sites", () => {
    render(<RouteAwareNearMeButton target="sites" />);

    expect(
      screen.getByRole("button", { name: "Find sites near me" })
    ).toBeDisabled();
  });
});
