import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";

import type { authClient as AuthClient } from "#/lib/auth-client";

import type * as SignOutModule from "../auth/sign-out";
import { AcceptInvitationPage } from "./accept-invitation-page";

const {
  mockedAcceptInvitation,
  mockedGetInvitation,
  mockedGetSession,
  mockedNavigate,
  mockedSignOut,
} = vi.hoisted(() => ({
  mockedAcceptInvitation: vi.fn<
    (input: { invitationId: string }) => Promise<{
      data: {
        invitation: {
          id: string;
          status: string;
        };
      } | null;
      error: {
        message: string;
        status: number;
        statusText: string;
      } | null;
    }>
  >(),
  mockedGetInvitation: vi.fn<
    (input: { query: { id: string } }) => Promise<{
      data: {
        email: string;
        id: string;
        inviterEmail: string;
        organizationName: string;
        role: string;
      } | null;
      error: {
        message: string;
        status: number;
        statusText: string;
      } | null;
    }>
  >(),
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
  mockedSignOut: vi.fn<typeof SignOutModule.signOut>(),
}));

vi.mock(import("@tanstack/react-router"), async (importActual) => {
  const actual = await importActual();

  return {
    ...actual,
    Link: (({
      children,
      search,
      to,
      ...props
    }: ComponentProps<"a"> & {
      search?: Record<string, string | undefined>;
      to?: string;
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
    }) as typeof actual.Link,
    useNavigate: (() => mockedNavigate) as typeof actual.useNavigate,
  };
});

vi.mock(import("#/lib/auth-client"), () => ({
  authClient: {
    getSession: mockedGetSession,
    organization: {
      acceptInvitation: mockedAcceptInvitation,
      getInvitation: mockedGetInvitation,
    },
  } as unknown as typeof AuthClient,
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
      },
      error: null,
    });
    mockedGetInvitation.mockResolvedValue({
      data: {
        email: "member@example.com",
        id: "inv_123",
        inviterEmail: "owner@example.com",
        organizationName: "Acme Field Ops",
        role: "member",
      },
      error: null,
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
    expect(mockedGetInvitation).toHaveBeenCalledWith({
      query: {
        id: "inv_123",
      },
    });
    const contextColumn = await screen.findByLabelText("Auth context column");
    expect(
      within(contextColumn).getByText("Acme Field Ops")
    ).toBeInTheDocument();
    expect(
      within(contextColumn).getByText("member@example.com")
    ).toBeInTheDocument();
    expect(within(contextColumn).getByText("member")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute(
      "href",
      "/login?invitation=inv_123"
    );
    expect(
      screen.getByRole("link", { name: "Create account" })
    ).toHaveAttribute("href", "/signup?invitation=inv_123");
    expect(
      screen.queryByText(
        "member@example.com will join Acme Field Ops as member."
      )
    ).not.toBeInTheDocument();
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
    const contextColumn = await screen.findByLabelText("Auth context column");
    expect(
      within(contextColumn).getByText("owner@example.com")
    ).toBeInTheDocument();
    expect(
      within(contextColumn).getByText("member@example.com")
    ).toBeInTheDocument();
    expect(within(contextColumn).getByText("member")).toBeInTheDocument();
    expect(
      screen.queryByText(
        "member@example.com will join Acme Field Ops as member."
      )
    ).not.toBeInTheDocument();
  }, 10_000);

  it("accepts the invitation and returns to the app", async () => {
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
      expect(mockedNavigate).toHaveBeenCalledWith({
        to: "/",
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
      });
    });
  }, 10_000);
});
