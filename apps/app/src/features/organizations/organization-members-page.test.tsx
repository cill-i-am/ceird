import { decodeOrganizationId } from "@ceird/identity-core";
import { HotkeysProvider } from "@tanstack/react-hotkeys";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ShortcutHelpOverlay } from "#/hotkeys/shortcut-help-overlay";
import type { authClient as AuthClient } from "#/lib/auth-client";

import { OrganizationMembersPage } from "./organization-members-page";
import { decodeOrganizationViewerUserId } from "./organization-viewer";

type ListMembersResult = Awaited<ReturnType<typeof mockedListMembers>>;
type ListInvitationsResult = Awaited<ReturnType<typeof mockedListInvitations>>;
type UpdateMemberRoleResult = Awaited<
  ReturnType<typeof mockedUpdateMemberRole>
>;
type CancelInvitationInput = Parameters<
  typeof AuthClient.organization.cancelInvitation
>[0];
type InviteMemberInput = Parameters<
  typeof AuthClient.organization.inviteMember
>[0];
type ListMembersInput = Parameters<
  typeof AuthClient.organization.listMembers
>[0];
type RemoveMemberInput = Parameters<
  typeof AuthClient.organization.removeMember
>[0];
type UpdateMemberRoleInput = Parameters<
  typeof AuthClient.organization.updateMemberRole
>[0];
interface InvitationPayload {
  readonly email: string;
  readonly expiresAt: Date | string;
  readonly id: string;
  readonly role: string;
  readonly status: string;
}
interface MemberPayload {
  readonly createdAt: Date | string;
  readonly id: string;
  readonly organizationId: string;
  readonly role: string;
  readonly user: {
    readonly email: string;
    readonly id: string;
    readonly image?: string | null;
    readonly name: string;
  };
  readonly userId: string;
}

const organizationId = decodeOrganizationId("org_123");
const organizationOneId = decodeOrganizationId("org_1");
const organizationTwoId = decodeOrganizationId("org_2");
const currentUserId = decodeOrganizationViewerUserId("user_owner");
const defaultInvitationExpiresAt = "2026-04-12T09:30:00.000Z";

const {
  mockedCancelInvitation,
  mockedInviteMember,
  mockedListInvitations,
  mockedListMembers,
  mockedRemoveMember,
  mockedUpdateMemberRole,
} = vi.hoisted(() => ({
  mockedCancelInvitation: vi.fn<
    (input: CancelInvitationInput) => Promise<{
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
  mockedListInvitations: vi.fn<
    (input: { query: { organizationId: string } }) => Promise<{
      data: InvitationPayload[] | null;
      error: {
        message: string;
        status: number;
        statusText: string;
      } | null;
    }>
  >(),
  mockedListMembers: vi.fn<
    (input: ListMembersInput) => Promise<{
      data: {
        members: MemberPayload[];
        total: number;
      } | null;
      error: {
        message: string;
        status: number;
        statusText: string;
      } | null;
    }>
  >(),
  mockedRemoveMember: vi.fn<
    (input: RemoveMemberInput) => Promise<{
      data: {
        member: Pick<
          MemberPayload,
          "id" | "organizationId" | "role" | "userId"
        >;
      } | null;
      error: {
        message: string;
        status: number;
        statusText: string;
      } | null;
    }>
  >(),
  mockedUpdateMemberRole: vi.fn<
    (input: UpdateMemberRoleInput) => Promise<{
      data: Pick<
        MemberPayload,
        "id" | "organizationId" | "role" | "userId"
      > | null;
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
      cancelInvitation: mockedCancelInvitation,
      inviteMember: mockedInviteMember,
      listInvitations: mockedListInvitations,
      listMembers: mockedListMembers,
      removeMember: mockedRemoveMember,
      updateMemberRole: mockedUpdateMemberRole,
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

function createDeferredResult<Value>() {
  const { promise, reject, resolve } = (
    Promise as unknown as {
      withResolvers: <Value>() => {
        promise: Promise<Value>;
        reject: (reason?: unknown) => void;
        resolve: (value: Value) => void;
      };
    }
  ).withResolvers<Value>();

  return { promise, reject, resolve };
}

function createInvitation(
  overrides: Partial<InvitationPayload> = {}
): InvitationPayload {
  return {
    email: "pending@example.com",
    expiresAt: defaultInvitationExpiresAt,
    id: "inv_123",
    role: "member",
    status: "pending",
    ...overrides,
  };
}

function createMember(overrides: Partial<MemberPayload> = {}): MemberPayload {
  return {
    createdAt: "2026-04-01T09:30:00.000Z",
    id: "mem_owner",
    organizationId: "org_123",
    role: "owner",
    user: {
      email: "owner@example.com",
      id: "user_owner",
      image: null,
      name: "Owner Example",
    },
    userId: "user_owner",
    ...overrides,
  };
}

function createMemberList(
  members: MemberPayload[] = [
    createMember(),
    createMember({
      id: "mem_member",
      role: "member",
      user: {
        email: "apprentice@example.com",
        id: "user_member",
        image: null,
        name: "Apprentice Example",
      },
      userId: "user_member",
    }),
  ]
) {
  return {
    data: {
      members,
      total: members.length,
    },
    error: null,
  };
}

describe("organization members page", () => {
  beforeEach(() => {
    mockedListMembers.mockReset();
    mockedListInvitations.mockReset();
    mockedInviteMember.mockReset();
    mockedCancelInvitation.mockReset();
    mockedRemoveMember.mockReset();
    mockedUpdateMemberRole.mockReset();

    mockedListMembers.mockResolvedValue(createMemberList());
    mockedListInvitations.mockResolvedValue({
      data: [createInvitation()],
      error: null,
    });
    mockedInviteMember.mockResolvedValue({
      data: {
        id: "inv_456",
      },
      error: null,
    });
    mockedCancelInvitation.mockResolvedValue({
      data: {
        id: "inv_123",
      },
      error: null,
    });
    mockedRemoveMember.mockResolvedValue({
      data: {
        member: {
          id: "mem_member",
          organizationId: "org_123",
          role: "member",
          userId: "user_member",
        },
      },
      error: null,
    });
    mockedUpdateMemberRole.mockResolvedValue({
      data: {
        id: "mem_member",
        organizationId: "org_123",
        role: "admin",
        userId: "user_member",
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
        createInvitation({
          email: "accepted@example.com",
          id: "inv_accepted",
          status: "accepted",
        }),
        createInvitation({
          email: longEmail,
        }),
      ],
      error: null,
    });

    render(<OrganizationMembersPage activeOrganizationId={organizationId} />);

    expect(screen.getByRole("heading", { name: "Members" })).toBeVisible();
    await expect(
      screen.findByRole("heading", { name: "Pending invitations" })
    ).resolves.toBeVisible();
    await expect(screen.findByTitle(longEmail)).resolves.toBeVisible();
    expect(screen.getByText("Expires 12 Apr 2026")).toBeVisible();
    expect(screen.queryByText("accepted@example.com")).not.toBeInTheDocument();
    expect(screen.getAllByText("1 open")).toHaveLength(1);
    expect(mockedListInvitations).toHaveBeenCalledWith({
      query: {
        organizationId: "org_123",
      },
    });
  }, 10_000);

  it("loads current organization members for the active organization", async () => {
    mockedListMembers.mockResolvedValue(
      createMemberList([
        createMember(),
        createMember({
          id: "mem_admin",
          role: "admin",
          user: {
            email: "foreperson@example.com",
            id: "user_admin",
            image: null,
            name: "Foreperson Example",
          },
          userId: "user_admin",
        }),
      ])
    );

    render(
      <OrganizationMembersPage
        activeOrganizationId={organizationId}
        currentUserId={currentUserId}
      />
    );

    const members = await screen.findByRole("list", {
      name: "Current members",
    });

    expect(within(members).getByText("Owner Example")).toBeVisible();
    expect(within(members).getByText("owner@example.com")).toBeVisible();
    expect(within(members).getByText("Foreperson Example")).toBeVisible();
    expect(within(members).getByText("foreperson@example.com")).toBeVisible();
    expect(screen.getByText("2 active")).toBeVisible();
    expect(mockedListMembers).toHaveBeenCalledWith({
      query: {
        limit: 100,
        offset: 0,
        organizationId: "org_123",
      },
    });
  }, 10_000);

  it("loads every member page and reports Better Auth's total", async () => {
    const firstPageMembers = Array.from({ length: 100 }, (_, index) =>
      createMember({
        id: `mem_${index}`,
        role: index === 0 ? "owner" : "member",
        user: {
          email: `member-${index}@example.com`,
          id: index === 0 ? "user_owner" : `user_${index}`,
          image: null,
          name: `Member ${index}`,
        },
        userId: index === 0 ? "user_owner" : `user_${index}`,
      })
    );
    const lastMember = createMember({
      id: "mem_100",
      role: "member",
      user: {
        email: "member-100@example.com",
        id: "user_100",
        image: null,
        name: "Member 100",
      },
      userId: "user_100",
    });

    mockedListMembers
      .mockResolvedValueOnce({
        data: {
          members: firstPageMembers,
          total: 101,
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: {
          members: [lastMember],
          total: 101,
        },
        error: null,
      });

    render(
      <OrganizationMembersPage
        activeOrganizationId={organizationId}
        currentUserId={currentUserId}
      />
    );

    await expect(screen.findByText("Member 100")).resolves.toBeVisible();
    expect(screen.getByText("101 active")).toBeVisible();
    expect(mockedListMembers).toHaveBeenNthCalledWith(1, {
      query: {
        limit: 100,
        offset: 0,
        organizationId: "org_123",
      },
    });
    expect(mockedListMembers).toHaveBeenNthCalledWith(2, {
      query: {
        limit: 100,
        offset: 100,
        organizationId: "org_123",
      },
    });
  }, 10_000);

  it("shows a load error when active members cannot be loaded", async () => {
    mockedListMembers.mockResolvedValue({
      data: null,
      error: {
        message: "Forbidden",
        status: 403,
        statusText: "Forbidden",
      },
    });

    render(
      <OrganizationMembersPage
        activeOrganizationId={organizationId}
        currentUserId={currentUserId}
      />
    );

    await expect(
      screen.findByText("We couldn't load members right now. Please try again.")
    ).resolves.toBeVisible();
  }, 10_000);

  it("shows a load error when member payload roles violate the app contract", async () => {
    mockedListMembers.mockResolvedValue(
      createMemberList([
        createMember({
          id: "mem_bad_role",
          role: "billing-manager",
          user: {
            email: "bad-role@example.com",
            id: "user_bad_role",
            image: null,
            name: "Bad Role Example",
          },
          userId: "user_bad_role",
        }),
      ])
    );

    render(
      <OrganizationMembersPage
        activeOrganizationId={organizationId}
        currentUserId={currentUserId}
      />
    );

    await expect(
      screen.findByText("We couldn't load members right now. Please try again.")
    ).resolves.toBeVisible();
    expect(screen.queryByText("Bad Role Example")).not.toBeInTheDocument();
  }, 10_000);

  it("updates a member role and reloads members after success", async () => {
    mockedListMembers
      .mockResolvedValueOnce(createMemberList())
      .mockResolvedValueOnce(
        createMemberList([
          createMember(),
          createMember({
            id: "mem_member",
            role: "admin",
            user: {
              email: "apprentice@example.com",
              id: "user_member",
              image: null,
              name: "Apprentice Example",
            },
            userId: "user_member",
          }),
        ])
      );

    const user = userEvent.setup();

    render(
      <OrganizationMembersPage
        activeOrganizationId={organizationId}
        currentUserId={currentUserId}
      />
    );

    await expect(
      screen.findByText("Apprentice Example")
    ).resolves.toBeVisible();
    await user.click(
      screen.getByRole("button", {
        name: "Member actions for Apprentice Example",
      })
    );
    await user.click(
      await screen.findByRole("menuitem", { name: "Make admin" })
    );

    await waitFor(() => {
      expect(mockedUpdateMemberRole).toHaveBeenCalledWith({
        memberId: "mem_member",
        organizationId: "org_123",
        role: "admin",
      });
    });
    await expect(
      screen.findByText("Apprentice Example is now Admin.")
    ).resolves.toBeVisible();
    await waitFor(() => {
      expect(mockedListMembers).toHaveBeenCalledTimes(2);
    });
    expect(screen.getAllByText("Admin").length).toBeGreaterThan(0);
  }, 10_000);

  it("shows a per-row error when a member role update fails", async () => {
    mockedUpdateMemberRole.mockResolvedValue({
      data: null,
      error: {
        message: "Forbidden",
        status: 403,
        statusText: "Forbidden",
      },
    });

    const user = userEvent.setup();

    render(
      <OrganizationMembersPage
        activeOrganizationId={organizationId}
        currentUserId={currentUserId}
      />
    );

    await expect(
      screen.findByText("Apprentice Example")
    ).resolves.toBeVisible();
    await user.click(
      screen.getByRole("button", {
        name: "Member actions for Apprentice Example",
      })
    );
    await user.click(
      await screen.findByRole("menuitem", { name: "Make admin" })
    );

    await expect(
      screen.findByText("We couldn't update Apprentice Example's role.")
    ).resolves.toBeVisible();
    expect(screen.getByText("Apprentice Example")).toBeVisible();
  }, 10_000);

  it("keeps the updated role visible when the success refresh fails", async () => {
    mockedListMembers
      .mockResolvedValueOnce(createMemberList())
      .mockResolvedValueOnce({
        data: null,
        error: {
          message: "Member refresh failed",
          status: 500,
          statusText: "Internal Server Error",
        },
      });

    const user = userEvent.setup();

    render(
      <OrganizationMembersPage
        activeOrganizationId={organizationId}
        currentUserId={currentUserId}
      />
    );

    await expect(
      screen.findByText("Apprentice Example")
    ).resolves.toBeVisible();
    await user.click(
      screen.getByRole("button", {
        name: "Member actions for Apprentice Example",
      })
    );
    await user.click(
      await screen.findByRole("menuitem", { name: "Make admin" })
    );

    await expect(
      screen.findByText("Apprentice Example is now Admin.")
    ).resolves.toBeVisible();
    expect(screen.getAllByText("Admin").length).toBeGreaterThan(0);
    expect(
      screen.getByText("We couldn't load members right now. Please try again.")
    ).toBeVisible();
  }, 10_000);

  it("removes a member and reloads members after success", async () => {
    mockedListMembers
      .mockResolvedValueOnce(createMemberList())
      .mockResolvedValueOnce(createMemberList([createMember()]));

    const user = userEvent.setup();

    render(
      <OrganizationMembersPage
        activeOrganizationId={organizationId}
        currentUserId={currentUserId}
      />
    );

    await expect(
      screen.findByText("Apprentice Example")
    ).resolves.toBeVisible();
    await user.click(
      screen.getByRole("button", {
        name: "Member actions for Apprentice Example",
      })
    );
    await user.click(
      await screen.findByRole("menuitem", { name: "Remove member" })
    );
    await expect(
      screen.findByRole("dialog", { name: "Remove Apprentice Example?" })
    ).resolves.toBeVisible();
    await user.click(screen.getByRole("button", { name: "Remove member" }));

    await waitFor(() => {
      expect(mockedRemoveMember).toHaveBeenCalledWith({
        memberIdOrEmail: "mem_member",
        organizationId: "org_123",
      });
    });
    await expect(
      screen.findByText("Apprentice Example was removed.")
    ).resolves.toBeVisible();
    await waitFor(() => {
      expect(screen.queryByText("Apprentice Example")).not.toBeInTheDocument();
    });
  }, 10_000);

  it("shows a per-row error when member removal fails", async () => {
    mockedRemoveMember.mockResolvedValue({
      data: null,
      error: {
        message: "Forbidden",
        status: 403,
        statusText: "Forbidden",
      },
    });

    const user = userEvent.setup();

    render(
      <OrganizationMembersPage
        activeOrganizationId={organizationId}
        currentUserId={currentUserId}
      />
    );

    await expect(
      screen.findByText("Apprentice Example")
    ).resolves.toBeVisible();
    await user.click(
      screen.getByRole("button", {
        name: "Member actions for Apprentice Example",
      })
    );
    await user.click(
      await screen.findByRole("menuitem", { name: "Remove member" })
    );
    await user.click(
      await screen.findByRole("button", { name: "Remove member" })
    );

    await expect(
      screen.findByText("We couldn't remove Apprentice Example.")
    ).resolves.toBeVisible();
    expect(screen.getByText("Apprentice Example")).toBeVisible();
  }, 10_000);

  it("does not expose row actions for the signed-in member or only owner", async () => {
    render(
      <OrganizationMembersPage
        activeOrganizationId={organizationId}
        currentUserId={currentUserId}
      />
    );

    await expect(screen.findByText("Owner Example")).resolves.toBeVisible();

    expect(
      screen.queryByRole("button", {
        name: "Member actions for Owner Example",
      })
    ).not.toBeInTheDocument();
    expect(mockedUpdateMemberRole).not.toHaveBeenCalled();
    expect(mockedRemoveMember).not.toHaveBeenCalled();
  }, 10_000);

  it("does not expose member management actions to non-admin viewers", async () => {
    render(
      <OrganizationMembersPage
        activeOrganizationId={organizationId}
        currentMember={{
          email: "member@example.com",
          name: "Member Example",
          role: "member",
        }}
      />
    );

    await expect(
      screen.findByText("Apprentice Example")
    ).resolves.toBeVisible();

    expect(
      screen.queryByRole("button", {
        name: "Member actions for Apprentice Example",
      })
    ).not.toBeInTheDocument();
  }, 10_000);

  it("uses the membership user id to identify the signed-in member", async () => {
    mockedListMembers.mockResolvedValue(
      createMemberList([
        createMember({
          user: {
            email: "owner@example.com",
            id: "stale_joined_user",
            image: null,
            name: "Owner Example",
          },
          userId: "user_owner",
        }),
        createMember({
          id: "mem_member",
          role: "member",
          user: {
            email: "apprentice@example.com",
            id: "user_member",
            image: null,
            name: "Apprentice Example",
          },
          userId: "user_member",
        }),
      ])
    );

    render(
      <OrganizationMembersPage
        activeOrganizationId={organizationId}
        currentUserId={currentUserId}
      />
    );

    await expect(screen.findByText("Owner Example")).resolves.toBeVisible();
    expect(screen.getByText("You")).toBeVisible();
    expect(
      screen.queryByRole("button", {
        name: "Member actions for Owner Example",
      })
    ).not.toBeInTheDocument();
  }, 10_000);

  it("clears stale members while another organization loads", async () => {
    const orgTwoMembers = createDeferredResult<ListMembersResult>();

    mockedListMembers
      .mockResolvedValueOnce(
        createMemberList([
          createMember({
            organizationId: "org_1",
            user: {
              email: "old-org@example.com",
              id: "user_owner",
              image: null,
              name: "Old Org Owner",
            },
          }),
        ])
      )
      .mockReturnValueOnce(orgTwoMembers.promise);

    const { rerender } = render(
      <OrganizationMembersPage
        activeOrganizationId={organizationOneId}
        currentUserId={currentUserId}
      />
    );

    await expect(screen.findByText("Old Org Owner")).resolves.toBeVisible();

    rerender(
      <OrganizationMembersPage
        activeOrganizationId={organizationTwoId}
        currentUserId={currentUserId}
      />
    );

    await waitFor(() => {
      expect(screen.queryByText("Old Org Owner")).not.toBeInTheDocument();
    });

    orgTwoMembers.resolve(
      createMemberList([
        createMember({
          organizationId: "org_2",
          user: {
            email: "new-org@example.com",
            id: "user_owner",
            image: null,
            name: "New Org Owner",
          },
        }),
      ])
    );

    await expect(screen.findByText("New Org Owner")).resolves.toBeVisible();
  }, 10_000);

  it("ignores member list results that finish after the organization changes", async () => {
    const orgOneMembers = createDeferredResult<ListMembersResult>();
    const orgTwoMembers = createDeferredResult<ListMembersResult>();

    mockedListMembers
      .mockReturnValueOnce(orgOneMembers.promise)
      .mockReturnValueOnce(orgTwoMembers.promise);

    const { rerender } = render(
      <OrganizationMembersPage
        activeOrganizationId={organizationOneId}
        currentUserId={currentUserId}
      />
    );

    rerender(
      <OrganizationMembersPage
        activeOrganizationId={organizationTwoId}
        currentUserId={currentUserId}
      />
    );

    orgTwoMembers.resolve(
      createMemberList([
        createMember({
          organizationId: "org_2",
          user: {
            email: "new-org@example.com",
            id: "user_owner",
            image: null,
            name: "New Org Owner",
          },
        }),
      ])
    );

    await expect(screen.findByText("New Org Owner")).resolves.toBeVisible();

    orgOneMembers.resolve(
      createMemberList([
        createMember({
          organizationId: "org_1",
          user: {
            email: "old-org@example.com",
            id: "user_owner",
            image: null,
            name: "Old Org Owner",
          },
        }),
      ])
    );

    await waitFor(() => {
      expect(screen.queryByText("Old Org Owner")).not.toBeInTheDocument();
    });
    expect(screen.getByText("New Org Owner")).toBeVisible();
  }, 10_000);

  it("ignores member role results that finish after the organization changes", async () => {
    const updateRole = createDeferredResult<UpdateMemberRoleResult>();

    mockedListMembers
      .mockResolvedValueOnce(createMemberList())
      .mockResolvedValueOnce(
        createMemberList([
          createMember({
            organizationId: "org_2",
            user: {
              email: "new-org@example.com",
              id: "user_owner",
              image: null,
              name: "New Org Owner",
            },
          }),
        ])
      );
    mockedUpdateMemberRole.mockReturnValueOnce(updateRole.promise);

    const user = userEvent.setup();

    const { rerender } = render(
      <OrganizationMembersPage
        activeOrganizationId={organizationOneId}
        currentUserId={currentUserId}
      />
    );

    await expect(
      screen.findByText("Apprentice Example")
    ).resolves.toBeVisible();
    await user.click(
      screen.getByRole("button", {
        name: "Member actions for Apprentice Example",
      })
    );
    await user.click(
      await screen.findByRole("menuitem", { name: "Make admin" })
    );

    rerender(
      <OrganizationMembersPage
        activeOrganizationId={organizationTwoId}
        currentUserId={currentUserId}
      />
    );

    await expect(screen.findByText("New Org Owner")).resolves.toBeVisible();

    updateRole.resolve({
      data: {
        id: "mem_member",
        organizationId: "org_1",
        role: "admin",
        userId: "user_member",
      },
      error: null,
    });

    await waitFor(() => {
      expect(mockedUpdateMemberRole).toHaveBeenCalledOnce();
    });
    expect(mockedListMembers).toHaveBeenCalledTimes(2);
    expect(
      screen.queryByText("Apprentice Example is now Admin.")
    ).not.toBeInTheDocument();
    expect(screen.getByText("New Org Owner")).toBeVisible();
  }, 10_000);

  it("ignores member removal errors that finish after the organization changes", async () => {
    const removeMember =
      createDeferredResult<Awaited<ReturnType<typeof mockedRemoveMember>>>();

    mockedListMembers
      .mockResolvedValueOnce(createMemberList())
      .mockResolvedValueOnce(
        createMemberList([
          createMember({
            organizationId: "org_2",
            user: {
              email: "new-org@example.com",
              id: "user_owner",
              image: null,
              name: "New Org Owner",
            },
          }),
        ])
      );
    mockedRemoveMember.mockReturnValueOnce(removeMember.promise);

    const user = userEvent.setup();

    const { rerender } = render(
      <OrganizationMembersPage
        activeOrganizationId={organizationOneId}
        currentUserId={currentUserId}
      />
    );

    await expect(
      screen.findByText("Apprentice Example")
    ).resolves.toBeVisible();
    await user.click(
      screen.getByRole("button", {
        name: "Member actions for Apprentice Example",
      })
    );
    await user.click(
      await screen.findByRole("menuitem", { name: "Remove member" })
    );
    await user.click(
      await screen.findByRole("button", { name: "Remove member" })
    );

    rerender(
      <OrganizationMembersPage
        activeOrganizationId={organizationTwoId}
        currentUserId={currentUserId}
      />
    );

    await expect(screen.findByText("New Org Owner")).resolves.toBeVisible();

    removeMember.resolve({
      data: null,
      error: {
        message: "Forbidden",
        status: 403,
        statusText: "Forbidden",
      },
    });

    await waitFor(() => {
      expect(mockedRemoveMember).toHaveBeenCalledOnce();
    });
    expect(
      screen.queryByText("We couldn't remove Apprentice Example.")
    ).not.toBeInTheDocument();
    expect(screen.getByText("New Org Owner")).toBeVisible();
  }, 10_000);

  it("loads pending invitations when the auth client returns Date expiry values", async () => {
    mockedListInvitations.mockResolvedValue({
      data: [
        createInvitation({
          email: "date-expiry@example.com",
          expiresAt: new Date(defaultInvitationExpiresAt),
        }),
      ],
      error: null,
    });

    render(<OrganizationMembersPage activeOrganizationId={organizationId} />);

    await expect(
      screen.findByTitle("date-expiry@example.com")
    ).resolves.toBeVisible();
    expect(screen.getByText("Expires 12 Apr 2026")).toBeVisible();
  }, 10_000);

  it("submits invites for the active organization", async () => {
    mockedListInvitations
      .mockResolvedValueOnce({
        data: [
          createInvitation({
            email: "ops@example.com",
            id: "inv_existing",
          }),
        ],
        error: null,
      })
      .mockResolvedValueOnce({
        data: [
          createInvitation({
            email: "ops@example.com",
            id: "inv_existing",
          }),
          createInvitation({
            email: "member@example.com",
            expiresAt: "2026-04-13T09:30:00.000Z",
            id: "inv_456",
            role: "admin",
          }),
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

  it("resends pending invitations from the pending list", async () => {
    mockedListInvitations.mockResolvedValueOnce({
      data: [
        createInvitation({
          role: "admin",
        }),
      ],
      error: null,
    });

    const user = userEvent.setup();

    render(<OrganizationMembersPage activeOrganizationId={organizationId} />);

    await expect(
      screen.findByTitle("pending@example.com")
    ).resolves.toBeVisible();

    await user.click(
      screen.getByRole("button", {
        name: "Resend invitation to pending@example.com",
      })
    );

    await waitFor(() => {
      expect(mockedInviteMember).toHaveBeenCalledWith({
        email: "pending@example.com",
        organizationId: "org_123",
        resend: true,
        role: "admin",
      });
    });
    await expect(
      screen.findByText("Invitation resent to pending@example.com.")
    ).resolves.toBeInTheDocument();
    expect(mockedListInvitations).toHaveBeenCalledOnce();
  }, 10_000);

  it("shows a safe error when resending a pending invitation fails", async () => {
    mockedInviteMember.mockResolvedValue({
      data: null,
      error: {
        message: "Invitation email failed",
        status: 500,
        statusText: "Internal Server Error",
      },
    });

    const user = userEvent.setup();

    render(<OrganizationMembersPage activeOrganizationId={organizationId} />);

    await expect(
      screen.findByTitle("pending@example.com")
    ).resolves.toBeVisible();

    await user.click(
      screen.getByRole("button", {
        name: "Resend invitation to pending@example.com",
      })
    );

    await expect(
      screen.findByText("We couldn't update that invitation. Please try again.")
    ).resolves.toBeInTheDocument();
    expect(screen.getByTitle("pending@example.com")).toBeVisible();
  }, 10_000);

  it("cancels pending invitations from the pending list", async () => {
    mockedListInvitations.mockResolvedValueOnce({
      data: [createInvitation()],
      error: null,
    });

    const user = userEvent.setup();

    render(<OrganizationMembersPage activeOrganizationId={organizationId} />);

    await expect(
      screen.findByTitle("pending@example.com")
    ).resolves.toBeVisible();

    await user.click(
      screen.getByRole("button", {
        name: "Cancel invitation to pending@example.com",
      })
    );

    await waitFor(() => {
      expect(mockedCancelInvitation).toHaveBeenCalledWith({
        invitationId: "inv_123",
      });
    });
    await expect(
      screen.findByText("Invitation canceled for pending@example.com.")
    ).resolves.toBeInTheDocument();
    await waitFor(() => {
      expect(
        screen.queryByTitle("pending@example.com")
      ).not.toBeInTheDocument();
    });
  }, 10_000);

  it("shows a safe error when canceling a pending invitation fails", async () => {
    mockedCancelInvitation.mockResolvedValue({
      data: null,
      error: {
        message: "Forbidden",
        status: 403,
        statusText: "Forbidden",
      },
    });

    const user = userEvent.setup();

    render(<OrganizationMembersPage activeOrganizationId={organizationId} />);

    await expect(
      screen.findByTitle("pending@example.com")
    ).resolves.toBeVisible();

    await user.click(
      screen.getByRole("button", {
        name: "Cancel invitation to pending@example.com",
      })
    );

    await expect(
      screen.findByText("We couldn't update that invitation. Please try again.")
    ).resolves.toBeInTheDocument();
    expect(screen.getByTitle("pending@example.com")).toBeVisible();
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
        createInvitation({
          email: "bad-role@example.com",
          id: "inv_bad_role",
          role: "owner",
        }),
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
    const orgTwoInvitations = createDeferredResult<ListInvitationsResult>();

    mockedListInvitations
      .mockResolvedValueOnce({
        data: [
          createInvitation({
            email: "old-org@example.com",
            id: "inv_old",
          }),
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
        createInvitation({
          email: "new-org@example.com",
          id: "inv_new",
          role: "admin",
        }),
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
        createInvitation({
          email: "accepted@example.com",
          id: "inv_accepted",
          status: "accepted",
        }),
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
