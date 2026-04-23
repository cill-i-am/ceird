import { Briefcase01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
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
import { Separator } from "#/components/ui/separator";

export function AuthenticatedShellHome() {
  const { session } = useRouteContext({ from: "/_app" });
  const { activeOrganization } = useRouteContext({ from: "/_app/_org" });
  const verificationLabel = session.user.emailVerified
    ? "Email verified"
    : "Verification pending";

  return (
    <main
      aria-label="Workspace home"
      className="mx-auto flex w-full max-w-5xl flex-1 px-4 py-10 sm:py-14"
    >
      <div className="flex w-full flex-col gap-6">
        <Card className="w-full">
          <CardHeader className="gap-4">
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary" className="w-fit">
                Workspace ready
              </Badge>
              <Badge
                variant={session.user.emailVerified ? "secondary" : "outline"}
                className="w-fit"
              >
                {verificationLabel}
              </Badge>
            </div>
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div className="flex flex-col gap-2">
                <h1 className="font-heading text-3xl font-medium tracking-tight sm:text-4xl">
                  {activeOrganization.name}
                </h1>
                <CardDescription className="max-w-2xl text-base leading-relaxed">
                  @{activeOrganization.slug} is ready for the team. Keep this
                  workspace lean: invite the crew, confirm account access, and
                  build the daily job flow from one clear starting point.
                </CardDescription>
              </div>
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
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            <dl className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1 rounded-3xl border bg-muted/30 p-4">
                <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  Organization
                </dt>
                <dd className="font-medium">{activeOrganization.name}</dd>
              </div>
              <div className="flex flex-col gap-1 rounded-3xl border bg-muted/30 p-4">
                <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  Access
                </dt>
                <dd className="font-medium">{verificationLabel}</dd>
              </div>
            </dl>

            <Separator />

            <section className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-1">
                  <CardTitle>Next up</CardTitle>
                  <CardDescription>
                    The fastest path to a useful workspace is keeping the setup
                    simple and operational.
                  </CardDescription>
                </div>
                <ol className="flex flex-col gap-4">
                  <li className="flex gap-3">
                    <Badge variant="outline" className="mt-0.5 w-fit">
                      01
                    </Badge>
                    <div className="flex flex-col gap-1">
                      <p className="font-medium">
                        Invite the people doing the work
                      </p>
                      <p className="text-sm text-muted-foreground">
                        Send member and admin invites so the workspace reflects
                        the real crew, not just the owner account.
                      </p>
                    </div>
                  </li>
                  <li className="flex gap-3">
                    <Badge variant="outline" className="mt-0.5 w-fit">
                      02
                    </Badge>
                    <div className="flex flex-col gap-1">
                      <p className="font-medium">Lock in account trust</p>
                      <p className="text-sm text-muted-foreground">
                        Keep verification visible until the account is ready for
                        live work and invitation follow-through.
                      </p>
                    </div>
                  </li>
                  <li className="flex gap-3">
                    <Badge variant="outline" className="mt-0.5 w-fit">
                      03
                    </Badge>
                    <div className="flex flex-col gap-1">
                      <p className="font-medium">Keep the shell clean</p>
                      <p className="text-sm text-muted-foreground">
                        This home should stay quick to scan so future jobs,
                        snags, and crew updates have a calm place to land.
                      </p>
                    </div>
                  </li>
                </ol>
              </div>

              <div className="rounded-3xl border bg-muted/20 p-5">
                <div className="flex flex-col gap-2">
                  <CardTitle>Workspace note</CardTitle>
                  <CardDescription className="max-w-none">
                    The product is still early, so this page stays deliberately
                    light. It should orient the team, not bury them in a demo
                    dashboard. Jobs is now ready as the first operational slice.
                  </CardDescription>
                </div>
                <Link
                  to="/jobs"
                  className={buttonVariants({ size: "sm", variant: "outline" })}
                >
                  <HugeiconsIcon
                    icon={Briefcase01Icon}
                    strokeWidth={2}
                    data-icon="inline-start"
                  />
                  Open Jobs
                </Link>
              </div>
            </section>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
