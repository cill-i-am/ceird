import { decodeOrganizationSummary } from "@ceird/identity-core";
import { render, screen } from "@testing-library/react";

import { OrganizationLabelsSettingsPage } from "./organization-labels-settings-page";

const TEST_ORGANIZATION = decodeOrganizationSummary({
  id: "org_123",
  name: "Acme Field Ops",
  slug: "acme-field-ops",
});

describe("organization labels settings page", () => {
  it.each([
    ["loading", "Realtime labels"],
    ["empty", "No labels yet"],
    ["unavailable", "Realtime labels unavailable"],
    ["permission-aware", "Admin label management"],
  ] as const)("renders the %s shell state", (state, expectedText) => {
    render(
      <OrganizationLabelsSettingsPage
        organization={TEST_ORGANIZATION}
        organizationRole="owner"
        state={state}
      />
    );

    expect(screen.getByRole("heading", { name: "Labels" })).toBeVisible();
    expect(screen.getByText(expectedText)).toBeVisible();
    expect(
      screen.getByRole("link", { name: /general settings/i })
    ).toHaveAttribute("href", "/organization/settings");
  });

  it("renders a permission-aware shell for non-administrative roles", () => {
    render(
      <OrganizationLabelsSettingsPage
        organization={TEST_ORGANIZATION}
        organizationRole="member"
        state="empty"
      />
    );

    expect(screen.getByText("Admin label management")).toBeVisible();
  });
});
