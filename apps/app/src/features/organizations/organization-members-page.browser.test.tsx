import {
  decodeInvitationId,
  decodeOrganizationId,
  decodeOrganizationMemberId,
  decodeUserId,
} from "@ceird/identity-core";
import type {
  CancelOrganizationInvitationResponse,
  CanceledOrganizationInvitation,
  InviteOrganizationMemberResponse,
  OrganizationInvitationListResponse,
  OrganizationMember,
  OrganizationMemberListResponse,
  PendingOrganizationInvitation,
  RemoveOrganizationMemberResponse,
  UpdateOrganizationMemberRoleResponse,
} from "@ceird/identity-core";
import { HotkeysProvider } from "@tanstack/react-hotkeys";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";

import {
  CommandBarProvider,
  useCommandActions,
} from "#/features/command-bar/command-bar";
import { ShortcutHelpOverlay } from "#/hotkeys/shortcut-help-overlay";

import type * as OrganizationMembersApi from "./organization-members-api";
import { OrganizationMembersPage as BaseOrganizationMembersPage } from "./organization-members-page";

type ListMembersResult = Awaited<ReturnType<typeof mockedListMembers>>;
type ListInvitationsResult = Awaited<ReturnType<typeof mockedListInvitations>>;
type UpdateMemberRoleResult = Awaited<
  ReturnType<typeof mockedUpdateMemberRole>
>;

const organizationId = decodeOrganizationId("org_123");
const organizationOneId = decodeOrganizationId("org_1");
const organizationTwoId = decodeOrganizationId("org_2");
const currentUserId = decodeUserId("user_owner");
const defaultInvitationExpiresAt = "2026-04-12T09:30:00.000Z";

type InvitationFixtureOverrides = Partial<
  Omit<PendingOrganizationInvitation, "id" | "organizationId">
> & {
  readonly id?: string | PendingOrganizationInvitation["id"];
  readonly organizationId?:
    | string
    | PendingOrganizationInvitation["organizationId"];
};
type MemberFixtureOverrides = Partial<
  Omit<OrganizationMember, "id" | "organizationId" | "userId">
> & {
  readonly id?: string | OrganizationMember["id"];
  readonly organizationId?: string | OrganizationMember["organizationId"];
  readonly userId?: string | OrganizationMember["userId"];
};

const {
  mockedCancelInvitation,
  mockedInviteMember,
  mockedListInvitations,
  mockedListMembers,
  mockedRemoveMember,
  mockedUpdateMemberRole,
} = vi.hoisted(() => ({
  mockedCancelInvitation:
    vi.fn<typeof OrganizationMembersApi.cancelOrganizationInvitation>(),
  mockedInviteMember:
    vi.fn<typeof OrganizationMembersApi.inviteOrganizationMember>(),
  mockedListInvitations:
    vi.fn<typeof OrganizationMembersApi.listOrganizationInvitations>(),
  mockedListMembers:
    vi.fn<typeof OrganizationMembersApi.listOrganizationMembers>(),
  mockedRemoveMember:
    vi.fn<typeof OrganizationMembersApi.removeOrganizationMember>(),
  mockedUpdateMemberRole:
    vi.fn<typeof OrganizationMembersApi.updateOrganizationMemberRole>(),
}));

vi.mock(import("./organization-members-api"), () => ({
  cancelOrganizationInvitation: mockedCancelInvitation,
  inviteOrganizationMember: mockedInviteMember,
  listOrganizationInvitations: mockedListInvitations,
  listOrganizationMembers: mockedListMembers,
  removeOrganizationMember: mockedRemoveMember,
  updateOrganizationMemberRole: mockedUpdateMemberRole,
}));

async function chooseCommandOption(
  user: ReturnType<typeof userEvent.setup>,
  label: string,
  optionLabel: string
) {
  await user.click(screen.getByLabelText(label));
  await user.click(
    screen.getByRole("option", { name: commandOptionName(optionLabel) })
  );
}

function commandOptionName(label: string) {
  return new RegExp(`^${label.replaceAll(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`);
}

async function openInviteDialog(user: ReturnType<typeof userEvent.setup>) {
  await user.click(
    await screen.findByRole("button", { name: "Invite teammate" })
  );

  return screen.findByRole("dialog", { name: "Invite teammate" });
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
  overrides: InvitationFixtureOverrides = {}
): PendingOrganizationInvitation {
  const {
    id = "inv_123",
    organizationId: orgId = organizationId,
    ...rest
  } = overrides;

  return {
    createdAt: "2026-04-01T09:30:00.000Z",
    email: "pending@example.com",
    expiresAt: defaultInvitationExpiresAt,
    id: decodeInvitationId(id),
    organizationId: decodeOrganizationId(orgId),
    role: "member",
    status: "pending",
    ...rest,
  };
}

function createMember(
  overrides: MemberFixtureOverrides = {}
): OrganizationMember {
  const {
    id = "mem_owner",
    organizationId: orgId = organizationId,
    userId = currentUserId,
    ...rest
  } = overrides;

  return {
    createdAt: "2026-04-01T09:30:00.000Z",
    email: "owner@example.com",
    id: decodeOrganizationMemberId(id),
    name: "Owner Example",
    organizationId: decodeOrganizationId(orgId),
    role: "owner",
    userId: decodeUserId(userId),
    ...rest,
  };
}

function createMemberList(
  members: OrganizationMember[] = [
    createMember(),
    createMember({
      email: "apprentice@example.com",
      id: decodeOrganizationMemberId("mem_member"),
      name: "Apprentice Example",
      role: "member",
      userId: decodeUserId("user_member"),
    }),
  ]
): OrganizationMemberListResponse {
  return {
    members,
    total: members.length,
  };
}

function createInvitationList(
  invitations: PendingOrganizationInvitation[] = [createInvitation()]
): OrganizationInvitationListResponse {
  return { invitations };
}

function createInviteResponse(
  invitation: PendingOrganizationInvitation = createInvitation({
    id: "inv_456",
  })
): InviteOrganizationMemberResponse {
  return { invitation };
}

function createCanceledInvitation(): CanceledOrganizationInvitation {
  return {
    ...createInvitation(),
    status: "canceled",
  };
}

function createCancelInvitationResponse(
  invitation: CanceledOrganizationInvitation = createCanceledInvitation()
): CancelOrganizationInvitationResponse {
  return { invitation };
}

function createUpdateRoleResponse(
  member: OrganizationMember = createMember({
    id: "mem_member",
    role: "admin",
    userId: decodeUserId("user_member"),
  })
): UpdateOrganizationMemberRoleResponse {
  return { member };
}

function createRemoveMemberResponse(): RemoveOrganizationMemberResponse {
  return { removedMemberId: decodeOrganizationMemberId("mem_member") };
}

function createApiError(input: {
  readonly code?: string;
  readonly message: string;
  readonly status: number;
  readonly statusText: string;
}) {
  return input;
}

type OrganizationMembersPageProps = ComponentProps<
  typeof BaseOrganizationMembersPage
>;

function OrganizationMembersPage({
  activeOrganizationId: activeOrgId = organizationId,
  currentMember = {
    email: "owner@example.com",
    name: "Owner Example",
    role: "owner",
  },
  currentUserId: viewerUserId = currentUserId,
  ...props
}: Partial<OrganizationMembersPageProps>) {
  return (
    <BaseOrganizationMembersPage
      activeOrganizationId={activeOrgId}
      currentMember={currentMember}
      currentUserId={viewerUserId}
      {...props}
    />
  );
}

function RegisteredActionTitles() {
  const actions = useCommandActions();

  return (
    <div data-testid="registered-actions">
      {actions.map((action) => action.title).join(", ") || "none"}
    </div>
  );
}

function getModEnterKeyboardInput() {
  return /(Mac|iPhone|iPad|iPod)/i.test(navigator.platform)
    ? "{Meta>}{Enter}{/Meta}"
    : "{Control>}{Enter}{/Control}";
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
    mockedListInvitations.mockResolvedValue(createInvitationList());
    mockedInviteMember.mockResolvedValue(createInviteResponse());
    mockedCancelInvitation.mockResolvedValue(createCancelInvitationResponse());
    mockedRemoveMember.mockResolvedValue(createRemoveMemberResponse());
    mockedUpdateMemberRole.mockResolvedValue(createUpdateRoleResponse());
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("loads pending invitations for the active organization", async () => {
    const longEmail =
      "very.long.project.supervisor.address@exampleconstructioncompany.com";

    mockedListInvitations.mockResolvedValue(
      createInvitationList([
        createInvitation({
          email: longEmail,
        }),
      ])
    );

    render(
      <OrganizationMembersPage
        activeOrganizationId={organizationId}
        currentUserId={currentUserId}
      />
    );

    expect(screen.getByRole("heading", { name: "Members" })).toBeVisible();
    expect(screen.queryByText("Organization access")).not.toBeInTheDocument();
    expect(
      screen.queryByText(
        "Owners, admins, teammates, and external collaborators with active access."
      )
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("Invites that have not been accepted yet.")
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("region", { name: "Member access overview" })
    ).not.toBeInTheDocument();
    await expect(
      screen.findByRole("heading", { name: "Pending invitations" })
    ).resolves.toBeVisible();
    await expect(screen.findByTitle(longEmail)).resolves.toBeVisible();
    expect(screen.getByText("Expires 12 Apr 2026")).toBeVisible();
    expect(screen.queryByText("accepted@example.com")).not.toBeInTheDocument();
    expect(screen.getByText("1 open")).toBeVisible();
    expect(
      screen.getByRole("button", {
        name: `Invitation actions for ${longEmail}`,
      })
    ).toBeVisible();
    expect(
      screen.queryByRole("button", {
        name: `Resend invitation to ${longEmail}`,
      })
    ).not.toBeInTheDocument();
    expect(mockedListInvitations).toHaveBeenCalledWith();
  }, 10_000);

  it("loads current organization members for the active organization", async () => {
    mockedListMembers.mockResolvedValue(
      createMemberList([
        createMember(),
        createMember({
          email: "foreperson@example.com",
          id: "mem_admin",
          name: "Foreperson Example",
          role: "admin",
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
      limit: 100,
      offset: 0,
    });
  }, 10_000);

  it("keeps the invite form behind an invite teammate dialog", async () => {
    const user = userEvent.setup();

    render(
      <OrganizationMembersPage
        activeOrganizationId={organizationId}
        currentUserId={currentUserId}
      />
    );

    expect(screen.queryByLabelText("Email")).not.toBeInTheDocument();

    const dialog = await openInviteDialog(user);

    expect(within(dialog).getByLabelText("Email")).toBeVisible();
    expect(within(dialog).getByLabelText("Email")).toHaveFocus();
    expect(within(dialog).getByLabelText("Role")).toBeVisible();
    expect(
      within(dialog).getByRole("button", { name: "Send invite" })
    ).toBeVisible();
  }, 10_000);

  it("keeps the current owner visible when they are the only active member", async () => {
    mockedListMembers.mockResolvedValue(
      createMemberList([
        createMember({
          email: "owner@example.com",
          id: "mem_owner",
          name: "Owner Example",
          role: "owner",
          userId: "user_owner",
        }),
      ])
    );
    mockedListInvitations.mockResolvedValue(createInvitationList([]));

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
    expect(screen.getByText("1 active")).toBeVisible();
    expect(screen.queryByText("No teammates yet.")).not.toBeInTheDocument();
  }, 10_000);

  it("does not render a fallback current-member row before members load", async () => {
    const membersResult = createDeferredResult<ListMembersResult>();

    mockedListMembers.mockReturnValue(membersResult.promise);
    mockedListInvitations.mockResolvedValue(createInvitationList([]));

    render(
      <OrganizationMembersPage
        activeOrganizationId={organizationId}
        currentMember={{
          email: "fallback@example.com",
          name: "Fallback Person",
          role: "owner",
        }}
        currentUserId={currentUserId}
      />
    );

    expect(screen.getByText("Loading members")).toBeInTheDocument();
    expect(screen.queryByText("Fallback Person")).not.toBeInTheDocument();
    expect(screen.queryByText("fallback@example.com")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("list", { name: "Current members" })
    ).not.toBeInTheDocument();

    await act(async () => {
      membersResult.resolve(
        createMemberList([
          createMember({
            email: "owner@example.com",
            id: "mem_owner",
            name: "Owner Example",
            role: "owner",
            userId: "user_owner",
          }),
        ])
      );
      await membersResult.promise;
    });

    const members = await screen.findByRole("list", {
      name: "Current members",
    });

    expect(within(members).getByText("Owner Example")).toBeVisible();
    expect(screen.queryByText("Fallback Person")).not.toBeInTheDocument();
  }, 10_000);

  it("registers members page command actions", async () => {
    render(
      <CommandBarProvider>
        <OrganizationMembersPage
          activeOrganizationId={organizationId}
          currentUserId={currentUserId}
        />
        <RegisteredActionTitles />
      </CommandBarProvider>
    );

    await expect(
      screen.findByText("pending@example.com")
    ).resolves.toBeVisible();

    await waitFor(() => {
      expect(screen.getByTestId("registered-actions")).toHaveTextContent(
        "Invite teammate, Refresh members"
      );
    });
  }, 10_000);

  it("loads every member page and reports Better Auth's total", async () => {
    const firstPageMembers = Array.from({ length: 100 }, (_, index) =>
      createMember({
        id: `mem_${index}`,
        role: index === 0 ? "owner" : "member",
        email: `member-${index}@example.com`,
        name: `Member ${index}`,
        userId: index === 0 ? "user_owner" : `user_${index}`,
      })
    );
    const lastMember = createMember({
      id: "mem_100",
      role: "member",
      email: "member-100@example.com",
      name: "Member 100",
      userId: "user_100",
    });

    mockedListMembers
      .mockResolvedValueOnce({
        members: firstPageMembers,
        total: 101,
      })
      .mockResolvedValueOnce({
        members: [lastMember],
        total: 101,
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
      limit: 100,
      offset: 0,
    });
    expect(mockedListMembers).toHaveBeenNthCalledWith(2, {
      limit: 100,
      offset: 100,
    });
  }, 10_000);

  it("shows a load error when active members cannot be loaded", async () => {
    mockedListMembers.mockRejectedValue(
      createApiError({
        message: "Forbidden",
        status: 403,
        statusText: "Forbidden",
      })
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
  }, 10_000);

  it("updates a member role and reloads members after success", async () => {
    mockedListMembers
      .mockResolvedValueOnce(createMemberList())
      .mockResolvedValueOnce(
        createMemberList([
          createMember(),
          createMember({
            email: "apprentice@example.com",
            id: "mem_member",
            name: "Apprentice Example",
            role: "admin",
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
    mockedUpdateMemberRole.mockRejectedValue(
      createApiError({
        message: "Forbidden",
        status: 403,
        statusText: "Forbidden",
      })
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

    await expect(
      screen.findByText("We couldn't update Apprentice Example's role.")
    ).resolves.toBeVisible();
    expect(screen.getByText("Apprentice Example")).toBeVisible();
  }, 10_000);

  it("keeps the updated role visible when the success refresh fails", async () => {
    mockedListMembers
      .mockResolvedValueOnce(createMemberList())
      .mockRejectedValueOnce(
        createApiError({
          message: "Member refresh failed",
          status: 500,
          statusText: "Internal Server Error",
        })
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
        memberId: "mem_member",
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
    mockedRemoveMember.mockRejectedValue(
      createApiError({
        message: "Forbidden",
        status: 403,
        statusText: "Forbidden",
      })
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
          email: "owner@example.com",
          name: "Owner Example",
          userId: "user_owner",
        }),
        createMember({
          id: "mem_member",
          role: "member",
          email: "apprentice@example.com",
          name: "Apprentice Example",
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
            email: "old-org@example.com",
            name: "Old Org Owner",
            userId: "user_old_owner",
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
          email: "new-org@example.com",
          name: "New Org Owner",
          userId: "user_new_owner",
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
          email: "new-org@example.com",
          name: "New Org Owner",
          userId: "user_new_owner",
        }),
      ])
    );

    await expect(screen.findByText("New Org Owner")).resolves.toBeVisible();

    orgOneMembers.resolve(
      createMemberList([
        createMember({
          organizationId: "org_1",
          email: "old-org@example.com",
          name: "Old Org Owner",
          userId: "user_old_owner",
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
            email: "new-org@example.com",
            name: "New Org Owner",
            userId: "user_new_owner",
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
      member: createMember({
        organizationId: "org_1",
        id: "mem_member",
        role: "admin",
        userId: "user_member",
      }),
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
            email: "new-org@example.com",
            name: "New Org Owner",
            userId: "user_new_owner",
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

    removeMember.reject(
      createApiError({
        message: "Forbidden",
        status: 403,
        statusText: "Forbidden",
      })
    );

    await waitFor(() => {
      expect(mockedRemoveMember).toHaveBeenCalledOnce();
    });
    expect(
      screen.queryByText("We couldn't remove Apprentice Example.")
    ).not.toBeInTheDocument();
    expect(screen.getByText("New Org Owner")).toBeVisible();
  }, 10_000);

  it("submits invites for the active organization", async () => {
    mockedListInvitations
      .mockResolvedValueOnce(
        createInvitationList([
          createInvitation({
            email: "ops@example.com",
            id: "inv_existing",
          }),
        ])
      )
      .mockResolvedValueOnce(
        createInvitationList([
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
        ])
      );

    const user = userEvent.setup();

    render(
      <OrganizationMembersPage
        activeOrganizationId={organizationId}
        currentUserId={currentUserId}
      />
    );

    await expect(screen.findByText("ops@example.com")).resolves.toBeVisible();
    expect(screen.getByText("1 open")).toBeVisible();

    const dialog = await openInviteDialog(user);

    await user.type(
      within(dialog).getByLabelText("Email"),
      "member@example.com"
    );
    await chooseCommandOption(user, "Role", "Admin");
    await user.click(
      within(dialog).getByRole("button", { name: "Send invite" })
    );

    await waitFor(() => {
      expect(mockedInviteMember).toHaveBeenCalledWith({
        email: "member@example.com",
        role: "admin",
      });
    });
    await expect(
      screen.findByText("Invitation sent to member@example.com.")
    ).resolves.toBeInTheDocument();
    await waitFor(() => {
      expect(mockedListInvitations).toHaveBeenCalledTimes(2);
    });
    expect(mockedListInvitations).toHaveBeenNthCalledWith(1);
    expect(mockedListInvitations).toHaveBeenNthCalledWith(2);
    await expect(
      screen.findByTitle("member@example.com")
    ).resolves.toBeVisible();
    expect(screen.getByText("2 open")).toBeVisible();
  }, 10_000);

  it("submits the invite form with the submit hotkey", async () => {
    const user = userEvent.setup();

    render(
      <HotkeysProvider>
        <OrganizationMembersPage
          activeOrganizationId={organizationId}
          currentUserId={currentUserId}
        />
      </HotkeysProvider>
    );

    await openInviteDialog(user);
    await user.type(screen.getByLabelText("Email"), "member@example.com");
    await user.keyboard(getModEnterKeyboardInput());

    await waitFor(() => {
      expect(mockedInviteMember).toHaveBeenCalledWith({
        email: "member@example.com",
        role: "member",
      });
    });
    await expect(
      screen.findByText("Invitation sent to member@example.com.")
    ).resolves.toBeInTheDocument();
  }, 10_000);

  it("opens the invite role picker with the role hotkey", async () => {
    const user = userEvent.setup();

    render(
      <HotkeysProvider>
        <OrganizationMembersPage
          activeOrganizationId={organizationId}
          currentUserId={currentUserId}
        />
      </HotkeysProvider>
    );

    await openInviteDialog(user);
    await user.tab();
    await user.keyboard("r");

    expect(screen.getByRole("listbox", { name: "Suggestions" })).toBeVisible();
    expect(
      screen.getByRole("option", { name: commandOptionName("Admin") })
    ).toBeVisible();
    expect(
      screen.getByRole("option", {
        name: commandOptionName("External collaborator"),
      })
    ).toBeVisible();
  }, 10_000);

  it("opens the invite dialog with the members invite hotkey", async () => {
    const user = userEvent.setup();

    render(
      <HotkeysProvider>
        <OrganizationMembersPage
          activeOrganizationId={organizationId}
          currentUserId={currentUserId}
        />
      </HotkeysProvider>
    );

    await user.keyboard("n");

    await expect(
      screen.findByRole("dialog", { name: "Invite teammate" })
    ).resolves.toBeVisible();
  }, 10_000);

  it("submits external collaborator invites", async () => {
    const user = userEvent.setup();

    render(
      <OrganizationMembersPage
        activeOrganizationId={organizationId}
        currentUserId={currentUserId}
      />
    );

    const dialog = await openInviteDialog(user);

    await user.type(
      within(dialog).getByLabelText("Email"),
      "vendor@example.com"
    );
    await chooseCommandOption(user, "Role", "External collaborator");
    await user.click(
      within(dialog).getByRole("button", { name: "Send invite" })
    );

    await waitFor(() => {
      expect(mockedInviteMember).toHaveBeenCalledWith({
        email: "vendor@example.com",
        role: "external",
      });
    });
    await expect(
      screen.findByText("Invitation sent to vendor@example.com.")
    ).resolves.toBeInTheDocument();
  }, 10_000);

  it("resends pending invitations from the pending list", async () => {
    mockedListInvitations.mockResolvedValueOnce(
      createInvitationList([
        createInvitation({
          role: "admin",
        }),
      ])
    );

    const user = userEvent.setup();

    render(<OrganizationMembersPage activeOrganizationId={organizationId} />);

    await expect(
      screen.findByTitle("pending@example.com")
    ).resolves.toBeVisible();

    await user.click(
      screen.getByRole("button", {
        name: "Invitation actions for pending@example.com",
      })
    );
    await user.click(
      await screen.findByRole("menuitem", { name: "Resend invitation" })
    );

    await waitFor(() => {
      expect(mockedInviteMember).toHaveBeenCalledWith({
        email: "pending@example.com",
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
    mockedInviteMember.mockRejectedValue(
      createApiError({
        message: "Invitation email failed",
        status: 500,
        statusText: "Internal Server Error",
      })
    );

    const user = userEvent.setup();

    render(<OrganizationMembersPage activeOrganizationId={organizationId} />);

    await expect(
      screen.findByTitle("pending@example.com")
    ).resolves.toBeVisible();

    await user.click(
      screen.getByRole("button", {
        name: "Invitation actions for pending@example.com",
      })
    );
    await user.click(
      await screen.findByRole("menuitem", { name: "Resend invitation" })
    );

    await expect(
      screen.findByText("We couldn't update that invitation. Please try again.")
    ).resolves.toBeInTheDocument();
    expect(screen.getByTitle("pending@example.com")).toBeVisible();
  }, 10_000);

  it("shows email-verification copy when pending invitation resend is blocked", async () => {
    mockedInviteMember.mockRejectedValue(
      createApiError({
        code: "EMAIL_NOT_VERIFIED",
        message: "Verify your email before inviting organization members.",
        status: 403,
        statusText: "Forbidden",
      })
    );

    const user = userEvent.setup();

    render(<OrganizationMembersPage activeOrganizationId={organizationId} />);

    await expect(
      screen.findByTitle("pending@example.com")
    ).resolves.toBeVisible();

    await user.click(
      screen.getByRole("button", {
        name: "Invitation actions for pending@example.com",
      })
    );
    await user.click(
      await screen.findByRole("menuitem", { name: "Resend invitation" })
    );

    await expect(
      screen.findByText(
        "Verify your email before inviting teammates. Check your inbox, then try again."
      )
    ).resolves.toBeInTheDocument();
    expect(screen.getByTitle("pending@example.com")).toBeVisible();
  }, 10_000);

  it("cancels pending invitations from the pending list", async () => {
    mockedListInvitations.mockResolvedValueOnce(createInvitationList());

    const user = userEvent.setup();

    render(<OrganizationMembersPage activeOrganizationId={organizationId} />);

    await expect(
      screen.findByTitle("pending@example.com")
    ).resolves.toBeVisible();

    await user.click(
      screen.getByRole("button", {
        name: "Invitation actions for pending@example.com",
      })
    );
    await user.click(
      await screen.findByRole("menuitem", { name: "Cancel invitation" })
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
    mockedCancelInvitation.mockRejectedValue(
      createApiError({
        message: "Forbidden",
        status: 403,
        statusText: "Forbidden",
      })
    );

    const user = userEvent.setup();

    render(<OrganizationMembersPage activeOrganizationId={organizationId} />);

    await expect(
      screen.findByTitle("pending@example.com")
    ).resolves.toBeVisible();

    await user.click(
      screen.getByRole("button", {
        name: "Invitation actions for pending@example.com",
      })
    );
    await user.click(
      await screen.findByRole("menuitem", { name: "Cancel invitation" })
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
        <OrganizationMembersPage
          activeOrganizationId={organizationId}
          currentUserId={currentUserId}
        />
      </HotkeysProvider>
    );

    await expect(
      screen.findByText("pending@example.com")
    ).resolves.toBeVisible();

    rerender(
      <HotkeysProvider>
        <OrganizationMembersPage
          activeOrganizationId={organizationId}
          currentUserId={currentUserId}
        />
        <ShortcutHelpOverlay activeScopes={["members"]} />
      </HotkeysProvider>
    );

    await user.click(
      screen.getByRole("button", { name: /keyboard shortcuts/i })
    );

    const dialog = await screen.findByRole("dialog", {
      name: /keyboard shortcuts/i,
    });

    expect(within(dialog).getByText("Invite teammate")).toBeVisible();
    expect(within(dialog).getByText("Submit invite form")).toBeVisible();
    expect(within(dialog).getByText("Focus invite role select")).toBeVisible();
  }, 10_000);

  it("shows a safe error when an invite fails", async () => {
    mockedInviteMember.mockRejectedValue(
      createApiError({
        message: "You are not allowed to invite members",
        status: 403,
        statusText: "Forbidden",
      })
    );

    const user = userEvent.setup();

    render(
      <OrganizationMembersPage
        activeOrganizationId={organizationId}
        currentUserId={currentUserId}
      />
    );

    const dialog = await openInviteDialog(user);

    await user.type(
      within(dialog).getByLabelText("Email"),
      "member@example.com"
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Send invite" })
    );

    await expect(
      screen.findByText(
        "We couldn't send that invitation. Please check the details and try again."
      )
    ).resolves.toBeInTheDocument();
  }, 10_000);

  it("shows targeted email verification copy when inviting requires verification", async () => {
    mockedInviteMember.mockRejectedValue(
      createApiError({
        code: "EMAIL_NOT_VERIFIED",
        message: "Verify your email before inviting organization members.",
        status: 403,
        statusText: "Forbidden",
      })
    );

    const user = userEvent.setup();

    render(
      <OrganizationMembersPage
        activeOrganizationId={organizationId}
        currentUserId={currentUserId}
      />
    );

    const dialog = await openInviteDialog(user);

    await user.type(
      within(dialog).getByLabelText("Email"),
      "member@example.com"
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Send invite" })
    );

    await expect(
      screen.findByText(
        "Verify your email before inviting teammates. Check your inbox, then try again."
      )
    ).resolves.toBeInTheDocument();
  }, 10_000);

  it("shows a load error instead of an empty-state fallback when invitation loading fails", async () => {
    mockedListInvitations.mockRejectedValue(
      createApiError({
        message: "Forbidden",
        status: 403,
        statusText: "Forbidden",
      })
    );

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

  it("clears stale pending invitations while another organization loads", async () => {
    const orgTwoInvitations = createDeferredResult<ListInvitationsResult>();

    mockedListInvitations
      .mockResolvedValueOnce(
        createInvitationList([
          createInvitation({
            email: "old-org@example.com",
            id: "inv_old",
          }),
        ])
      )
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

    orgTwoInvitations.resolve(
      createInvitationList([
        createInvitation({
          email: "new-org@example.com",
          id: "inv_new",
          role: "admin",
        }),
      ])
    );

    await expect(
      screen.findByText("new-org@example.com")
    ).resolves.toBeVisible();
  }, 10_000);

  it("hides the pending invitations section when there are no pending invitations", async () => {
    mockedListInvitations.mockResolvedValue(createInvitationList([]));

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
