import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { authClient as AuthClient } from "#/lib/auth-client";

import { OrganizationOnboardingPage } from "./organization-onboarding-page";

const { mockedCreateOrganization, mockedNavigate } = vi.hoisted(() => ({
  mockedCreateOrganization: vi.fn<
    (input: { name: string; slug: string }) => Promise<{
      data: {
        id: string;
        name: string;
        slug: string;
        members: { id: string; role: string; userId: string }[];
      } | null;
      error: {
        message: string;
        status: number;
        statusText: string;
      } | null;
    }>
  >(),
  mockedNavigate: vi.fn<(options: { to: string }) => Promise<void>>(),
}));

vi.mock(import("@tanstack/react-router"), async (importActual) => {
  const actual = await importActual();

  return {
    ...actual,
    useNavigate: (() => mockedNavigate) as typeof actual.useNavigate,
  };
});

vi.mock(import("#/lib/auth-client"), () => ({
  authClient: {
    organization: {
      create: mockedCreateOrganization,
    },
  } as unknown as typeof AuthClient,
}));

describe("organization onboarding page", () => {
  beforeEach(() => {
    mockedNavigate.mockResolvedValue();
    mockedCreateOrganization.mockResolvedValue({
      data: {
        id: "org_123",
        name: "Acme Field Ops",
        slug: "acme-field-ops",
        members: [{ id: "member_123", role: "owner", userId: "user_123" }],
      },
      error: null,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("creates the organization and returns to the app", async () => {
    const user = userEvent.setup();

    render(<OrganizationOnboardingPage />);

    await user.type(
      screen.getByLabelText("Organization name"),
      "Acme Field Ops"
    );
    await user.type(
      screen.getByLabelText("Organization slug"),
      "acme-field-ops"
    );
    await user.click(
      screen.getByRole("button", { name: /create organization/i })
    );

    await waitFor(() => {
      expect(mockedCreateOrganization).toHaveBeenCalledWith({
        name: "Acme Field Ops",
        slug: "acme-field-ops",
      });
    });
    await waitFor(() => {
      expect(mockedNavigate).toHaveBeenCalledWith({
        to: "/",
      });
    });
  }, 10_000);

  it("shows an inline error when org creation fails", async () => {
    mockedCreateOrganization.mockResolvedValue({
      data: null,
      error: {
        message: "Organization slug already taken",
        status: 400,
        statusText: "Bad Request",
      },
    });

    const user = userEvent.setup();

    render(<OrganizationOnboardingPage />);

    await user.type(
      screen.getByLabelText("Organization name"),
      "Acme Field Ops"
    );
    await user.type(
      screen.getByLabelText("Organization slug"),
      "acme-field-ops"
    );
    await user.click(
      screen.getByRole("button", { name: /create organization/i })
    );

    await expect(
      screen.findByText(
        "We couldn't create your organization. Please try again."
      )
    ).resolves.toBeInTheDocument();
  }, 10_000);
});
