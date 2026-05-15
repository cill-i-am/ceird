"use client";
import type { SitesOptionsResponse } from "@ceird/sites-core";
import { useAtomSet, useAtomValue } from "@effect-atom/atom-react";
import {
  Add01Icon,
  Location01Icon,
  MapsSquare01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Link, useNavigate } from "@tanstack/react-router";
import * as React from "react";

import { AppPageHeader } from "#/components/app-page-header";
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
import { hasOrganizationElevatedAccess } from "#/features/organizations/organization-viewer";
import type { OrganizationViewer } from "#/features/organizations/organization-viewer";
import {
  buildSiteAddressLines,
  hasSiteCoordinates,
} from "#/features/sites/site-location";
import { ShortcutHint } from "#/hotkeys/hotkey-display";
import { HOTKEYS } from "#/hotkeys/hotkey-registry";
import { useAppHotkey } from "#/hotkeys/use-app-hotkey";

import { sitesNoticeAtom, sitesOptionsStateAtom } from "./sites-state";

const SITE_COMMAND_LIMIT = 25;

export function SitesPage({
  children,
  viewer,
}: {
  readonly children?: React.ReactNode;
  readonly viewer: OrganizationViewer;
}) {
  const navigate = useNavigate({ from: "/sites" });
  const options = useAtomValue(sitesOptionsStateAtom).data;
  const notice = useAtomValue(sitesNoticeAtom);
  const setNotice = useAtomSet(sitesNoticeAtom);
  const canCreateSites = hasOrganizationElevatedAccess(viewer.role);
  const siteStats = React.useMemo(
    () => ({
      mappedSites: options.sites.filter((site) => hasSiteCoordinates(site))
        .length,
      totalSites: options.sites.length,
    }),
    [options.sites]
  );
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
        shortcut: HOTKEYS.sitesCreate,
        title: "Create site",
      });
    }

    return actions;
  }, [canCreateSites, navigate, options.sites]);

  useRegisterCommandActions(sitesPageCommandActions);
  useAppHotkey(
    "sitesCreate",
    () => {
      navigate({ to: "/sites/new" });
    },
    {
      enabled: canCreateSites,
      ignoreInputs: true,
    }
  );

  return (
    <main className="flex flex-1 flex-col gap-4 p-3 sm:p-4 lg:p-5">
      <AppPageHeader
        title="Sites"
        leading={<HugeiconsIcon icon={Location01Icon} strokeWidth={2} />}
        actions={
          canCreateSites ? (
            <Link to="/sites/new" className={buttonVariants({ size: "sm" })}>
              <HugeiconsIcon
                icon={Add01Icon}
                strokeWidth={2}
                data-icon="inline-start"
              />
              New site
              <ShortcutHint
                surface="button"
                hotkey={HOTKEYS.sitesCreate.hotkey}
                label={HOTKEYS.sitesCreate.label}
                decorative
              />
            </Link>
          ) : null
        }
      />

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
        <section
          aria-labelledby="sites-directory-heading"
          className="min-h-0 overflow-hidden rounded-2xl border bg-background"
        >
          <div className="flex items-center justify-between gap-3 border-b px-3 py-3 sm:px-4">
            <div className="flex min-w-0 items-center gap-2">
              <h2
                id="sites-directory-heading"
                className="text-sm font-medium text-foreground"
              >
                Site directory
              </h2>
              <span className="text-xs text-muted-foreground tabular-nums">
                {siteStats.totalSites}
              </span>
            </div>
            <p className="shrink-0 text-xs text-muted-foreground">
              {siteStats.mappedSites} mapped / {siteStats.totalSites} total
            </p>
          </div>
          <ul
            aria-label="Sites mobile directory"
            className="divide-y md:hidden"
          >
            {options.sites.map((site) => (
              <SiteDirectoryCard key={site.id} site={site} />
            ))}
          </ul>
          <div className="hidden md:block">
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
                        <Badge variant="secondary">
                          {site.serviceAreaName}
                        </Badge>
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
                      <SiteMapBadge site={site} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </section>
      ) : (
        <Empty className="min-h-[24rem] border-transparent bg-transparent">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <HugeiconsIcon icon={MapsSquare01Icon} strokeWidth={2} />
            </EmptyMedia>
            <EmptyTitle>No sites in this workspace.</EmptyTitle>
            <EmptyDescription>
              Create a site to pin addresses, service areas, and job locations.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}

      {children}
    </main>
  );
}

type SiteDirectoryItem = SitesOptionsResponse["sites"][number];

function SiteDirectoryCard({ site }: { readonly site: SiteDirectoryItem }) {
  return (
    <li>
      <Link
        to="/sites/$siteId"
        params={{ siteId: site.id }}
        className="group block px-3 py-3 transition-colors outline-none hover:bg-muted/30 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset sm:px-4"
      >
        <div className="flex min-w-0 items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-2">
              <span className="truncate font-medium text-foreground">
                {site.name}
              </span>
              <HugeiconsIcon
                icon={Location01Icon}
                strokeWidth={2}
                className="shrink-0 text-muted-foreground"
              />
            </div>
            <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
              {buildSiteAddressSummary(site)}
            </p>
          </div>
          <SiteMapBadge site={site} />
        </div>
        <div className="mt-3 flex min-w-0 flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span className="font-medium">Service area</span>
          {site.serviceAreaName ? (
            <Badge variant="secondary">{site.serviceAreaName}</Badge>
          ) : (
            <span>No service area</span>
          )}
        </div>
      </Link>
    </li>
  );
}

function SiteMapBadge({ site }: { readonly site: SiteDirectoryItem }) {
  return hasSiteCoordinates(site) ? (
    <Badge variant="secondary">Mapped</Badge>
  ) : (
    <Badge variant="outline">Unmapped</Badge>
  );
}

function buildSiteAddressSummary(
  site: Parameters<typeof buildSiteAddressLines>[0]
) {
  const address = buildSiteAddressLines(site).join(", ");

  return address || "No address";
}
