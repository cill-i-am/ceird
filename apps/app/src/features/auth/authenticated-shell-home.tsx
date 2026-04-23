import { Briefcase01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Link, useRouteContext } from "@tanstack/react-router";

import { AppPageHeader } from "#/components/app-page-header";
import {
  AppRowList,
  AppRowListBody,
  AppRowListItem,
  AppRowListLeading,
  AppRowListMeta,
} from "#/components/app-row-list";
import {
  AppStatusStrip,
  AppStatusStripItem,
} from "#/components/app-status-strip";
import { AppUtilityPanel } from "#/components/app-utility-panel";
import { Badge } from "#/components/ui/badge";
import { buttonVariants } from "#/components/ui/button";

export function AuthenticatedShellHome() {
  const { session } = useRouteContext({ from: "/_app" });
  const { activeOrganization } = useRouteContext({ from: "/_app/_org" });
  const verificationLabel = session.user.emailVerified
    ? "Email verified"
    : "Verification pending";
  const nextStep = session.user.emailVerified
    ? {
        status: "Ready",
        title: "Invite the first teammate",
      }
    : {
        status: "Pending",
        title: "Finish account verification",
      };
  const verificationAction = session.user.emailVerified
    ? {
        description:
          "Email verification is complete and ready for teammate follow-through.",
        title: "Account trust is in place",
      }
    : {
        description:
          "Use the latest verification email before the workspace expands.",
        title: "Finish account verification",
      };

  return (
    <main
      aria-label="Workspace home"
      className="flex flex-1 flex-col gap-6 p-4 sm:p-6 lg:p-8"
    >
      <AppPageHeader
        eyebrow="Workspace"
        title={activeOrganization.name}
        description={`@${activeOrganization.slug} is live. Keep access tight, make the next move obvious, and leave the noise out.`}
        actions={
          <>
            <Link to="/members" className={buttonVariants({ size: "sm" })}>
              Invite teammates
            </Link>
            <Link
              to="/health"
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              Check system health
            </Link>
          </>
        }
      />

      <AppStatusStrip label="Workspace status">
        <AppStatusStripItem
          label="Organization"
          value={activeOrganization.name}
          meta={`@${activeOrganization.slug}`}
        />
        <AppStatusStripItem
          label="Account"
          value={verificationLabel}
          meta={session.user.email}
        />
        <AppStatusStripItem
          label="Next step"
          value={nextStep.title}
          meta={nextStep.status}
        />
        <AppStatusStripItem
          label="System"
          value="Health checks ready"
          meta="/health"
        />
      </AppStatusStrip>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.12fr)_minmax(18rem,0.88fr)]">
        <section
          aria-labelledby="workspace-next-actions-heading"
          className="flex flex-col gap-4"
        >
          <div className="flex flex-col gap-1">
            <h2
              id="workspace-next-actions-heading"
              className="font-heading text-lg font-medium tracking-tight"
            >
              Next actions
            </h2>
            <p className="text-sm/6 text-muted-foreground">
              Keep the first steps short and operational.
            </p>
          </div>
          <AppRowList>
            <AppRowListItem>
              <AppRowListLeading aria-hidden="true">01</AppRowListLeading>
              <AppRowListBody
                title="Invite the first teammate"
                description="Open members and send the first access invite."
              />
              <AppRowListMeta>
                <Badge variant="secondary">Members</Badge>
                <Link
                  to="/members"
                  className={buttonVariants({ variant: "ghost", size: "sm" })}
                >
                  Open
                </Link>
              </AppRowListMeta>
            </AppRowListItem>
            <AppRowListItem>
              <AppRowListLeading aria-hidden="true">02</AppRowListLeading>
              <AppRowListBody
                title={verificationAction.title}
                description={verificationAction.description}
              />
              <AppRowListMeta>
                <Badge
                  variant={session.user.emailVerified ? "secondary" : "outline"}
                >
                  {verificationLabel}
                </Badge>
              </AppRowListMeta>
            </AppRowListItem>
            <AppRowListItem>
              <AppRowListLeading aria-hidden="true">03</AppRowListLeading>
              <AppRowListBody
                title="Check system health"
                description="Use the health view when something feels off in the shell."
              />
              <AppRowListMeta>
                <Badge variant="outline">Operational</Badge>
                <Link
                  to="/health"
                  className={buttonVariants({ variant: "ghost", size: "sm" })}
                >
                  Open
                </Link>
              </AppRowListMeta>
            </AppRowListItem>
          </AppRowList>
        </section>

        <AppUtilityPanel
          title="Operating context"
          description="This page stays lean on purpose. Access, verification, and health should be one move away."
        >
          <dl className="grid gap-3 text-sm">
            <div className="flex items-center justify-between gap-3 border-b border-border/60 pb-3">
              <dt className="text-muted-foreground">Current workspace</dt>
              <dd className="truncate font-medium">
                @{activeOrganization.slug}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3 border-b border-border/60 pb-3">
              <dt className="text-muted-foreground">Session owner</dt>
              <dd className="truncate font-medium">{session.user.email}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted-foreground">Recommended next move</dt>
              <dd className="font-medium">{nextStep.title}</dd>
            </div>
          </dl>
          <div className="flex flex-col gap-3 border-t border-border/60 pt-4">
            <p className="text-sm/6 text-muted-foreground">
              Jobs is ready as the first operational slice, so the team can
              move from setup into live work without hunting for the route.
            </p>
            <Link
              to="/jobs"
              className={buttonVariants({ size: "sm", variant: "outline" })}
            >
              <HugeiconsIcon
                icon={Briefcase01Icon}
                strokeWidth={2}
                data-icon="inline-start"
              />
              Open jobs
            </Link>
          </div>
        </AppUtilityPanel>
      </div>
    </main>
  );
}
