import { Link } from "@tanstack/react-router";

import { buttonVariants } from "#/components/ui/button";
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "#/components/ui/card";

import type { EmailVerificationSearch } from "./email-verification-search";

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
    <div className="mx-auto flex min-h-screen w-full max-w-md items-center px-4 py-10">
      <Card className="w-full">
        <CardHeader className="text-center">
          <CardTitle className="text-xl">{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardFooter className="flex-col items-stretch gap-4">
          <Link to="/" className={buttonVariants({ className: "w-full" })}>
            Go to the app
          </Link>
          <Link
            to="/login"
            className={buttonVariants({
              className: "w-full",
              variant: "outline",
            })}
          >
            Back to login
          </Link>
        </CardFooter>
      </Card>
    </div>
  );
}
