import { decodeOrganizationSummary } from "@ceird/identity-core";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { authClient as AuthClient } from "#/lib/auth-client";

import { OrganizationSettingsPage } from "./organization-settings-page";

const TEST_ORGANIZATION = decodeOrganizationSummary({
  id: "org_123",
  name: "Acme Field Ops",
  slug: "acme-field-ops",
});

const { mockedRouterInvalidate, mockedUpdateOrganization } = vi.hoisted(() => ({
  mockedRouterInvalidate: vi.fn<() => Promise<void>>(),
  mockedUpdateOrganization: vi.fn<typeof AuthClient.organization.update>(),
}));

vi.mock(import("@tanstack/react-router"), async (importActual) => {
  const actual = await importActual();

  return {
    ...actual,
    useRouter: (() => ({
      invalidate: mockedRouterInvalidate,
    })) as typeof actual.useRouter,
  };
});

vi.mock(import("#/lib/auth-client"), () => ({
  authClient: {
    organization: {
      update: mockedUpdateOrganization,
    },
  } as unknown as typeof AuthClient,
}));

vi.mock(import("#/lib/mutation-feedback"), () => ({
  beginMutationFeedback: () => ({
    waitForSuccess: () => Promise.resolve(),
  }),
}));

describe("organization settings form", () => {
  beforeEach(() => {
    mockedRouterInvalidate.mockResolvedValue();
    mockedUpdateOrganization.mockResolvedValue({
      data: {
        id: "org_123",
        name: "Acme Field Ops",
        slug: "acme-field-ops",
      },
      error: null,
    } as Awaited<ReturnType<typeof AuthClient.organization.update>>);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("keeps the submitted organization name visible after a stale update response", async () => {
    const user = userEvent.setup();

    render(<OrganizationSettingsPage organization={TEST_ORGANIZATION} />);

    expect(screen.getByRole("link", { name: /open labels/i })).toHaveAttribute(
      "href",
      "/organization/settings/labels"
    );

    const nameInput = screen.getByLabelText("Organization name");

    await user.clear(nameInput);
    await user.type(nameInput, "Northwind Field Ops");

    const saveButton = screen.getByRole("button", { name: "Save changes" });

    await waitFor(() => expect(saveButton).toBeEnabled());
    await user.click(saveButton);

    await expect(
      screen.findByText("Organization updated.")
    ).resolves.toHaveTextContent("Organization updated.");
    expect(mockedUpdateOrganization).toHaveBeenCalledWith({
      data: {
        name: "Northwind Field Ops",
      },
      organizationId: "org_123",
    });
    expect(screen.getByLabelText("Organization name")).toHaveValue(
      "Northwind Field Ops"
    );
    expect(mockedRouterInvalidate).toHaveBeenCalledOnce();
  });
});
