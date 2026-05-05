import { render, screen, within } from "@testing-library/react";

import { AuthContextPanel } from "./auth-context-panel";
import { AuthSplitShell } from "./auth-split-shell";
import { EntryShell } from "./entry-shell";

describe("auth split shell", () => {
  it("renders a focused action column beside a context column", () => {
    const { container } = render(
      <AuthSplitShell
        context={
          <AuthContextPanel
            badge="Invitation flow"
            kicker="Ceird"
            title="Keep the invited account moving."
            description="Review the invitation details and continue without losing the handoff."
          >
            <p>Invited email: person@example.com</p>
          </AuthContextPanel>
        }
      >
        <div>
          <h2>Sign in</h2>
          <button type="button">Continue</button>
        </div>
      </AuthSplitShell>
    );

    const actionColumn = container.querySelector<HTMLElement>(
      '[data-slot="auth-split-shell-action"]'
    );
    const contextColumn = container.querySelector<HTMLElement>(
      '[data-slot="auth-split-shell-context"]'
    );

    expect(actionColumn).not.toBeNull();
    expect(contextColumn).not.toBeNull();

    if (!actionColumn || !contextColumn) {
      throw new Error("Expected both auth shell columns to render");
    }

    expect(
      within(actionColumn).getByRole("button", { name: "Continue" })
    ).toBeInTheDocument();
    expect(
      within(contextColumn).getByRole("heading", {
        name: "Keep the invited account moving.",
      })
    ).toBeInTheDocument();
    expect(
      within(contextColumn).getByText("Invited email: person@example.com")
    ).toBeInTheDocument();
  }, 10_000);

  it("treats falsy boolean context as absent and collapses to a single-column layout", () => {
    const { container } = render(
      <AuthSplitShell context={false}>
        <button type="button">Continue</button>
      </AuthSplitShell>
    );

    const grid = container.querySelector<HTMLElement>(
      '[data-slot="auth-split-shell-grid"]'
    );
    const actionColumn = container.querySelector<HTMLElement>(
      '[data-slot="auth-split-shell-action"]'
    );

    expect(actionColumn).not.toBeNull();
    expect(
      container.querySelector('[data-slot="auth-split-shell-context"]')
    ).not.toBeInTheDocument();

    if (!grid) {
      throw new Error("Expected auth split shell grid to render");
    }

    expect(grid.className).toContain("lg:grid-cols-[minmax(0,1fr)]");
    expect(grid.className).not.toContain(
      "lg:grid-cols-[minmax(0,0.94fr)_minmax(0,1.06fr)]"
    );
  }, 10_000);

  it("keeps the compatibility shell working without a support-card grid and with arbitrary context", () => {
    const { container, rerender } = render(
      <EntryShell
        badge="Invitation flow"
        title="Continue into the workspace."
        description="The shared shell should not require a support-card grid to explain the next step."
      >
        <button type="button">Action</button>
      </EntryShell>
    );

    const contextColumn = container.querySelector<HTMLElement>(
      '[data-slot="auth-split-shell-context"]'
    );

    expect(contextColumn).not.toBeNull();
    expect(
      screen.queryByTestId("custom-context-details")
    ).not.toBeInTheDocument();
    expect(
      container.querySelector('[data-slot="entry-support-panel"]')
    ).not.toBeInTheDocument();

    rerender(
      <EntryShell
        badge="Account status"
        title="Your account is ready."
        description="Shared context should be able to show invitation and status details without page-specific layout code."
        supportingContent={
          <dl data-testid="custom-context-details" className="grid gap-3">
            <div>
              <dt className="text-sm font-medium">Invited email</dt>
              <dd className="text-sm text-muted-foreground">
                person@example.com
              </dd>
            </div>
            <div>
              <dt className="text-sm font-medium">Verification status</dt>
              <dd className="text-sm text-muted-foreground">
                Awaiting acceptance
              </dd>
            </div>
          </dl>
        }
      >
        <button type="button">Action</button>
      </EntryShell>
    );

    expect(
      screen.getByRole("heading", { name: "Your account is ready." })
    ).toBeInTheDocument();
    expect(screen.getByText("Invited email")).toBeInTheDocument();
    expect(screen.getByText("person@example.com")).toBeInTheDocument();
    expect(screen.getByText("Verification status")).toBeInTheDocument();
    expect(screen.getByText("Awaiting acceptance")).toBeInTheDocument();
    expect(
      container.querySelector('[data-slot="entry-support-panel"]')
    ).not.toBeInTheDocument();
  }, 10_000);
});
