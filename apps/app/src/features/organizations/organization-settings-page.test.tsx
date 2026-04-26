import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { authClient as AuthClient } from "#/lib/auth-client";

import { OrganizationSettingsPage } from "./organization-settings-page";

const { mockedInvalidate, mockedUpdateOrganization } = vi.hoisted(() => ({
  mockedInvalidate: vi.fn<() => Promise<void>>(),
  mockedUpdateOrganization: vi.fn<
    (input: { data: { name: string }; organizationId: string }) => Promise<{
      data: { id: string; name: string; slug: string } | null;
      error: { message: string; status: number; statusText: string } | null;
    }>
  >(),
}));

vi.mock(import("#/lib/auth-client"), () => ({
  authClient: {
    organization: {
      update: mockedUpdateOrganization,
    },
  } as unknown as typeof AuthClient,
}));

vi.mock(import("@tanstack/react-router"), async (importOriginal) => {
  const actual = await importOriginal();

  return {
    ...actual,
    useRouter: (() => ({
      invalidate: mockedInvalidate,
    })) as unknown as typeof actual.useRouter,
  };
});

describe("organization settings page", () => {
  beforeEach(() => {
    mockedInvalidate.mockResolvedValue();
    mockedUpdateOrganization.mockResolvedValue({
      data: {
        id: "org_123",
        name: "Northwind Field Ops",
        slug: "acme-field-ops",
      },
      error: null,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("renders editable name and read-only slug for the active organization", () => {
    render(
      <OrganizationSettingsPage
        organization={{
          id: "org_123",
          name: "Acme Field Ops",
          slug: "acme-field-ops",
        }}
      />
    );

    expect(
      screen.getByRole("heading", { name: "Organization settings" })
    ).toBeVisible();
    expect(screen.getByLabelText("Organization name")).toHaveValue(
      "Acme Field Ops"
    );
    expect(screen.getByText("acme-field-ops")).toBeVisible();
  }, 10_000);

  it("updates the organization name and refreshes route data", async () => {
    const user = userEvent.setup();

    render(
      <OrganizationSettingsPage
        organization={{
          id: "org_123",
          name: "Acme Field Ops",
          slug: "acme-field-ops",
        }}
      />
    );

    await user.clear(screen.getByLabelText("Organization name"));
    await user.type(screen.getByLabelText("Organization name"), "Northwind");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => {
      expect(mockedUpdateOrganization).toHaveBeenCalledWith({
        data: {
          name: "Northwind",
        },
        organizationId: "org_123",
      });
    });
    await waitFor(() => {
      expect(mockedInvalidate).toHaveBeenCalledOnce();
    });
    await expect(
      screen.findByText("Organization updated.")
    ).resolves.toBeVisible();

    await user.type(screen.getByLabelText("Organization name"), " Labs");

    expect(screen.queryByText("Organization updated.")).not.toBeInTheDocument();
  }, 10_000);

  it("does not offer a save action before the name changes", () => {
    render(
      <OrganizationSettingsPage
        organization={{
          id: "org_123",
          name: "Acme Field Ops",
          slug: "acme-field-ops",
        }}
      />
    );

    expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
    expect(mockedUpdateOrganization).not.toHaveBeenCalled();
  }, 10_000);

  it("shows a safe error when the update fails", async () => {
    mockedUpdateOrganization.mockResolvedValue({
      data: null,
      error: {
        message: "Forbidden",
        status: 403,
        statusText: "Forbidden",
      },
    });
    const user = userEvent.setup();

    render(
      <OrganizationSettingsPage
        organization={{
          id: "org_123",
          name: "Acme Field Ops",
          slug: "acme-field-ops",
        }}
      />
    );

    await user.clear(screen.getByLabelText("Organization name"));
    await user.type(screen.getByLabelText("Organization name"), "Northwind");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await expect(
      screen.findByText(
        "We couldn't update the organization. Please try again."
      )
    ).resolves.toBeVisible();
  }, 10_000);

  it("shows a safe error when the update request rejects", async () => {
    mockedUpdateOrganization.mockRejectedValue(new Error("network down"));
    const user = userEvent.setup();

    render(
      <OrganizationSettingsPage
        organization={{
          id: "org_123",
          name: "Acme Field Ops",
          slug: "acme-field-ops",
        }}
      />
    );

    await user.clear(screen.getByLabelText("Organization name"));
    await user.type(screen.getByLabelText("Organization name"), "Northwind");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await expect(
      screen.findByText(
        "We couldn't update the organization. Please try again."
      )
    ).resolves.toBeVisible();
    expect(mockedInvalidate).not.toHaveBeenCalled();
  }, 10_000);

  it("resets the form baseline when the active organization changes", () => {
    const { rerender } = render(
      <OrganizationSettingsPage
        organization={{
          id: "org_123",
          name: "Acme Field Ops",
          slug: "acme-field-ops",
        }}
      />
    );

    rerender(
      <OrganizationSettingsPage
        organization={{
          id: "org_456",
          name: "Northwind Field Ops",
          slug: "northwind-field-ops",
        }}
      />
    );

    expect(screen.getByLabelText("Organization name")).toHaveValue(
      "Northwind Field Ops"
    );
    expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
  }, 10_000);
});
