"use client";

import { useAtomSet, useAtomValue } from "@effect-atom/atom-react";
import {
  Add01Icon,
  Location01Icon,
  MapsSquare01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Link, useNavigate } from "@tanstack/react-router";
import * as React from "react";

import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from "#/components/ui/alert";
import { Badge } from "#/components/ui/badge";
import { Button, buttonVariants } from "#/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "#/components/ui/empty";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "#/components/ui/table";
import { useRegisterCommandActions } from "#/features/command-bar/command-bar";
import type { CommandAction } from "#/features/command-bar/command-bar";
import {
  buildSiteAddressLines,
  hasSiteCoordinates,
} from "#/features/jobs/jobs-location";
import { jobsOptionsStateAtom } from "#/features/jobs/jobs-state";
import { hasJobsElevatedAccess } from "#/features/jobs/jobs-viewer";
import type { JobsViewer } from "#/features/jobs/jobs-viewer";

import { sitesNoticeAtom } from "./sites-state";

const SITE_COMMAND_LIMIT = 25;

export function SitesPage({
  children,
  viewer,
}: {
  readonly children?: React.ReactNode;
  readonly viewer: JobsViewer;
}) {
  const navigate = useNavigate({ from: "/sites" });
  const options = useAtomValue(jobsOptionsStateAtom).data;
  const notice = useAtomValue(sitesNoticeAtom);
  const setNotice = useAtomSet(sitesNoticeAtom);
  const canCreateSites = hasJobsElevatedAccess(viewer.role);
  const sitesPageCommandActions = React.useMemo<
    readonly CommandAction[]
  >(() => {
    const actions: CommandAction[] = options.sites
      .slice(0, SITE_COMMAND_LIMIT)
      .map((site) => ({
        group: "Sites",
        icon: Location01Icon,
        id: `sites-open-${site.id}`,
        keywords: [site.serviceAreaName, buildSiteAddressSummary(site)].filter(
          (value): value is string => typeof value === "string"
        ),
        priority: 60,
        run: () =>
          navigate({
            params: { siteId: site.id },
            to: "/sites/$siteId",
          }),
        scope: "route",
        subtitle: site.serviceAreaName ?? undefined,
        title: `Open ${site.name}`,
      }));

    if (canCreateSites) {
      actions.unshift({
        group: "Current page",
        icon: Add01Icon,
        id: "sites-create",
        priority: 80,
        run: () => navigate({ to: "/sites/new" }),
        scope: "route",
        title: "Create site",
      });
    }

    return actions;
  }, [canCreateSites, navigate, options.sites]);

  useRegisterCommandActions(sitesPageCommandActions);

  return (
    <main className="flex flex-1 flex-col gap-4 p-3 sm:p-4 lg:p-5">
      <header className="flex min-w-0 flex-wrap items-center justify-between gap-3 border-b pb-4">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <HugeiconsIcon icon={Location01Icon} strokeWidth={2} />
          </span>
          <h1 className="truncate font-heading text-xl font-medium">Sites</h1>
        </div>
        {canCreateSites ? (
          <Link to="/sites/new" className={buttonVariants({ size: "sm" })}>
            <HugeiconsIcon
              icon={Add01Icon}
              strokeWidth={2}
              data-icon="inline-start"
            />
            New site
          </Link>
        ) : null}
      </header>

      {notice ? (
        <Alert
          role="status"
          variant="success"
          className="animate-in py-2 pr-24 duration-150 fade-in-0 slide-in-from-top-1 motion-reduce:animate-none"
        >
          <HugeiconsIcon icon={Location01Icon} strokeWidth={2} />
          <AlertTitle className="truncate">{notice.name}</AlertTitle>
          <AlertDescription>
            Site {notice.kind === "updated" ? "updated" : "added"}.
          </AlertDescription>
          <AlertAction>
            <Button
              type="button"
              size="xs"
              variant="ghost"
              onClick={() => setNotice(null)}
            >
              Dismiss
            </Button>
          </AlertAction>
        </Alert>
      ) : null}

      {options.sites.length > 0 ? (
        <section className="min-h-0 overflow-hidden rounded-xl border bg-background">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Site</TableHead>
                <TableHead>Service area</TableHead>
                <TableHead>Address</TableHead>
                <TableHead className="w-28 text-right">Map</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {options.sites.map((site) => (
                <TableRow key={site.id}>
                  <TableCell className="font-medium">
                    <Link
                      to="/sites/$siteId"
                      params={{ siteId: site.id }}
                      className="rounded-sm underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                    >
                      {site.name}
                    </Link>
                  </TableCell>
                  <TableCell>
                    {site.serviceAreaName ? (
                      <Badge variant="secondary">{site.serviceAreaName}</Badge>
                    ) : (
                      <span className="text-muted-foreground">
                        No service area
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {buildSiteAddressSummary(site)}
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {hasSiteCoordinates(site) ? (
                      <span>Mapped</span>
                    ) : (
                      <span>Unmapped</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </section>
      ) : (
        <Empty className="min-h-[24rem] border-transparent bg-transparent">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <HugeiconsIcon icon={MapsSquare01Icon} strokeWidth={2} />
            </EmptyMedia>
            <EmptyTitle>No sites yet.</EmptyTitle>
            <EmptyDescription>
              Create a site before assigning jobs to a place.
            </EmptyDescription>
          </EmptyHeader>
          {canCreateSites ? (
            <EmptyContent>
              <Link to="/sites/new" className={buttonVariants({ size: "sm" })}>
                <HugeiconsIcon
                  icon={Add01Icon}
                  strokeWidth={2}
                  data-icon="inline-start"
                />
                New site
              </Link>
            </EmptyContent>
          ) : null}
        </Empty>
      )}

      {children}
    </main>
  );
}

function buildSiteAddressSummary(
  site: Parameters<typeof buildSiteAddressLines>[0]
) {
  const address = buildSiteAddressLines(site).join(", ");

  return address || "No address";
}
