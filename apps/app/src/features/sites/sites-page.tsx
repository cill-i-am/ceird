"use client";

import { useAtomSet, useAtomValue } from "@effect-atom/atom-react";
import {
  Add01Icon,
  Location01Icon,
  MapsSquare01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Link } from "@tanstack/react-router";
import * as React from "react";

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
import {
  buildSiteAddressLines,
  hasSiteCoordinates,
} from "#/features/jobs/jobs-location";
import { jobsOptionsStateAtom } from "#/features/jobs/jobs-state";
import { hasJobsElevatedAccess } from "#/features/jobs/jobs-viewer";
import type { JobsViewer } from "#/features/jobs/jobs-viewer";

import { sitesNoticeAtom } from "./sites-state";

export function SitesPage({
  children,
  viewer,
}: {
  readonly children?: React.ReactNode;
  readonly viewer: JobsViewer;
}) {
  const options = useAtomValue(jobsOptionsStateAtom).data;
  const notice = useAtomValue(sitesNoticeAtom);
  const setNotice = useAtomSet(sitesNoticeAtom);
  const canCreateSites = hasJobsElevatedAccess(viewer.role);

  return (
    <main className="flex flex-1 flex-col gap-4 p-3 sm:p-4 lg:p-5">
      <header className="flex min-w-0 flex-wrap items-center justify-between gap-3 border-b pb-4">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <HugeiconsIcon icon={Location01Icon} strokeWidth={2} />
          </span>
          <h1 className="truncate font-heading text-xl font-medium tracking-tight">
            Sites
          </h1>
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
        <div
          role="status"
          className="flex min-w-0 items-center justify-between gap-3 rounded-xl border bg-background px-3 py-2 text-sm shadow-xs"
        >
          <div className="flex min-w-0 items-center gap-2">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
              <HugeiconsIcon icon={Location01Icon} strokeWidth={2} />
            </span>
            <span className="truncate font-medium">{notice.name}</span>
            <span className="hidden text-muted-foreground sm:inline">
              added
            </span>
          </div>
          <Button
            type="button"
            size="xs"
            variant="ghost"
            onClick={() => setNotice(null)}
          >
            Dismiss
          </Button>
        </div>
      ) : null}

      {options.sites.length > 0 ? (
        <section className="min-h-0 overflow-hidden rounded-xl border bg-background">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Site</TableHead>
                <TableHead>Region</TableHead>
                <TableHead>Address</TableHead>
                <TableHead className="w-28 text-right">Pin</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {options.sites.map((site) => (
                <TableRow key={site.id}>
                  <TableCell className="font-medium">{site.name}</TableCell>
                  <TableCell>
                    {site.regionName ? (
                      <Badge variant="secondary">{site.regionName}</Badge>
                    ) : (
                      <span className="text-muted-foreground">No region</span>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {buildSiteAddressSummary(site)}
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">
                    {hasSiteCoordinates(site) ? (
                      <span>Mapped</span>
                    ) : (
                      <span>No pin</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </section>
      ) : (
        <Empty className="min-h-[24rem] rounded-xl border bg-background">
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
