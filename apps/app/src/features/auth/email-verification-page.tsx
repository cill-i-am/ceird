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
import { EntryShell, EntrySurfaceCard } from "./entry-shell";

interface EmailVerificationPageProps {
  search?: EmailVerificationSearch;
}

export function EmailVerificationPage({ search }: EmailVerificationPageProps) {
  const isInvalidToken = search?.status !== "success";
  const title = isInvalidToken ? "Verification link invalid" : "Email verified";
  const description = isInvalidToken
    ? "This verification link is invalid or has expired."
    : "Your email address is verified.";

  return (
    <EntryShell
      badge="Account status"
      title={
        isInvalidToken
          ? "This verification link can't be used."
          : "Your email is verified."
      }
      description={
        isInvalidToken
          ? "Request a fresh verification email from the app."
          : "You can continue into the app."
      }
      supportingContent={
        <div className="flex flex-col gap-3">
          <p className="text-xs font-medium text-muted-foreground uppercase">
            Status
          </p>
          <p className="max-w-[36ch] text-sm/6 text-muted-foreground">
            {isInvalidToken
              ? "Use the newest verification email."
              : "Your account is ready."}
          </p>
        </div>
      }
    >
      <EntrySurfaceCard
        badge={isInvalidToken ? "Verification issue" : "Verified"}
        className="max-w-lg"
        title={title}
        description={description}
        footer={
          <div className="flex flex-col gap-3">
            <Link to="/" className={buttonVariants({ className: "w-full" })}>
              Go to the app
            </Link>
            <Link
              {...getLoginNavigationTarget()}
              className={buttonVariants({
                className: "w-full",
                variant: "outline",
              })}
            >
              Back to login
            </Link>
          </div>
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
                ? "Open the app and send a new verification email."
                : "Continue in the app or sign in again if you need a fresh session."}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </EntrySurfaceCard>
    </EntryShell>
  );
}
