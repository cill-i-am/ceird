import { Link } from "@tanstack/react-router";

import { buttonVariants } from "#/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "#/components/ui/empty";

import { getLoginNavigationTarget } from "./auth-navigation";
import type { EmailVerificationSearch } from "./email-verification-search";
import {
  DEFAULT_AUTH_HIGHLIGHTS,
  EntryHighlightGrid,
  EntryShell,
  EntrySurfaceCard,
} from "./entry-shell";

interface EmailVerificationPageProps {
  search?: EmailVerificationSearch;
}

export function EmailVerificationPage({ search }: EmailVerificationPageProps) {
  const isInvalidToken = search?.status !== "success";
  const title = isInvalidToken ? "Verification link invalid" : "Email verified";
  const description = isInvalidToken
    ? "This verification link is invalid or has expired. Request a fresh verification email from the app."
    : "Your email address is verified. You can continue in the app or sign in again if needed.";

  return (
    <EntryShell
      badge="Account status"
      title={
        isInvalidToken
          ? "This verification link can't be used anymore."
          : "Your account is verified and ready to go."
      }
      description={
        isInvalidToken
          ? "Head back into the app and request a new verification email when you're ready."
          : "Verified accounts keep invitations, sign-in recovery, and member setup running smoothly."
      }
      supportingContent={<EntryHighlightGrid items={DEFAULT_AUTH_HIGHLIGHTS} />}
    >
      <EntrySurfaceCard
        badge={isInvalidToken ? "Verification issue" : "Verified"}
        title={title}
        description={description}
        footer={
          <Link to="/" className={buttonVariants({ className: "w-full" })}>
            Go to the app
          </Link>
        }
      >
        <Empty className="min-h-0 bg-muted/20 px-6 py-8">
          <EmptyHeader>
            <EmptyTitle>
              {isInvalidToken
                ? "Request a fresh verification email"
                : "You can continue safely"}
            </EmptyTitle>
            <EmptyDescription>
              {isInvalidToken
                ? "Open the app and send a new verification email from your account settings or banner."
                : "Your email is verified. You can continue in the app or sign in again if you need a fresh session."}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
        <Link
          {...getLoginNavigationTarget()}
          className={buttonVariants({
            className: "w-full",
            variant: "outline",
          })}
        >
          Back to login
        </Link>
      </EntrySurfaceCard>
    </EntryShell>
  );
}
