import { Link } from "@tanstack/react-router";

import { buttonVariants } from "#/components/ui/button";

import { authQuietLinkClassName } from "./auth-link-styles";
import {
  authCardViewTransition,
  getLoginNavigationTarget,
} from "./auth-navigation";
import { AuthSplitShell } from "./auth-split-shell";
import type { EmailVerificationSearch } from "./email-verification-search";
import { EntrySurfaceCard } from "./entry-shell";

interface EmailVerificationPageProps {
  search?: EmailVerificationSearch;
}

export function EmailVerificationPage({ search }: EmailVerificationPageProps) {
  const isInvalidToken = search?.status !== "success";
  const title = isInvalidToken ? "Verification link expired" : "Email verified";

  return (
    <AuthSplitShell>
      <EntrySurfaceCard
        className="max-w-lg"
        title={title}
        titleLevel={1}
        description={
          isInvalidToken
            ? "Use the newest email verification link, or return to sign in and request a fresh one."
            : undefined
        }
        footer={
          <div className="flex flex-col gap-3">
            <Link
              {...(isInvalidToken
                ? getLoginNavigationTarget()
                : { to: "/", viewTransition: authCardViewTransition })}
              className={buttonVariants({
                className: "w-full [view-transition-name:auth-card-action]",
              })}
            >
              {isInvalidToken ? "Back to login" : "Go to the app"}
            </Link>
            <Link
              {...(isInvalidToken
                ? { to: "/", viewTransition: authCardViewTransition }
                : getLoginNavigationTarget())}
              className={`${authQuietLinkClassName} self-center`}
            >
              {isInvalidToken ? "Go to the app" : "Back to login"}
            </Link>
          </div>
        }
      />
    </AuthSplitShell>
  );
}
