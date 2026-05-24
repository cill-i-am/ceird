import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { authClient as AuthClient } from "#/lib/auth-client";

import { OrganizationOnboardingPage } from "./organization-onboarding-page";

type InviteMemberInput = Parameters<
  typeof AuthClient.organization.inviteMember
>[0];

const {
  mockedClearAppContextClientCache,
  mockedCreateOrganization,
  mockedInviteMember,
  mockedNavigate,
  mockedToastSuccess,
} = vi.hoisted(() => ({
  mockedClearAppContextClientCache: vi.fn<() => void>(),
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
  mockedToastSuccess:
    vi.fn<(title: string, options: { description: string }) => void>(),
}));

vi.mock(import("@tanstack/react-router"), async (importActual) => {
  const actual = await importActual();

  return {
    ...actual,
    useNavigate: (() => mockedNavigate) as typeof actual.useNavigate,
  };
});

vi.mock(
  import("../auth/app-context-client-cache-state"),
  async (importActual) => {
    const actual = await importActual();

    return {
      ...actual,
      clearAppContextClientCache:
        mockedClearAppContextClientCache as typeof actual.clearAppContextClientCache,
    };
  }
);

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

vi.mock(import("sonner"), async (importActual) => {
  const actual = await importActual();

  return {
    ...actual,
    toast: Object.assign(vi.fn(), actual.toast, {
      success: mockedToastSuccess,
    }),
  };
});

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
    mockedToastSuccess.mockClear();
    mockedClearAppContextClientCache.mockClear();
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
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
    const initialProgress = screen.getByRole("navigation", {
      name: /Workspace setup progress/,
    });
    expect(
      within(initialProgress).getByText("Step 1 of 2")
    ).toBeInTheDocument();
    expect(
      within(initialProgress).getByTitle("Current: Create team")
    ).toBeInTheDocument();
    expect(
      within(initialProgress).getByTitle("Current: Create team")
    ).toHaveClass("bg-primary/15", "text-primary", "ring-primary/35");
    expect(
      within(initialProgress)
        .getByTitle("Current: Create team")
        .querySelector(".bg-primary")
    ).not.toBeNull();
    expect(
      initialProgress.querySelector('[data-slot="workspace-setup-connector"]')
    ).toHaveClass(
      "[background:linear-gradient(90deg,color-mix(in_oklab,var(--primary)_58%,var(--border))_0_48%,var(--border)_52%_100%)]"
    );
    expect(
      within(initialProgress).getByTitle("Optional: Invite members")
    ).toBeInTheDocument();
    expect(
      screen.queryByLabelText("Organization slug")
    ).not.toBeInTheDocument();
    await user.type(screen.getByLabelText("Team name"), "Acme Field Ops");
    await user.click(screen.getByRole("button", { name: "Create team" }));

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
    expect(mockedClearAppContextClientCache).toHaveBeenCalledOnce();
    const inviteProgress = screen.getByRole("navigation", {
      name: /Workspace setup progress/,
    });
    expect(within(inviteProgress).getByText("Step 2 of 2")).toBeInTheDocument();
    expect(
      within(inviteProgress).getByTitle("Complete: Create team")
    ).toBeInTheDocument();
    expect(
      within(inviteProgress).getByTitle("Current: Invite members")
    ).toBeInTheDocument();
    expect(
      within(inviteProgress).getByTitle("Current: Invite members")
    ).toHaveClass("bg-primary/15", "text-primary", "ring-primary/35");
    expect(
      within(inviteProgress)
        .getByTitle("Current: Invite members")
        .querySelector(".bg-primary")
    ).not.toBeNull();
    expect(mockedNavigate).not.toHaveBeenCalled();
  }, 10_000);

  it("keeps the generated slug hidden while the team name changes", async () => {
    const user = userEvent.setup();

    render(<OrganizationOnboardingPage />);

    await user.type(screen.getByLabelText("Team name"), "Acme Field Ops Ltd");
    expect(
      screen.queryByLabelText("Organization slug")
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Create team" }));

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
    await user.click(screen.getByRole("button", { name: "Create team" }));
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
    await waitFor(() => {
      expect(mockedToastSuccess).toHaveBeenCalledWith("Invite sent", {
        description: "foreman@example.com will receive an email shortly.",
      });
    });
    expect(
      screen.queryByText("Invitation sent to foreman@example.com.")
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Workspace ready")).not.toBeInTheDocument();
    const inviteProgress = screen.getByRole("navigation", {
      name: /Workspace setup progress/,
    });
    expect(within(inviteProgress).getByText("Step 2 of 2")).toBeInTheDocument();
    expect(
      within(inviteProgress).getByTitle("Complete: Create team")
    ).toBeInTheDocument();
    expect(
      within(inviteProgress).getByTitle("Current: Invite members")
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Send another invite" })
    ).toHaveClass("bg-secondary");
    expect(
      screen.getByRole("button", { name: "Continue to Ceird" })
    ).toHaveClass("bg-primary");

    await user.click(screen.getByRole("button", { name: "Continue to Ceird" }));
    await waitFor(() => {
      expect(mockedNavigate).toHaveBeenCalledWith({
        to: "/",
      });
    });
  }, 10_000);

  it("keeps the successful invite sending state visible for a short beat", async () => {
    const user = userEvent.setup();

    render(<OrganizationOnboardingPage />);

    await user.type(screen.getByLabelText("Team name"), "Acme Field Ops");
    await user.click(screen.getByRole("button", { name: "Create team" }));
    await screen.findByRole("heading", { name: "Invite members" });

    await user.type(screen.getByLabelText("Email"), "foreman@example.com");
    vi.useFakeTimers();
    fireEvent.click(screen.getByRole("button", { name: "Send invite" }));

    expect(
      screen.getByRole("button", { name: "Sending invite..." })
    ).toBeInTheDocument();
    expect(mockedToastSuccess).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(499);
    });

    expect(
      screen.getByRole("button", { name: "Sending invite..." })
    ).toBeInTheDocument();
    expect(mockedToastSuccess).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
      await Promise.resolve();
    });

    expect(mockedToastSuccess).toHaveBeenCalledWith("Invite sent", {
      description: "foreman@example.com will receive an email shortly.",
    });
    expect(
      screen.getByRole("button", { name: "Send another invite" })
    ).toBeInTheDocument();
  }, 10_000);

  it("allows skipping invites after the team is created", async () => {
    const user = userEvent.setup();

    render(<OrganizationOnboardingPage />);

    await user.type(screen.getByLabelText("Team name"), "Acme Field Ops");
    await user.click(screen.getByRole("button", { name: "Create team" }));
    await screen.findByRole("heading", { name: "Invite members" });
    expect(screen.getByRole("button", { name: "Skip for now" })).toHaveClass(
      "min-h-11"
    );
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
    await user.click(screen.getByRole("button", { name: "Create team" }));
    await screen.findByRole("heading", { name: "Invite members" });

    await user.type(screen.getByLabelText("Email"), "foreman@example.com");
    vi.useFakeTimers();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /send invite/i }));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(
      screen.getByText(
        "We couldn't send that invitation. Please check the email and try again."
      )
    ).toBeInTheDocument();
  }, 10_000);

  it("shows an inline error when org creation fails", async () => {
    mockedCreateOrganization.mockRejectedValue(new Error("Create failed"));

    const user = userEvent.setup();

    render(<OrganizationOnboardingPage />);

    await user.type(screen.getByLabelText("Team name"), "Acme Field Ops");
    await user.click(screen.getByRole("button", { name: "Create team" }));

    await expect(
      screen.findByText("We couldn't create your team. Please try again.")
    ).resolves.toBeInTheDocument();
  }, 10_000);
});
