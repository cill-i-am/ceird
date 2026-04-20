import { Link, useNavigate } from "@tanstack/react-router";
import * as React from "react";

import { Button } from "#/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "#/components/ui/card";
import { FieldError } from "#/components/ui/field";
import { authClient } from "#/lib/auth-client";

import {
  getLoginNavigationTarget,
  getSignupNavigationTarget,
} from "../auth/auth-navigation";
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

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md items-center px-4 py-10">
      <Card className="w-full">
        <CardHeader className="text-center">
          <CardTitle className="text-xl">Organization invitation</CardTitle>
          <CardDescription>
            Review the invitation details and continue with the invited email
            address.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {state.status === "loading" ? (
            <p className="text-sm text-muted-foreground">
              Loading your invitation...
            </p>
          ) : null}

          {state.status === "signed-out" ? (
            <>
              <p className="text-sm text-muted-foreground">
                Sign in or create an account to continue.
              </p>
              <div className="flex gap-3">
                <Link
                  {...getLoginNavigationTarget(invitationId)}
                  className="inline-flex flex-1 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-xs hover:bg-primary/90"
                >
                  Sign in
                </Link>
                <Link
                  {...getSignupNavigationTarget(invitationId)}
                  className="inline-flex flex-1 items-center justify-center rounded-md border border-input px-4 py-2 text-sm font-medium shadow-xs hover:bg-accent hover:text-accent-foreground"
                >
                  Create account
                </Link>
              </div>
            </>
          ) : null}

          {"invitation" in state && state.invitation ? (
            <div className="space-y-1">
              <h2 className="text-lg font-semibold">
                Join {state.invitation.organizationName}
              </h2>
              <p className="text-sm text-muted-foreground">
                {state.invitation.inviterEmail} invited {state.invitation.email}{" "}
                as {state.invitation.role}.
              </p>
            </div>
          ) : null}

          {state.status === "error" || state.status === "switching-account" ? (
            <FieldError>{state.message}</FieldError>
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
        </CardContent>

        {"invitation" in state && state.invitation ? (
          <CardFooter className="px-6 pt-0">
            <Button
              className="w-full"
              disabled={state.status === "submitting"}
              onClick={() => {
                void handleAcceptInvitation();
              }}
            >
              {state.status === "submitting"
                ? "Accepting invitation..."
                : "Accept invitation"}
            </Button>
          </CardFooter>
        ) : null}
      </Card>
    </div>
  );
}
