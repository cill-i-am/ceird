import { Link, useRouteContext } from "@tanstack/react-router";

import { Badge } from "#/components/ui/badge";
import { buttonVariants } from "#/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "#/components/ui/card";

export function AuthenticatedShellHome() {
  const { session } = useRouteContext({ from: "/_app" });
  const { activeOrganization } = useRouteContext({ from: "/_app/_org" });
  const verificationLabel = session.user.emailVerified
    ? "Email verified"
    : "Verification pending";

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 px-4 py-10 sm:py-14">
      <div className="flex w-full flex-col gap-6">
        <Card className="w-full">
          <CardHeader className="gap-4">
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary" className="w-fit">
                Active organization
              </Badge>
              <Badge
                variant={session.user.emailVerified ? "secondary" : "outline"}
                className="w-fit"
              >
                {verificationLabel}
              </Badge>
            </div>
            <div className="space-y-2">
              <h1 className="font-heading text-3xl font-medium tracking-tight sm:text-4xl">
                {activeOrganization.name}
              </h1>
              <CardDescription className="max-w-3xl text-base">
                You&apos;re working in @{activeOrganization.slug}. This starter
                workspace now reflects the active organization already enforced
                by the authenticated shell.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            <dl className="grid gap-4 sm:grid-cols-3">
              <div className="space-y-1 rounded-3xl border bg-muted/30 p-4">
                <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  Organization
                </dt>
                <dd className="font-medium">{activeOrganization.name}</dd>
              </div>
              <div className="space-y-1 rounded-3xl border bg-muted/30 p-4">
                <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  Slug
                </dt>
                <dd className="font-medium">@{activeOrganization.slug}</dd>
              </div>
              <div className="space-y-1 rounded-3xl border bg-muted/30 p-4">
                <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  Account status
                </dt>
                <dd className="font-medium">{verificationLabel}</dd>
              </div>
            </dl>

            <div className="flex flex-wrap gap-3">
              <Link to="/members" className={buttonVariants()}>
                Invite teammates
              </Link>
              <Link
                to="/health"
                className={buttonVariants({ variant: "outline" })}
              >
                Check system health
              </Link>
            </div>
          </CardContent>
        </Card>

        <section className="grid gap-4 lg:grid-cols-3">
          <Card size="sm">
            <CardHeader>
              <CardTitle>Organization context</CardTitle>
              <CardDescription>
                The app shell is now grounded in the active organization
                resolved during route access checks.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="m-0 text-sm text-muted-foreground">
                That means the page copy, quick actions, and future product
                slices can build on a trustworthy organization boundary instead
                of a generic signed-in placeholder.
              </p>
            </CardContent>
          </Card>

          <Card size="sm">
            <CardHeader>
              <CardTitle>Team setup</CardTitle>
              <CardDescription>
                Invitation flows are already available on main, so the most
                useful next action is inviting the rest of the team.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="m-0 text-sm text-muted-foreground">
                Head to members to send invites and review pending ones for
                {` ${activeOrganization.name}.`}
              </p>
            </CardContent>
          </Card>

          <Card size="sm">
            <CardHeader>
              <CardTitle>Account trust</CardTitle>
              <CardDescription>
                Email verification stays visible inside the shell until the
                account is fully trusted.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="m-0 text-sm text-muted-foreground">
                Current status: {verificationLabel.toLowerCase()}. That keeps
                recovery and invitation UX aligned with the session you&apos;re
                using right now.
              </p>
            </CardContent>
          </Card>
        </section>
      </div>
    </main>
  );
}
