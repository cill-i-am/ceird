import { decodeOrganizationId } from "@ceird/identity-core";
import { HotkeysProvider } from "@tanstack/react-hotkeys";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ShortcutHelpOverlay } from "#/hotkeys/shortcut-help-overlay";
import type { authClient as AuthClient } from "#/lib/auth-client";

import { OrganizationMembersPage } from "./organization-members-page";

type ListInvitationsResult = Awaited<ReturnType<typeof mockedListInvitations>>;
const organizationId = decodeOrganizationId("org_123");
const organizationOneId = decodeOrganizationId("org_1");
const organizationTwoId = decodeOrganizationId("org_2");

const { mockedInviteMember, mockedListInvitations } = vi.hoisted(() => ({
  mockedInviteMember: vi.fn<
    (input: {
      email: string;
      organizationId: string;
      role: "admin" | "external" | "member";
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

async function chooseCommandOption(
  user: ReturnType<typeof userEvent.setup>,
  label: string,
  optionLabel: string
) {
  await user.click(screen.getByLabelText(label));
  await user.click(screen.getByRole("option", { name: optionLabel }));
}

function createDeferredListInvitationsResult() {
  const { promise, resolve } = (
    Promise as unknown as {
      withResolvers: <Value>() => {
        promise: Promise<Value>;
        reject: (reason?: unknown) => void;
        resolve: (value: Value) => void;
      };
    }
  ).withResolvers<ListInvitationsResult>();

  return { promise, resolve };
}

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
    const longEmail =
      "very.long.project.supervisor.address@exampleconstructioncompany.com";

    mockedListInvitations.mockResolvedValue({
      data: [
        {
          email: "accepted@example.com",
          id: "inv_accepted",
          role: "member",
          status: "accepted",
        },
        {
          email: longEmail,
          id: "inv_123",
          role: "member",
          status: "pending",
        },
      ],
      error: null,
    });

    render(<OrganizationMembersPage activeOrganizationId={organizationId} />);

    expect(screen.getByRole("heading", { name: "Members" })).toBeVisible();
    await expect(
      screen.findByRole("heading", { name: "Pending invitations" })
    ).resolves.toBeVisible();
    await expect(screen.findByTitle(longEmail)).resolves.toBeVisible();
    expect(screen.queryByText("accepted@example.com")).not.toBeInTheDocument();
    expect(screen.getAllByText("1 open")).toHaveLength(1);
    expect(mockedListInvitations).toHaveBeenCalledWith({
      query: {
        organizationId: "org_123",
      },
    });
  }, 10_000);

  it("submits invites for the active organization", async () => {
    mockedListInvitations
      .mockResolvedValueOnce({
        data: [
          {
            email: "ops@example.com",
            id: "inv_existing",
            role: "member",
            status: "pending",
          },
        ],
        error: null,
      })
      .mockResolvedValueOnce({
        data: [
          {
            email: "ops@example.com",
            id: "inv_existing",
            role: "member",
            status: "pending",
          },
          {
            email: "member@example.com",
            id: "inv_456",
            role: "admin",
            status: "pending",
          },
        ],
        error: null,
      });

    const user = userEvent.setup();

    render(<OrganizationMembersPage activeOrganizationId={organizationId} />);

    await expect(screen.findByText("ops@example.com")).resolves.toBeVisible();
    expect(screen.getAllByText("1 open")).toHaveLength(1);

    await user.type(screen.getByLabelText("Email"), "member@example.com");
    await chooseCommandOption(user, "Role", "Admin");
    await user.click(screen.getByRole("button", { name: "Send invite" }));

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
    await waitFor(() => {
      expect(mockedListInvitations).toHaveBeenCalledTimes(2);
    });
    expect(mockedListInvitations).toHaveBeenNthCalledWith(1, {
      query: {
        organizationId: "org_123",
      },
    });
    expect(mockedListInvitations).toHaveBeenNthCalledWith(2, {
      query: {
        organizationId: "org_123",
      },
    });
    await expect(
      screen.findByTitle("member@example.com")
    ).resolves.toBeVisible();
    expect(screen.getAllByText("2 open")).toHaveLength(1);
  }, 10_000);

  it("submits the invite form with the submit hotkey", async () => {
    const user = userEvent.setup();

    render(
      <HotkeysProvider>
        <OrganizationMembersPage activeOrganizationId={organizationId} />
      </HotkeysProvider>
    );

    await user.type(screen.getByLabelText("Email"), "member@example.com");
    await user.keyboard("{Control>}{Enter}{/Control}");

    await waitFor(() => {
      expect(mockedInviteMember).toHaveBeenCalledWith({
        email: "member@example.com",
        organizationId: "org_123",
        role: "member",
      });
    });
  }, 10_000);

  it("opens the invite role picker with the role hotkey", async () => {
    const user = userEvent.setup();

    render(
      <HotkeysProvider>
        <OrganizationMembersPage activeOrganizationId={organizationId} />
      </HotkeysProvider>
    );

    await user.keyboard("r");

    expect(screen.getByRole("combobox")).toHaveFocus();
    expect(screen.getByRole("option", { name: "Admin" })).toBeVisible();
    expect(
      screen.getByRole("option", { name: "External collaborator" })
    ).toBeVisible();
  }, 10_000);

  it("submits external collaborator invites", async () => {
    const user = userEvent.setup();

    render(<OrganizationMembersPage activeOrganizationId={organizationId} />);

    await user.type(screen.getByLabelText("Email"), "vendor@example.com");
    await chooseCommandOption(user, "Role", "External collaborator");
    await user.click(screen.getByRole("button", { name: "Send invite" }));

    await waitFor(() => {
      expect(mockedInviteMember).toHaveBeenCalledWith({
        email: "vendor@example.com",
        organizationId: "org_123",
        role: "external",
      });
    });
  }, 10_000);

  it("lists live members shortcuts in shortcut help", async () => {
    const user = userEvent.setup();

    const { rerender } = render(
      <HotkeysProvider>
        <OrganizationMembersPage activeOrganizationId={organizationId} />
      </HotkeysProvider>
    );

    await expect(
      screen.findByText("pending@example.com")
    ).resolves.toBeVisible();

    rerender(
      <HotkeysProvider>
        <OrganizationMembersPage activeOrganizationId={organizationId} />
        <ShortcutHelpOverlay activeScopes={["members"]} />
      </HotkeysProvider>
    );

    await user.click(
      screen.getByRole("button", { name: /keyboard shortcuts/i })
    );

    const dialog = await screen.findByRole("dialog", {
      name: /keyboard shortcuts/i,
    });

    expect(within(dialog).getByText("Submit invite form")).toBeVisible();
    expect(within(dialog).getByText("Focus invite role select")).toBeVisible();
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

    render(<OrganizationMembersPage activeOrganizationId={organizationId} />);

    await user.type(screen.getByLabelText("Email"), "member@example.com");
    await user.click(screen.getByRole("button", { name: "Send invite" }));

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

    render(<OrganizationMembersPage activeOrganizationId={organizationId} />);

    await expect(
      screen.findByText(
        "We couldn't load invitations right now. Please try again."
      )
    ).resolves.toBeInTheDocument();
    expect(
      screen.queryByText("No pending invitations yet.")
    ).not.toBeInTheDocument();
  }, 10_000);

  it("shows a load error when invitation payload roles violate the app contract", async () => {
    mockedListInvitations.mockResolvedValue({
      data: [
        {
          email: "bad-role@example.com",
          id: "inv_bad_role",
          role: "admin,member",
          status: "pending",
        },
      ],
      error: null,
    });

    render(<OrganizationMembersPage activeOrganizationId={organizationId} />);

    await expect(
      screen.findByText(
        "We couldn't load invitations right now. Please try again."
      )
    ).resolves.toBeInTheDocument();
    expect(screen.queryByText("bad-role@example.com")).not.toBeInTheDocument();
  }, 10_000);

  it("clears stale pending invitations while another organization loads", async () => {
    const orgTwoInvitations = createDeferredListInvitationsResult();

    mockedListInvitations
      .mockResolvedValueOnce({
        data: [
          {
            email: "old-org@example.com",
            id: "inv_old",
            role: "member",
            status: "pending",
          },
        ],
        error: null,
      })
      .mockReturnValueOnce(orgTwoInvitations.promise);

    const { rerender } = render(
      <OrganizationMembersPage activeOrganizationId={organizationOneId} />
    );

    await expect(
      screen.findByText("old-org@example.com")
    ).resolves.toBeVisible();

    rerender(
      <OrganizationMembersPage activeOrganizationId={organizationTwoId} />
    );

    await waitFor(() => {
      expect(screen.queryByText("old-org@example.com")).not.toBeInTheDocument();
    });

    orgTwoInvitations.resolve({
      data: [
        {
          email: "new-org@example.com",
          id: "inv_new",
          role: "admin",
          status: "pending",
        },
      ],
      error: null,
    });

    await expect(
      screen.findByText("new-org@example.com")
    ).resolves.toBeVisible();
  }, 10_000);

  it("hides the pending invitations section when there are no pending invitations", async () => {
    mockedListInvitations.mockResolvedValue({
      data: [
        {
          email: "accepted@example.com",
          id: "inv_accepted",
          role: "member",
          status: "accepted",
        },
      ],
      error: null,
    });

    render(<OrganizationMembersPage activeOrganizationId={organizationId} />);

    await waitFor(() => {
      expect(mockedListInvitations).toHaveBeenCalledOnce();
    });
    expect(
      screen.queryByRole("heading", { name: "Pending invitations" })
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("No pending invitations yet.")
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(
        "Send the first invite when you're ready to add someone."
      )
    ).not.toBeInTheDocument();
    expect(screen.queryByText("0 open")).not.toBeInTheDocument();
  }, 10_000);
});
