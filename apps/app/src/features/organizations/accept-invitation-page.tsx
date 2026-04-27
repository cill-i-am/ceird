import { Link, useNavigate } from "@tanstack/react-router";
import { decodeOrganizationRole } from "@task-tracker/identity-core";
import type { OrganizationRole } from "@task-tracker/identity-core";
import * as React from "react";

import { Alert, AlertDescription } from "#/components/ui/alert";
import { Button, buttonVariants } from "#/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "#/components/ui/empty";
import { authClient, getPublicInvitationPreview } from "#/lib/auth-client";

import {
  getLoginNavigationTarget,
  getSignupNavigationTarget,
} from "../auth/auth-navigation";
import { EntryShell, EntrySurfaceCard } from "../auth/entry-shell";
import { hardRedirectToLogin } from "../auth/hard-redirect-to-login";
import { signOut } from "../auth/sign-out";

interface InvitationPreviewDetails {
  readonly email: string;
  readonly organizationName: string;
  readonly role: OrganizationRole;
}

interface InvitationDetails extends InvitationPreviewDetails {
  readonly id: string;
  readonly inviterEmail: string;
}

type InvitationPageState =
  | {
      readonly status: "loading";
    }
  | {
      readonly invitation?: InvitationPreviewDetails;
      readonly status: "signed-out";
    }
  | {
      readonly invitation: InvitationDetails;
      readonly status: "ready";
    }
  | {
      readonly invitation: InvitationDetails;
      readonly status: "submitting";
    }
  | {
      readonly canSwitchAccount?: boolean;
      readonly message: string;
      readonly status: "error";
      readonly invitation?: InvitationDetails;
    }
  | {
      readonly message: string;
      readonly status: "switching-account";
    };

const INVITATION_LOOKUP_ERROR_MESSAGE =
  "This invitation is unavailable. Sign in with the invited email address or ask for a fresh invite.";
const INVITATION_ACCEPT_ERROR_MESSAGE =
  "We couldn't accept this invitation. Please try again.";

function getInvitationShellCopy(
  state: InvitationPageState,
  invitation?: InvitationPreviewDetails | InvitationDetails
) {
  if (invitation) {
    return {
      title: `Join ${invitation.organizationName}`,
      description: `Continue with ${invitation.email} to join ${invitation.organizationName} as ${invitation.role}.`,
    };
  }

  if (state.status === "signed-out") {
    return {
      title: "Continue with the invited account.",
      description:
        "Sign in or create an account to continue into the workspace with the correct email.",
    };
  }

  return {
    title: "Review your organization invitation.",
    description:
      "We'll check the invitation and help you continue with the right account.",
  };
}

function getInvitationCardCopy(
  state: InvitationPageState,
  invitation?: InvitationPreviewDetails | InvitationDetails
) {
  if (state.status === "signed-out") {
    return {
      badge: "Sign in required",
      title: "Sign in to continue",
      description: invitation
        ? "Continue with the invited email address to accept this invitation."
        : "Continue with the invited email address to review this workspace invitation.",
    };
  }

  if (state.status === "loading") {
    return {
      badge: "Checking invitation",
      title: "Checking invitation",
      description: "We'll prepare the invitation details in a moment.",
    };
  }

  if (invitation) {
    return {
      badge: "Ready to join",
      title: "Accept invitation",
      description: "Review the invitation details, then join the organization.",
    };
  }

  return {
    badge: "Invitation issue",
    title: "Invitation issue",
    description: "We couldn't prepare this invitation yet.",
  };
}

function InvitationContextContent({
  invitation,
  signedOut = false,
}: {
  readonly invitation?: InvitationPreviewDetails | InvitationDetails;
  readonly signedOut?: boolean;
}) {
  if (!invitation) {
    return (
      <div className="flex flex-col gap-8">
        <div className="space-y-3">
          <p className="text-xs font-medium tracking-[0.18em] text-muted-foreground uppercase">
            Continue the invitation
          </p>
          <p className="max-w-[48ch] text-sm/7 text-foreground/90">
            Use the invited account to review this workspace invitation. If
            you&rsquo;re in the wrong account, sign out and switch before you
            continue.
          </p>
        </div>

        <ol className="grid gap-4 text-sm/6 text-muted-foreground">
          <li className="border-t border-border/60 pt-4">
            1. Sign in or create the invited account.
          </li>
          <li className="border-t border-border/60 pt-4">
            2. Return here and review the invitation details.
          </li>
          <li className="border-t border-border/60 pt-4">
            3. Accept the invitation to enter the workspace.
          </li>
        </ol>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="space-y-3">
        <p className="text-xs font-medium tracking-[0.18em] text-muted-foreground uppercase">
          Invitation details
        </p>
        <p className="max-w-[48ch] text-sm/7 text-foreground/90">
          {signedOut
            ? `Sign in with ${invitation.email} to join ${invitation.organizationName}.`
            : `This invitation will add ${invitation.email} to ${invitation.organizationName}. Accept it from the invited account to keep the membership handoff clean.`}
        </p>
      </div>

      <dl className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-1 border-t border-border/60 pt-4">
          <dt className="text-xs font-medium tracking-[0.18em] text-muted-foreground uppercase">
            Organization
          </dt>
          <dd className="text-sm/6 text-muted-foreground">
            {invitation.organizationName}
          </dd>
        </div>

        <div className="space-y-1 border-t border-border/60 pt-4">
          <dt className="text-xs font-medium tracking-[0.18em] text-muted-foreground uppercase">
            Invited email
          </dt>
          <dd className="text-sm/6 text-muted-foreground">
            {invitation.email}
          </dd>
        </div>

        <div className="space-y-1 border-t border-border/60 pt-4">
          <dt className="text-xs font-medium tracking-[0.18em] text-muted-foreground uppercase">
            Role
          </dt>
          <dd className="text-sm/6 text-muted-foreground">{invitation.role}</dd>
        </div>

        {"inviterEmail" in invitation ? (
          <div className="space-y-1 border-t border-border/60 pt-4">
            <dt className="text-xs font-medium tracking-[0.18em] text-muted-foreground uppercase">
              Invited by
            </dt>
            <dd className="text-sm/6 text-muted-foreground">
              {invitation.inviterEmail}
            </dd>
          </div>
        ) : null}
      </dl>
    </div>
  );
}

export function AcceptInvitationPage({
  invitationId,
}: {
  readonly invitationId: string;
}) {
  const navigate = useNavigate();
  const [state, setState] = React.useState<InvitationPageState>({
    status: "loading",
  });

  React.useEffect(() => {
    let cancelled = false;

    async function loadInvitation() {
      const session = await authClient.getSession();

      if (cancelled) {
        return;
      }

      const isSignedOut = Boolean(session.error || !session.data);

      if (isSignedOut) {
        let preview: InvitationPreviewDetails | null = null;

        try {
          preview = await getPublicInvitationPreview(invitationId);
        } catch {
          preview = null;
        }

        if (cancelled) {
          return;
        }

        setState(
          preview
            ? {
                status: "signed-out",
                invitation: preview,
              }
            : {
                status: "signed-out",
              }
        );
        return;
      }

      const invitation = await authClient.organization.getInvitation({
        query: {
          id: invitationId,
        },
      });

      if (cancelled) {
        return;
      }

      if (invitation.error || !invitation.data) {
        setState({
          status: "error",
          canSwitchAccount: true,
          message: INVITATION_LOOKUP_ERROR_MESSAGE,
        });
        return;
      }

      setState({
        status: "ready",
        invitation: {
          ...invitation.data,
          role: decodeOrganizationRole(invitation.data.role),
        },
      });
    }

    void loadInvitation();

    return () => {
      cancelled = true;
    };
  }, [invitationId]);

  async function handleAcceptInvitation() {
    if (state.status !== "ready" && state.status !== "error") {
      return;
    }

    if (!("invitation" in state) || !state.invitation) {
      return;
    }

    setState({
      status: "submitting",
      invitation: state.invitation,
    });

    const result = await authClient.organization.acceptInvitation({
      invitationId,
    });

    if (result.error) {
      setState({
        status: "error",
        invitation: state.invitation,
        message: INVITATION_ACCEPT_ERROR_MESSAGE,
      });
      return;
    }

    await navigate({
      to: "/",
    });
  }

  async function handleSwitchAccount() {
    setState({
      status: "switching-account",
      message: "Signing out so you can continue with the invited account...",
    });

    try {
      const result = await signOut();

      if (result.error) {
        setState({
          status: "error",
          canSwitchAccount: true,
          message: "We couldn't sign you out. Please try again.",
        });
        return;
      }

      try {
        await navigate(getLoginNavigationTarget(invitationId));
      } catch {
        if (!hardRedirectToLogin(invitationId)) {
          setState({
            status: "error",
            canSwitchAccount: true,
            message: "We couldn't send you to sign in. Please try again.",
          });
        }
      }
    } catch {
      setState({
        status: "error",
        canSwitchAccount: true,
        message: "We couldn't sign you out. Please try again.",
      });
    }
  }

  const invitation = "invitation" in state ? state.invitation : undefined;
  const shellCopy = getInvitationShellCopy(state, invitation);
  const cardCopy = getInvitationCardCopy(state, invitation);
  const isAcceptingInvitation = state.status === "submitting";
  const showsAcceptInvitationCta =
    (state.status === "ready" ||
      state.status === "error" ||
      state.status === "submitting") &&
    invitation !== undefined;

  return (
    <EntryShell
      badge="Invitation"
      title={shellCopy.title}
      description={shellCopy.description}
      supportingContent={
        <InvitationContextContent
          invitation={invitation}
          signedOut={state.status === "signed-out"}
        />
      }
    >
      <EntrySurfaceCard
        badge={cardCopy.badge}
        className="max-w-lg"
        title={cardCopy.title}
        description={cardCopy.description}
        footer={
          showsAcceptInvitationCta ? (
            <Button
              className="w-full"
              size="lg"
              disabled={isAcceptingInvitation}
              onClick={() => {
                void handleAcceptInvitation();
              }}
            >
              {isAcceptingInvitation
                ? "Accepting invitation..."
                : "Accept invitation"}
            </Button>
          ) : undefined
        }
      >
        {state.status === "loading" ? (
          <Empty className="min-h-0 bg-muted/20 px-6 py-8">
            <EmptyHeader>
              <EmptyTitle>Loading your invitation...</EmptyTitle>
              <EmptyDescription>
                We&rsquo;re checking the workspace details now.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : null}

        {state.status === "signed-out" ? (
          <div className="flex flex-col gap-3 sm:flex-row">
            <Link
              {...getLoginNavigationTarget(invitationId)}
              className={buttonVariants({
                className: "flex-1",
              })}
            >
              Sign in
            </Link>
            <Link
              {...getSignupNavigationTarget(invitationId)}
              className={buttonVariants({
                className: "flex-1",
                variant: "outline",
              })}
            >
              Create account
            </Link>
          </div>
        ) : null}

        {state.status === "error" || state.status === "switching-account" ? (
          <Alert variant="destructive">
            <AlertDescription>{state.message}</AlertDescription>
          </Alert>
        ) : null}

        {state.status === "error" && state.canSwitchAccount ? (
          <Button
            className="w-full"
            variant="outline"
            onClick={() => {
              void handleSwitchAccount();
            }}
          >
            Sign out and try another account
          </Button>
        ) : null}
      </EntrySurfaceCard>
    </EntryShell>
  );
}
