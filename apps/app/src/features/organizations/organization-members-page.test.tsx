import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { authClient as AuthClient } from "#/lib/auth-client";

import { OrganizationMembersPage } from "./organization-members-page";

const { mockedInviteMember, mockedListInvitations } = vi.hoisted(() => ({
  mockedInviteMember: vi.fn<
    (input: {
      email: string;
      organizationId: string;
      role: "admin" | "member";
    }) => Promise<{
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
  mockedListInvitations: vi.fn<
    (input: { query: { organizationId: string } }) => Promise<{
      data:
        | {
            email: string;
            id: string;
            role: string;
            status: string;
          }[]
        | null;
      error: {
        message: string;
        status: number;
        statusText: string;
      } | null;
    }>
  >(),
}));

vi.mock(import("#/lib/auth-client"), () => ({
  authClient: {
    organization: {
      inviteMember: mockedInviteMember,
      listInvitations: mockedListInvitations,
    },
  } as unknown as typeof AuthClient,
}));

describe("organization members page", () => {
  beforeEach(() => {
    mockedListInvitations.mockResolvedValue({
      data: [
        {
          email: "pending@example.com",
          id: "inv_123",
          role: "member",
          status: "pending",
        },
      ],
      error: null,
    });
    mockedInviteMember.mockResolvedValue({
      data: {
        id: "inv_456",
      },
      error: null,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("loads pending invitations for the active organization", async () => {
    mockedListInvitations.mockResolvedValue({
      data: [
        {
          email: "accepted@example.com",
          id: "inv_accepted",
          role: "member",
          status: "accepted",
        },
        {
          email: "pending@example.com",
          id: "inv_123",
          role: "member",
          status: "pending",
        },
      ],
      error: null,
    });

    render(<OrganizationMembersPage activeOrganizationId="org_123" />);

    await expect(
      screen.findByText("pending@example.com")
    ).resolves.toBeVisible();
    expect(screen.queryByText("accepted@example.com")).not.toBeInTheDocument();
    expect(mockedListInvitations).toHaveBeenCalledWith({
      query: {
        organizationId: "org_123",
      },
    });
  }, 10_000);

  it("submits invites for the active organization", async () => {
    const user = userEvent.setup();

    render(<OrganizationMembersPage activeOrganizationId="org_123" />);

    await user.type(screen.getByLabelText("Email"), "member@example.com");
    await user.selectOptions(screen.getByLabelText("Role"), "admin");
    await user.click(screen.getByRole("button", { name: "Send invitation" }));

    await waitFor(() => {
      expect(mockedInviteMember).toHaveBeenCalledWith({
        email: "member@example.com",
        organizationId: "org_123",
        role: "admin",
      });
    });
    await expect(
      screen.findByText("Invitation sent to member@example.com.")
    ).resolves.toBeInTheDocument();
  }, 10_000);

  it("shows a safe error when an invite fails", async () => {
    mockedInviteMember.mockResolvedValue({
      data: null,
      error: {
        message: "You are not allowed to invite members",
        status: 403,
        statusText: "Forbidden",
      },
    });

    const user = userEvent.setup();

    render(<OrganizationMembersPage activeOrganizationId="org_123" />);

    await user.type(screen.getByLabelText("Email"), "member@example.com");
    await user.click(screen.getByRole("button", { name: "Send invitation" }));

    await expect(
      screen.findByText(
        "We couldn't send that invitation. Please check the details and try again."
      )
    ).resolves.toBeInTheDocument();
  }, 10_000);

  it("shows a load error instead of an empty-state fallback when invitation loading fails", async () => {
    mockedListInvitations.mockResolvedValue({
      data: null,
      error: {
        message: "Forbidden",
        status: 403,
        statusText: "Forbidden",
      },
    });

    render(<OrganizationMembersPage activeOrganizationId="org_123" />);

    await expect(
      screen.findByText(
        "We couldn't load invitations right now. Please try again."
      )
    ).resolves.toBeInTheDocument();
    expect(
      screen.queryByText("No pending invitations yet.")
    ).not.toBeInTheDocument();
  }, 10_000);
});
