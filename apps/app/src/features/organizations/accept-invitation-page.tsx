import { Link, useNavigate } from "@tanstack/react-router";
import * as React from "react";

import { Alert, AlertDescription } from "#/components/ui/alert";
import { Button, buttonVariants } from "#/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "#/components/ui/empty";
import { authClient } from "#/lib/auth-client";

import {
  getLoginNavigationTarget,
  getSignupNavigationTarget,
} from "../auth/auth-navigation";
import {
  EntryHighlightGrid,
  EntryShell,
  EntrySurfaceCard,
  EntrySupportPanel,
  INVITATION_AUTH_HIGHLIGHTS,
} from "../auth/entry-shell";
import { hardRedirectToLogin } from "../auth/hard-redirect-to-login";
import { signOut } from "../auth/sign-out";

interface InvitationDetails {
  readonly email: string;
  readonly id: string;
  readonly inviterEmail: string;
  readonly organizationName: string;
  readonly role: string;
}

type InvitationPageState =
  | {
      readonly status: "loading";
    }
  | {
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

      if (session.error || !session.data) {
        setState({
          status: "signed-out",
        });
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
        invitation: invitation.data,
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
  let shellTitle = "Review your organization invitation.";
  let shellDescription =
    "We'll check the invitation and help you continue with the right account.";

  if (invitation) {
    shellTitle = `Join ${invitation.organizationName}`;
    shellDescription = `Continue with ${invitation.email} to join ${invitation.organizationName} as ${invitation.role}.`;
  } else if (state.status === "signed-out") {
    shellTitle = "Continue with the invited account.";
    shellDescription =
      "Sign in or create an account to continue into the workspace with the correct email.";
  }
  const supportingContent = invitation ? (
    <div className="grid gap-3 sm:grid-cols-3">
      <EntrySupportPanel
        title="Organization"
        description={invitation.organizationName}
      />
      <EntrySupportPanel title="Invited email" description={invitation.email} />
      <EntrySupportPanel title="Role" description={invitation.role} />
    </div>
  ) : (
    <EntryHighlightGrid items={INVITATION_AUTH_HIGHLIGHTS} />
  );

  return (
    <EntryShell
      badge="Invitation"
      title={shellTitle}
      description={shellDescription}
      supportingContent={supportingContent}
    >
      <EntrySurfaceCard
        badge={
          state.status === "signed-out"
            ? "Sign in required"
            : "Organization invitation"
        }
        title="Organization invitation"
        description="Review the invitation details and continue with the invited email address."
        footer={
          invitation ? (
            <Button
              className="w-full"
              size="lg"
              disabled={state.status === "submitting"}
              onClick={() => {
                void handleAcceptInvitation();
              }}
            >
              {state.status === "submitting"
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
                We&apos;re checking the workspace details now.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : null}

        {state.status === "signed-out" ? (
          <>
            <p className="text-sm/6 text-muted-foreground">
              Sign in or create an account to continue.
            </p>
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
          </>
        ) : null}

        {invitation ? (
          <Alert className="bg-muted/40">
            <AlertDescription>
              {invitation.inviterEmail} invited {invitation.email} as{" "}
              {invitation.role}.
            </AlertDescription>
          </Alert>
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
