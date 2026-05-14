import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { authClient as AuthClient } from "#/lib/auth-client";

import { OrganizationOnboardingPage } from "./organization-onboarding-page";

type InviteMemberInput = Parameters<
  typeof AuthClient.organization.inviteMember
>[0];

const { mockedCreateOrganization, mockedInviteMember, mockedNavigate } =
  vi.hoisted(() => ({
    mockedCreateOrganization: vi.fn<
      (input: { data: { name: string } }) => Promise<{
        id: string;
        name: string;
        slug: string;
      }>
    >(),
    mockedInviteMember: vi.fn<
      (input: InviteMemberInput) => Promise<{
        data: {
          id: string;
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

vi.mock(import("./organization-server"), async (importActual) => {
  const actual = await importActual();

  return {
    ...actual,
    createCurrentServerOrganization:
      mockedCreateOrganization as unknown as typeof actual.createCurrentServerOrganization,
  };
});

vi.mock(import("#/lib/auth-client"), () => ({
  authClient: {
    organization: {
      inviteMember: mockedInviteMember,
    },
  } as unknown as typeof AuthClient,
}));

describe("organization onboarding page", () => {
  beforeEach(() => {
    mockedNavigate.mockResolvedValue();
    mockedCreateOrganization.mockResolvedValue({
      id: "org_123",
      name: "Acme Field Ops",
      slug: "acme-field-ops",
    });
    mockedInviteMember.mockResolvedValue({
      data: {
        id: "inv_123",
      },
      error: null,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("creates the team and continues to the invite step", async () => {
    const user = userEvent.setup();

    render(<OrganizationOnboardingPage />);

    expect(
      screen.getByRole("heading", {
        name: "Create your team",
      })
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Set up your first workspace.")
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(
        "This keeps your jobs, sites, and invites in one shared place."
      )
    ).toBeInTheDocument();
    expect(screen.queryByText("Workspace")).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText("Organization slug")
    ).not.toBeInTheDocument();
    await user.type(screen.getByLabelText("Team name"), "Acme Field Ops");
    await user.click(screen.getByRole("button", { name: /create team/i }));

    await waitFor(() => {
      expect(mockedCreateOrganization).toHaveBeenCalledWith({
        data: {
          name: "Acme Field Ops",
        },
      });
    });
    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: "Invite members" })
      ).toBeInTheDocument();
    });
    expect(mockedNavigate).not.toHaveBeenCalled();
  }, 10_000);

  it("keeps the generated slug hidden while the team name changes", async () => {
    const user = userEvent.setup();

    render(<OrganizationOnboardingPage />);

    await user.type(screen.getByLabelText("Team name"), "Acme Field Ops Ltd");
    expect(
      screen.queryByLabelText("Organization slug")
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /create team/i }));

    await waitFor(() => {
      expect(mockedCreateOrganization).toHaveBeenCalledWith({
        data: {
          name: "Acme Field Ops Ltd",
        },
      });
    });
  }, 10_000);

  it("sends an invite for the created team", async () => {
    const user = userEvent.setup();

    render(<OrganizationOnboardingPage />);

    await user.type(screen.getByLabelText("Team name"), "Acme Field Ops");
    await user.click(screen.getByRole("button", { name: /create team/i }));
    await screen.findByRole("heading", { name: "Invite members" });

    await user.type(screen.getByLabelText("Email"), "foreman@example.com");
    await user.click(screen.getByRole("button", { name: /send invite/i }));

    await waitFor(() => {
      expect(mockedInviteMember).toHaveBeenCalledWith({
        email: "foreman@example.com",
        organizationId: "org_123",
        role: "member",
      });
    });
    await expect(
      screen.findByText("Invitation sent to foreman@example.com.")
    ).resolves.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Continue to Ceird" }));
    await waitFor(() => {
      expect(mockedNavigate).toHaveBeenCalledWith({
        to: "/",
      });
    });
  }, 10_000);

  it("allows skipping invites after the team is created", async () => {
    const user = userEvent.setup();

    render(<OrganizationOnboardingPage />);

    await user.type(screen.getByLabelText("Team name"), "Acme Field Ops");
    await user.click(screen.getByRole("button", { name: /create team/i }));
    await screen.findByRole("heading", { name: "Invite members" });
    await user.click(screen.getByRole("button", { name: "Skip for now" }));

    await waitFor(() => {
      expect(mockedNavigate).toHaveBeenCalledWith({
        to: "/",
      });
    });
  }, 10_000);

  it("shows an inline error when sending an invite fails", async () => {
    mockedInviteMember.mockResolvedValue({
      data: null,
      error: {
        message: "Invite failed",
        status: 400,
        statusText: "Bad Request",
      },
    });

    const user = userEvent.setup();

    render(<OrganizationOnboardingPage />);

    await user.type(screen.getByLabelText("Team name"), "Acme Field Ops");
    await user.click(screen.getByRole("button", { name: /create team/i }));
    await screen.findByRole("heading", { name: "Invite members" });

    await user.type(screen.getByLabelText("Email"), "foreman@example.com");
    await user.click(screen.getByRole("button", { name: /send invite/i }));

    await expect(
      screen.findByText(
        "We couldn't send that invitation. Please check the email and try again."
      )
    ).resolves.toBeInTheDocument();
  }, 10_000);

  it("shows an inline error when org creation fails", async () => {
    mockedCreateOrganization.mockRejectedValue(new Error("Create failed"));

    const user = userEvent.setup();

    render(<OrganizationOnboardingPage />);

    await user.type(screen.getByLabelText("Team name"), "Acme Field Ops");
    await user.click(screen.getByRole("button", { name: /create team/i }));

    await expect(
      screen.findByText("We couldn't create your team. Please try again.")
    ).resolves.toBeInTheDocument();
  }, 10_000);
});
