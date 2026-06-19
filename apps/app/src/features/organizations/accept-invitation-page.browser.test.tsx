import type { PublicInvitationPreview } from "@ceird/identity-core";
import type * as RouterModule from "@tanstack/react-router";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";

import type * as AppContextClientCacheModule from "#/features/auth/app-context-client-cache";
import type * as AppContextClientCacheStateModule from "#/features/auth/app-context-client-cache-state";
import type { authClient as AuthClient } from "#/lib/auth-client";

import type * as SignOutModule from "../auth/sign-out";
import { AcceptInvitationPage } from "./accept-invitation-page";

const {
  mockedAcceptInvitation,
  mockedClearAppContextClientCache,
  mockedGetInvitation,
  mockedGetPublicInvitationPreview,
  mockedGetSession,
  mockedNavigate,
  mockedSetActiveOrganization,
  mockedSignOut,
} = vi.hoisted(() => ({
  mockedAcceptInvitation: vi.fn<
    (input: { invitationId: string }) => Promise<{
      data: {
        invitation: {
          id: string;
          status: string;
        };
        member: {
          organizationId: string;
        };
      } | null;
      error: {
        message: string;
        status: number;
        statusText: string;
      } | null;
    }>
  >(),
  mockedClearAppContextClientCache: vi.fn<() => void>(),
  mockedGetInvitation: vi.fn<
    (input: { query: { id: string } }) => Promise<{
      data: unknown | null;
      error: {
        message: string;
        status: number;
        statusText: string;
      } | null;
    }>
  >(),
  mockedGetPublicInvitationPreview:
    vi.fn<(invitationId: string) => Promise<PublicInvitationPreview | null>>(),
  mockedGetSession: vi.fn<
    () => Promise<{
      data: {
        session: {
          id: string;
        };
        user: {
          email: string;
        };
      } | null;
      error: null;
    }>
  >(),
  mockedNavigate:
    vi.fn<
      (options: {
        search?: { invitation?: string };
        to: string;
      }) => Promise<void>
    >(),
  mockedSetActiveOrganization: vi.fn<
    (input: { organizationId: string }) => Promise<{
      data: unknown;
      error: {
        message: string;
        status: number;
        statusText: string;
      } | null;
    }>
  >(),
  mockedSignOut: vi.fn<typeof SignOutModule.signOut>(),
}));

const nativeInvitationDetails = {
  createdAt: new Date("2026-04-01T09:30:00.000Z"),
  email: "member@example.com",
  expiresAt: new Date("2026-04-12T09:30:00.000Z"),
  id: "inv_123",
  inviterEmail: "owner@example.com",
  inviterId: "user_owner",
  organizationId: "org_123",
  organizationName: "Acme Field Ops",
  organizationSlug: "acme-field-ops",
  role: "member",
  status: "pending",
};

vi.mock(import("../auth/app-context-client-cache"), () => ({
  getCachedClientAppContext: vi.fn<
    typeof AppContextClientCacheModule.getCachedClientAppContext
  >(() =>
    (async () => {
      const sessionResponse = await mockedGetSession();

      return {
        activeOrganizationId: null,
        currentOrganizationRole: undefined,
        organizations: undefined,
        session: sessionResponse.data,
      } as unknown as Awaited<
        ReturnType<typeof AppContextClientCacheModule.getCachedClientAppContext>
      >;
    })()
  ),
  readFreshCachedClientAppContext:
    vi.fn<typeof AppContextClientCacheModule.readFreshCachedClientAppContext>(),
}));

vi.mock(import("../auth/app-context-client-cache-state"), () => ({
  clearAppContextClientCache: mockedClearAppContextClientCache,
  clearAppContextClientCacheForPromise:
    vi.fn<
      typeof AppContextClientCacheStateModule.clearAppContextClientCacheForPromise
    >(),
  readFreshAppContextClientCache:
    vi.fn<
      typeof AppContextClientCacheStateModule.readFreshAppContextClientCache
    >(),
  setAppContextClientCache:
    vi.fn<typeof AppContextClientCacheStateModule.setAppContextClientCache>(),
}));

vi.mock(import("@tanstack/react-router"), () => ({
  Link: (({
    children,
    search,
    to,
    viewTransition: _viewTransition,
    ...props
  }: ComponentProps<"a"> & {
    search?: Record<string, string | undefined>;
    to?: string;
    viewTransition?: unknown;
  }) => {
    const { href: initialHref } = props;
    let href = initialHref;

    if (typeof to === "string") {
      href = search?.invitation
        ? `${to}?invitation=${encodeURIComponent(search.invitation)}`
        : to;
    }

    return (
      <a href={href} {...props}>
        {children}
      </a>
    );
  }) as typeof RouterModule.Link,
  useNavigate: (() => mockedNavigate) as typeof RouterModule.useNavigate,
}));

vi.mock(import("#/lib/auth-client"), () => ({
  authClient: {
    getSession: mockedGetSession,
    organization: {
      acceptInvitation: mockedAcceptInvitation,
      getInvitation: mockedGetInvitation,
      setActive: mockedSetActiveOrganization,
    },
  } as unknown as typeof AuthClient,
  getPublicInvitationPreview: mockedGetPublicInvitationPreview,
}));

vi.mock(import("../auth/sign-out"), () => ({
  signOut: mockedSignOut as typeof SignOutModule.signOut,
}));

vi.mock(import("../auth/hard-redirect-to-login"), () => ({
  hardRedirectToLogin: vi.fn<() => boolean>(() => true),
}));

describe("accept invitation page", () => {
  beforeEach(() => {
    mockedNavigate.mockResolvedValue();
    mockedAcceptInvitation.mockResolvedValue({
      data: {
        invitation: {
          id: "inv_123",
          status: "accepted",
        },
        member: {
          organizationId: "org_123",
        },
      },
      error: null,
    });
    mockedSetActiveOrganization.mockResolvedValue({
      data: {
        id: "org_123",
      },
      error: null,
    });
    mockedGetInvitation.mockResolvedValue({
      data: nativeInvitationDetails,
      error: null,
    });
    mockedGetPublicInvitationPreview.mockResolvedValue({
      email: "m***@e***.com",
      organizationName: "Acme Field Ops",
      role: "member",
    });
    mockedGetSession.mockResolvedValue({
      data: null,
      error: null,
    });
    mockedSignOut.mockResolvedValue({
      data: {
        success: true,
      },
      error: null,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("offers sign-in and sign-up continuation links to signed-out users", async () => {
    render(<AcceptInvitationPage invitationId="inv_123" />);

    await expect(
      screen.findByRole("heading", { name: "Join Acme Field Ops" })
    ).resolves.toBeInTheDocument();
    expect(mockedGetPublicInvitationPreview).toHaveBeenCalledWith("inv_123");
    expect(mockedGetInvitation).not.toHaveBeenCalled();
    const contextColumn = await screen.findByLabelText("Auth context column");
    expect(
      within(contextColumn).getByText("Acme Field Ops")
    ).toBeInTheDocument();
    expect(
      within(contextColumn).getByText("m***@e***.com")
    ).toBeInTheDocument();
    expect(within(contextColumn).getByText("Member")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute(
      "href",
      "/login?invitation=inv_123"
    );
    expect(
      screen.getByRole("link", { name: "Create account" })
    ).toHaveAttribute("href", "/signup?invitation=inv_123");
    expect(
      screen.queryByRole("button", { name: "Accept invitation" })
    ).not.toBeInTheDocument();
    expect(screen.queryByText("owner@example.com")).not.toBeInTheDocument();
  }, 10_000);

  it("falls back to generic signed-out copy when the public preview lookup fails", async () => {
    mockedGetPublicInvitationPreview.mockRejectedValue(
      new Error("preview unavailable")
    );

    render(<AcceptInvitationPage invitationId="inv_123" />);

    await expect(
      screen.findByRole("heading", {
        name: "Sign in to continue",
      })
    ).resolves.toBeInTheDocument();
    expect(screen.getByLabelText("Auth context column")).toBeInTheDocument();
    expect(
      document.querySelector('[data-slot="entry-product-headline"]')
    ).toHaveTextContent("Run your work. Together.");
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.queryByText("Acme Field Ops")).not.toBeInTheDocument();
    expect(mockedGetInvitation).not.toHaveBeenCalled();
  }, 10_000);

  it("shows invitation details for the authenticated recipient", async () => {
    mockedGetSession.mockResolvedValue({
      data: {
        session: {
          id: "session_123",
        },
        user: {
          email: "member@example.com",
        },
      },
      error: null,
    });

    render(<AcceptInvitationPage invitationId="inv_123" />);

    await expect(
      screen.findByText("Join Acme Field Ops")
    ).resolves.toBeInTheDocument();
    expect(mockedGetInvitation).toHaveBeenCalledWith({
      query: {
        id: "inv_123",
      },
    });
    expect(mockedGetPublicInvitationPreview).not.toHaveBeenCalled();
    const contextColumn = await screen.findByLabelText("Auth context column");
    expect(
      within(contextColumn).getByText("owner@example.com")
    ).toBeInTheDocument();
    expect(
      within(contextColumn).getByText("member@example.com")
    ).toBeInTheDocument();
    expect(within(contextColumn).getByText("Member")).toBeInTheDocument();
    expect(
      within(contextColumn).getByText("Acme Field Ops")
    ).toBeInTheDocument();
  }, 10_000);

  it("rejects unmodeled signed-in invitation details", async () => {
    mockedGetSession.mockResolvedValue({
      data: {
        session: {
          id: "session_123",
        },
        user: {
          email: "member@example.com",
        },
      },
      error: null,
    });
    mockedGetInvitation.mockResolvedValue({
      data: {
        ...nativeInvitationDetails,
        unmodeledBetterAuthField: "raw",
      },
      error: null,
    });

    render(<AcceptInvitationPage invitationId="inv_123" />);

    await expect(
      screen.findByText(
        "This invitation is unavailable. Sign in with the invited email address or ask for a fresh invite."
      )
    ).resolves.toBeInTheDocument();
    expect(screen.queryByText("owner@example.com")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Accept invitation" })
    ).not.toBeInTheDocument();
  }, 10_000);

  it("accepts the invitation and continues to location onboarding", async () => {
    mockedGetSession.mockResolvedValue({
      data: {
        session: {
          id: "session_123",
        },
        user: {
          email: "member@example.com",
        },
      },
      error: null,
    });

    const user = userEvent.setup();

    render(<AcceptInvitationPage invitationId="inv_123" />);

    await user.click(
      await screen.findByRole("button", { name: "Accept invitation" })
    );

    await waitFor(() => {
      expect(mockedAcceptInvitation).toHaveBeenCalledWith({
        invitationId: "inv_123",
      });
    });
    await waitFor(() => {
      expect(mockedSetActiveOrganization).toHaveBeenCalledWith({
        organizationId: "org_123",
      });
    });
    await waitFor(() => {
      expect(mockedNavigate).toHaveBeenCalledWith({
        to: "/location-access",
      });
    });
    expect(mockedClearAppContextClientCache).toHaveBeenCalledOnce();
    const [setActiveOrganizationCallOrder] =
      mockedSetActiveOrganization.mock.invocationCallOrder;
    const [navigateCallOrder] = mockedNavigate.mock.invocationCallOrder;

    if (
      setActiveOrganizationCallOrder === undefined ||
      navigateCallOrder === undefined
    ) {
      throw new Error("Expected organization activation before navigation");
    }

    expect(setActiveOrganizationCallOrder).toBeLessThan(navigateCallOrder);
  }, 10_000);

  it("accepts with the public preview when authenticated invitation details are temporarily unavailable", async () => {
    mockedGetSession.mockResolvedValue({
      data: {
        session: {
          id: "session_123",
        },
        user: {
          email: "member@example.com",
        },
      },
      error: null,
    });
    mockedGetInvitation.mockResolvedValue({
      data: null,
      error: {
        message: "Invitation lookup unavailable",
        status: 500,
        statusText: "Internal Server Error",
      },
    });

    const user = userEvent.setup();

    render(<AcceptInvitationPage invitationId="inv_123" />);

    await expect(
      screen.findByRole("heading", { name: "Join Acme Field Ops" })
    ).resolves.toBeInTheDocument();
    expect(mockedGetPublicInvitationPreview).toHaveBeenCalledWith("inv_123");

    await user.click(
      await screen.findByRole("button", { name: "Accept invitation" })
    );

    await waitFor(() => {
      expect(mockedAcceptInvitation).toHaveBeenCalledWith({
        invitationId: "inv_123",
      });
    });
    await waitFor(() => {
      expect(mockedNavigate).toHaveBeenCalledWith({
        to: "/location-access",
      });
    });
  }, 10_000);

  it("keeps the invitation details visible when acceptance fails", async () => {
    mockedGetSession.mockResolvedValue({
      data: {
        session: {
          id: "session_123",
        },
        user: {
          email: "member@example.com",
        },
      },
      error: null,
    });
    mockedAcceptInvitation.mockResolvedValue({
      data: null,
      error: {
        message: "Invitation expired",
        status: 400,
        statusText: "Bad Request",
      },
    });

    const user = userEvent.setup();

    render(<AcceptInvitationPage invitationId="inv_123" />);

    await user.click(
      await screen.findByRole("button", { name: "Accept invitation" })
    );

    await expect(
      screen.findByText("We couldn't accept this invitation. Please try again.")
    ).resolves.toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Join Acme Field Ops" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Accept invitation" })
    ).toBeEnabled();
  }, 10_000);

  it("shows membership-limit copy when the organization is full", async () => {
    mockedGetSession.mockResolvedValue({
      data: {
        session: {
          id: "session_123",
        },
        user: {
          email: "member@example.com",
        },
      },
      error: null,
    });
    mockedAcceptInvitation.mockResolvedValue({
      data: null,
      error: {
        message: "Organization membership limit reached",
        status: 403,
        statusText: "Forbidden",
      },
    });

    const user = userEvent.setup();

    render(<AcceptInvitationPage invitationId="inv_123" />);

    await user.click(
      await screen.findByRole("button", { name: "Accept invitation" })
    );

    await expect(
      screen.findByText(
        "This team has reached the 200-member limit. Remove a member before adding someone new."
      )
    ).resolves.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Accept invitation" })
    ).toBeEnabled();
  }, 10_000);

  it("clears organization caches when acceptance succeeds but activation fails", async () => {
    mockedGetSession.mockResolvedValue({
      data: {
        session: {
          id: "session_123",
        },
        user: {
          email: "member@example.com",
        },
      },
      error: null,
    });
    mockedSetActiveOrganization.mockResolvedValue({
      data: null,
      error: {
        message: "Could not activate organization",
        status: 500,
        statusText: "Internal Server Error",
      },
    });

    const user = userEvent.setup();

    render(<AcceptInvitationPage invitationId="inv_123" />);

    await user.click(
      await screen.findByRole("button", { name: "Accept invitation" })
    );

    await waitFor(() => {
      expect(mockedAcceptInvitation).toHaveBeenCalledWith({
        invitationId: "inv_123",
      });
    });
    await waitFor(() => {
      expect(mockedSetActiveOrganization).toHaveBeenCalledWith({
        organizationId: "org_123",
      });
    });

    expect(mockedClearAppContextClientCache).toHaveBeenCalledOnce();
    expect(mockedNavigate).not.toHaveBeenCalled();
    expect(
      screen.getByText("We couldn't accept this invitation. Please try again.")
    ).toBeInTheDocument();
  }, 10_000);

  it("lets the user sign out and retry with another account when lookup is denied", async () => {
    mockedGetSession.mockResolvedValue({
      data: {
        session: {
          id: "session_123",
        },
        user: {
          email: "wrong-account@example.com",
        },
      },
      error: null,
    });
    mockedGetInvitation.mockResolvedValue({
      data: null,
      error: {
        message: "Forbidden",
        status: 403,
        statusText: "Forbidden",
      },
    });

    const user = userEvent.setup();

    render(<AcceptInvitationPage invitationId="inv_123" />);

    await user.click(
      await screen.findByRole("button", {
        name: "Sign out and try another account",
      })
    );

    await waitFor(() => {
      expect(mockedSignOut).toHaveBeenCalledOnce();
    });
    await waitFor(() => {
      expect(mockedNavigate).toHaveBeenCalledWith({
        search: {
          invitation: "inv_123",
        },
        to: "/login",
        viewTransition: {
          types: ["auth-card"],
        },
      });
    });
  }, 10_000);
});
