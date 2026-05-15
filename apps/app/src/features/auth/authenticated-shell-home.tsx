import {
  Activity01Icon,
  Add01Icon,
  ArrowRight01Icon,
  Briefcase01Icon,
  Location01Icon,
  Mail01Icon,
  UserGroupIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Link, useNavigate, useRouteContext } from "@tanstack/react-router";
import * as React from "react";

import { AppPageHeader } from "#/components/app-page-header";
import {
  AppRowList,
  AppRowListBody,
  AppRowListItem,
  AppRowListLeading,
  AppRowListMeta,
} from "#/components/app-row-list";
import { Badge } from "#/components/ui/badge";
import { buttonVariants } from "#/components/ui/button";
import { ShortcutHint } from "#/hotkeys/hotkey-display";
import { HOTKEYS } from "#/hotkeys/hotkey-registry";
import { useAppHotkey } from "#/hotkeys/use-app-hotkey";
import { cn } from "#/lib/utils";

import { EMPTY_AUTHENTICATED_HOME_DASHBOARD } from "./authenticated-shell-home-dashboard";
import type {
  AuthenticatedHomeDashboard,
  AuthenticatedHomeJobItem,
  AuthenticatedHomeSiteItem,
} from "./authenticated-shell-home-dashboard";

export function AuthenticatedShellHome({
  dashboard = EMPTY_AUTHENTICATED_HOME_DASHBOARD,
}: {
  readonly dashboard?: AuthenticatedHomeDashboard;
}) {
  const { activeOrganization } = useRouteContext({ from: "/_app/_org" });
  const { session } = useRouteContext({ from: "/_app" });
  const navigate = useNavigate({ from: "/" });
  const {
    user: { emailVerified },
  } = session;
  const nextActions = buildNextActions({
    dashboard,
    emailVerified,
  });
  useAppHotkey(
    "homeCreateJob",
    () => {
      React.startTransition(() => {
        navigate({ to: "/jobs/new" });
      });
    },
    { ignoreInputs: true }
  );

  return (
    <main
      aria-label="Workspace home"
      className="flex flex-1 flex-col gap-5 p-3 sm:p-4 lg:p-5"
    >
      <AppPageHeader
        title="Home"
        description={`${activeOrganization.name} / @${activeOrganization.slug}`}
        actions={
          <>
            <Link
              to="/members"
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              <HugeiconsIcon
                icon={UserGroupIcon}
                strokeWidth={2}
                data-icon="inline-start"
              />
              Invite teammate
              <ShortcutHint
                surface="button"
                hotkey={HOTKEYS.goMembers.hotkey}
                label={HOTKEYS.goMembers.label}
                decorative
              />
            </Link>
            <Link to="/jobs/new" className={buttonVariants({ size: "sm" })}>
              <HugeiconsIcon
                icon={Add01Icon}
                strokeWidth={2}
                data-icon="inline-start"
              />
              New job
              <ShortcutHint
                surface="button"
                hotkey={HOTKEYS.homeCreateJob.hotkey}
                label={HOTKEYS.homeCreateJob.label}
                decorative
              />
            </Link>
          </>
        }
      />

      <section className="flex max-w-7xl flex-col gap-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <h2 className="font-heading text-lg font-medium">
              Workspace overview
            </h2>
          </div>
          <div className="grid grid-cols-2 gap-2 text-sm sm:flex sm:items-center">
            <WorkspaceMetric
              icon={Briefcase01Icon}
              label="Active jobs"
              value={dashboard.jobs.stats.activeJobs}
            />
            <WorkspaceMetric
              icon={Location01Icon}
              label="Sites"
              value={dashboard.sites.stats.totalSites}
            />
            <WorkspaceMetric
              icon={UserGroupIcon}
              label="Members"
              value={dashboard.members.total}
            />
            <WorkspaceMetric
              icon={Mail01Icon}
              label="Email"
              value={emailVerified ? "Verified" : "Verify"}
            />
          </div>
        </div>

        <div
          aria-label="Dashboard modules"
          className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem] xl:grid-cols-[minmax(0,1fr)_24rem]"
        >
          <div className="flex min-w-0 flex-col gap-4">
            <JobsAtAGlance dashboard={dashboard} />
            <SitesWithActiveWork dashboard={dashboard} />
          </div>

          <aside className="flex min-w-0 flex-col gap-4">
            <NextActions actions={nextActions} />
            <RecentActivity dashboard={dashboard} />
          </aside>
        </div>
      </section>
    </main>
  );
}

function WorkspaceMetric({
  icon,
  label,
  value,
}: {
  readonly icon: typeof Briefcase01Icon;
  readonly label: string;
  readonly value: number | string;
}) {
  return (
    <div className="flex min-w-0 items-center gap-2 rounded-lg border border-border/60 bg-background px-3 py-2">
      <HugeiconsIcon
        icon={icon}
        strokeWidth={2}
        className="text-muted-foreground"
      />
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">{value}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

function DashboardPanel({
  action,
  children,
  className,
  title,
}: {
  readonly action?: React.ReactNode;
  readonly children: React.ReactNode;
  readonly className?: string;
  readonly title: string;
}) {
  return (
    <section
      aria-labelledby={`${getPanelId(title)}-heading`}
      className={cn(
        "min-w-0 overflow-hidden rounded-lg border border-border/60 bg-background",
        className
      )}
    >
      <div className="flex min-w-0 items-center justify-between gap-3 border-b border-border/60 px-4 py-3">
        <h3
          id={`${getPanelId(title)}-heading`}
          className="font-heading text-sm font-medium text-foreground"
        >
          {title}
        </h3>
        {action}
      </div>
      {children}
    </section>
  );
}

function JobsAtAGlance({
  dashboard,
}: {
  readonly dashboard: AuthenticatedHomeDashboard;
}) {
  if (dashboard.jobs.items.length === 0) {
    return (
      <DashboardPanel
        title="Jobs at a glance"
        action={<DashboardLink to="/jobs/new">New job</DashboardLink>}
      >
        <EmptyPanelMessage
          title="No active jobs."
          description="Create the first job when work is ready to schedule."
        />
      </DashboardPanel>
    );
  }

  return (
    <DashboardPanel
      title="Jobs at a glance"
      action={<DashboardLink to="/jobs">View all jobs</DashboardLink>}
    >
      <DashboardGrid
        headers={["Job", "Site", "Status", "Assignee", "Updated"]}
        template="md:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)_minmax(6rem,0.65fr)_minmax(7rem,0.8fr)_minmax(7rem,0.75fr)]"
      >
        <ul className="divide-y divide-border/60">
          {dashboard.jobs.items.map((job) => (
            <HomeJobRow key={job.id} job={job} />
          ))}
        </ul>
      </DashboardGrid>
    </DashboardPanel>
  );
}

function HomeJobRow({ job }: { readonly job: AuthenticatedHomeJobItem }) {
  return (
    <li
      className={cn(
        "grid gap-2 px-4 py-3 text-sm hover:bg-muted/30 md:items-center md:gap-3",
        "md:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)_minmax(6rem,0.65fr)_minmax(7rem,0.8fr)_minmax(7rem,0.75fr)]"
      )}
    >
      <div className="min-w-0 font-medium">
        <Link
          to="/jobs/$jobId"
          params={{ jobId: job.id }}
          className="rounded-sm outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          {job.title}
        </Link>
      </div>
      <DashboardGridCell label="Site">
        <span>{job.siteName ?? "No site"}</span>
      </DashboardGridCell>
      <div className="min-w-0">
        <Badge variant="secondary" className="rounded-full">
          {job.statusLabel}
        </Badge>
      </div>
      <DashboardGridCell label="Assignee">
        <span>{job.assigneeName ?? "Unassigned"}</span>
      </DashboardGridCell>
      <DashboardGridCell
        label="Updated"
        className="md:justify-end md:text-right"
      >
        <span>{job.updatedAt}</span>
      </DashboardGridCell>
    </li>
  );
}

function SitesWithActiveWork({
  dashboard,
}: {
  readonly dashboard: AuthenticatedHomeDashboard;
}) {
  const emptySitesTitle =
    dashboard.sites.stats.totalSites === 0
      ? "No sites yet."
      : "No active site work.";
  const emptySitesDescription =
    dashboard.sites.stats.totalSites === 0
      ? "Create sites so jobs have addresses, service areas, and map context."
      : "Sites with active jobs will appear here once work is underway.";

  if (dashboard.sites.items.length === 0) {
    return (
      <DashboardPanel
        title="Sites with active work"
        action={<DashboardLink to="/sites/new">New site</DashboardLink>}
      >
        <EmptyPanelMessage
          title={emptySitesTitle}
          description={emptySitesDescription}
        />
      </DashboardPanel>
    );
  }

  return (
    <DashboardPanel
      title="Sites with active work"
      action={<DashboardLink to="/sites">View all sites</DashboardLink>}
    >
      <DashboardGrid
        headers={["Site", "Active jobs", "Address", "Updated"]}
        template="md:grid-cols-[minmax(0,1.1fr)_minmax(7rem,0.7fr)_minmax(0,1.4fr)_minmax(7rem,0.7fr)]"
      >
        <ul className="divide-y divide-border/60">
          {dashboard.sites.items.map((site) => (
            <HomeSiteRow key={site.id} site={site} />
          ))}
        </ul>
      </DashboardGrid>
    </DashboardPanel>
  );
}

function HomeSiteRow({ site }: { readonly site: AuthenticatedHomeSiteItem }) {
  return (
    <li
      className={cn(
        "grid gap-2 px-4 py-3 text-sm hover:bg-muted/30 md:items-center md:gap-3",
        "md:grid-cols-[minmax(0,1.1fr)_minmax(7rem,0.7fr)_minmax(0,1.4fr)_minmax(7rem,0.7fr)]"
      )}
    >
      <div className="min-w-0 font-medium">
        <Link
          to="/sites/$siteId"
          params={{ siteId: site.id }}
          className="rounded-sm outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          {site.name}
        </Link>
        {site.serviceAreaName ? (
          <p className="text-xs text-muted-foreground">
            {site.serviceAreaName}
          </p>
        ) : null}
      </div>
      <DashboardGridCell label="Active jobs">
        {site.activeJobCount === 1
          ? "1 active job"
          : `${site.activeJobCount} active jobs`}
      </DashboardGridCell>
      <DashboardGridCell label="Address">
        <span className="md:truncate">{site.address || "No address"}</span>
      </DashboardGridCell>
      <DashboardGridCell
        label="Updated"
        className="md:justify-end md:text-right"
      >
        <span>{site.updatedAt}</span>
      </DashboardGridCell>
    </li>
  );
}

function DashboardGrid({
  children,
  headers,
  template,
}: {
  readonly children: React.ReactNode;
  readonly headers: readonly string[];
  readonly template: string;
}) {
  return (
    <div>
      <div
        className={cn(
          "hidden border-b border-border/60 px-4 py-2 text-xs font-medium text-muted-foreground md:grid md:gap-3",
          template
        )}
      >
        {headers.map((header, index) => (
          <div
            key={header}
            className={cn(
              "min-w-0",
              index === headers.length - 1 ? "text-right" : undefined
            )}
          >
            {header}
          </div>
        ))}
      </div>
      {children}
    </div>
  );
}

function DashboardGridCell({
  children,
  className,
  label,
}: {
  readonly children: React.ReactNode;
  readonly className?: string;
  readonly label: string;
}) {
  return (
    <div
      className={cn(
        "flex min-w-0 items-center justify-between gap-3 text-muted-foreground md:block",
        className
      )}
    >
      <span className="text-xs font-medium text-muted-foreground md:hidden">
        {label}
      </span>
      <span className="min-w-0 text-right md:text-inherit">{children}</span>
    </div>
  );
}

interface NextActionItem {
  readonly badge: string;
  readonly description: string;
  readonly href:
    | "/"
    | "/jobs"
    | "/jobs/new"
    | "/members"
    | "/settings"
    | "/sites"
    | "/sites/new";
  readonly key: string;
  readonly title: string;
}

function NextActions({
  actions,
}: {
  readonly actions: readonly NextActionItem[];
}) {
  return (
    <DashboardPanel title="Next actions">
      <AppRowList className="rounded-none border-0 shadow-none">
        {actions.map((action, index) => (
          <AppRowListItem
            key={action.key}
            className="flex-row items-start gap-2 px-4 py-2.5"
          >
            <AppRowListLeading aria-hidden="true" className="size-7 text-xs">
              {String(index + 1).padStart(2, "0")}
            </AppRowListLeading>
            <AppRowListBody
              className="gap-0.5"
              eyebrow={action.badge}
              title={action.title}
              description={action.description}
              descriptionClassName="text-xs/4"
              truncateTitle={false}
            />
            <AppRowListMeta className="self-start pt-1 sm:self-center sm:pt-0">
              <Link
                to={action.href}
                aria-label={action.title}
                className="text-muted-foreground hover:text-foreground"
              >
                <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={2} />
              </Link>
            </AppRowListMeta>
          </AppRowListItem>
        ))}
      </AppRowList>
    </DashboardPanel>
  );
}

function RecentActivity({
  dashboard,
}: {
  readonly dashboard: AuthenticatedHomeDashboard;
}) {
  if (!dashboard.activity.available) {
    return (
      <DashboardPanel title="Recent activity">
        <EmptyPanelMessage
          title="Activity is admin-only."
          description="Owners and admins can review organization activity from the activity route."
        />
      </DashboardPanel>
    );
  }

  if (dashboard.activity.items.length === 0) {
    return (
      <DashboardPanel
        title="Recent activity"
        action={<DashboardLink to="/activity">View all activity</DashboardLink>}
      >
        <EmptyPanelMessage
          title="No activity yet."
          description="Job changes, labels, visits, and assignments will appear here."
        />
      </DashboardPanel>
    );
  }

  return (
    <DashboardPanel
      title="Recent activity"
      action={<DashboardLink to="/activity">View all activity</DashboardLink>}
    >
      <ul className="divide-y divide-border/60">
        {dashboard.activity.items.map((activity) => (
          <li
            key={activity.workItemId + activity.createdAt}
            className="px-4 py-3"
          >
            <div className="flex min-w-0 gap-3">
              <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground">
                <HugeiconsIcon icon={Activity01Icon} strokeWidth={2} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm/5 text-foreground">
                  {activity.description}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {activity.jobTitle} / {activity.createdAt}
                </p>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </DashboardPanel>
  );
}

function DashboardLink({
  children,
  to,
}: {
  readonly children: React.ReactNode;
  readonly to: "/activity" | "/jobs" | "/jobs/new" | "/sites" | "/sites/new";
}) {
  return (
    <Link
      to={to}
      className="text-xs font-medium text-muted-foreground hover:text-foreground"
    >
      {children}
    </Link>
  );
}

function EmptyPanelMessage({
  description,
  title,
}: {
  readonly description: string;
  readonly title: string;
}) {
  return (
    <div className="px-4 py-8">
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="mt-1 max-w-[48ch] text-sm/6 text-muted-foreground">
        {description}
      </p>
    </div>
  );
}

function buildNextActions({
  dashboard,
  emailVerified,
}: {
  readonly dashboard: AuthenticatedHomeDashboard;
  readonly emailVerified: boolean;
}): readonly NextActionItem[] {
  const actions: NextActionItem[] = [];

  if (dashboard.jobs.stats.priorityWatchJobs > 0) {
    actions.push({
      badge: "Jobs",
      description: `${
        dashboard.jobs.stats.priorityWatchJobs
      } priority ${pluralizeNoun(
        dashboard.jobs.stats.priorityWatchJobs,
        "job"
      )} ready for review.`,
      href: "/jobs",
      key: "priority-work",
      title: "Review priority work",
    });
  }

  if (dashboard.jobs.stats.totalJobs === 0) {
    actions.push({
      badge: "Jobs",
      description: "Start the queue with a scheduled job.",
      href: "/jobs/new",
      key: "first-job",
      title: "Create the first job",
    });
  }

  if (dashboard.sites.stats.totalSites === 0) {
    actions.push({
      badge: "Sites",
      description: "Add locations before jobs start moving.",
      href: "/sites/new",
      key: "first-site",
      title: "Create the first site",
    });
  }

  if (!emailVerified) {
    actions.push({
      badge: "Account",
      description: "Confirm account email for trusted workspace actions.",
      href: "/settings",
      key: "verification",
      title: "Verify your email address",
    });
  }

  if (dashboard.members.total <= 1) {
    actions.push({
      badge: "Members",
      description: "Add dispatch, supervisors, or office staff.",
      href: "/members",
      key: "members",
      title: "Invite your team",
    });
  }

  if (actions.length === 0) {
    actions.push({
      badge: "Queue",
      description: "Open the active queue and keep work moving.",
      href: "/jobs",
      key: "jobs",
      title: "Review the jobs queue",
    });
  }

  return actions.slice(0, 4);
}

function pluralizeNoun(count: number, noun: string) {
  return count === 1 ? noun : `${noun}s`;
}

function getPanelId(title: string) {
  return title.toLowerCase().replaceAll(/\s+/g, "-");
}
