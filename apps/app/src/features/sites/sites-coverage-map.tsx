"use client";
import type { SiteOption } from "@ceird/sites-core";
import { Location01Icon, MapsLocation01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Link } from "@tanstack/react-router";
import * as React from "react";

import { Badge } from "#/components/ui/badge";
import { buttonVariants } from "#/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "#/components/ui/empty";
import { ScrollArea } from "#/components/ui/scroll-area";
import { Skeleton } from "#/components/ui/skeleton";
import { useCanRenderInteractiveMap } from "#/components/ui/use-can-render-interactive-map";
import {
  buildGoogleMapsUrl,
  buildSiteAddressLines,
  hasSiteCoordinates,
} from "#/features/sites/site-location";
import { createWorkspaceSheetSearch } from "#/features/workspace-sheets/workspace-sheet-search";
import { cn } from "#/lib/utils";

import { formatSiteActiveJobCount, SiteWorkSignal } from "./site-work-signal";

const SitesCoverageMapCanvas = React.lazy(async () => {
  const module = await import("./sites-coverage-map-canvas");

  return { default: module.SitesCoverageMapCanvas };
});

const DEFAULT_STATIC_FALLBACK_MARKER_POSITION = [50, 50] as const;

interface SitesCoverageMapProps {
  readonly sites: readonly SiteOption[];
}

export interface MappedSiteMapItem {
  readonly addressLines: readonly string[];
  readonly googleMapsUrl: string | null;
  readonly site: SiteOption & {
    readonly latitude: number;
    readonly longitude: number;
  };
}

export function SitesCoverageMap({ sites }: SitesCoverageMapProps) {
  const mappedSites = React.useMemo(
    () => buildMappedSiteMapItems(sites),
    [sites]
  );
  const unmappedSites = React.useMemo(
    () => sites.filter((site) => !hasSiteCoordinates(site)),
    [sites]
  );
  const canRenderInteractiveMap = useCanRenderInteractiveMap();
  const showSiteRail = mappedSites.length > 0 || unmappedSites.length > 0;

  return (
    <div
      aria-label="Site coverage map"
      className="flex h-[clamp(20rem,calc(100vh-24rem),42rem)] flex-col overflow-hidden rounded-2xl border bg-background"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-3 py-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <HugeiconsIcon icon={Location01Icon} strokeWidth={2} />
          <span>Map</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary">{mappedSites.length} mapped</Badge>
          <Badge variant={unmappedSites.length === 0 ? "secondary" : "outline"}>
            {unmappedSites.length} unmapped
          </Badge>
        </div>
      </div>

      <div
        className={cn(
          "grid min-h-0 flex-1 overflow-hidden",
          showSiteRail
            ? "grid-rows-[minmax(0,1fr)_minmax(0,18rem)] lg:grid-cols-[minmax(0,1fr)_minmax(18rem,22rem)] lg:grid-rows-1"
            : "grid-rows-1 lg:grid-cols-1"
        )}
      >
        <div className="min-h-0 overflow-hidden bg-muted/10">
          <SitesMapViewport
            canRenderInteractiveMap={canRenderInteractiveMap}
            mappedSites={mappedSites}
          />
        </div>

        {showSiteRail ? (
          <SitesMapSiteRail
            mappedSites={mappedSites}
            unmappedSites={unmappedSites}
          />
        ) : null}
      </div>
    </div>
  );
}

function SitesMapSiteRail({
  mappedSites,
  unmappedSites,
}: {
  readonly mappedSites: readonly MappedSiteMapItem[];
  readonly unmappedSites: readonly SiteOption[];
}) {
  return (
    <aside className="flex min-h-0 flex-col overflow-hidden border-t lg:border-t-0 lg:border-l">
      <ScrollArea
        className="min-h-0 flex-1"
        data-testid="sites-map-site-rail-scroll"
      >
        <div className="flex min-h-full flex-col">
          {mappedSites.length > 0 ? (
            <section className="flex flex-col">
              <div className="border-b px-3 py-2">
                <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  Mapped sites
                </h2>
              </div>
              <ul className="flex flex-col">
                {mappedSites.map((item) => (
                  <SitesMapSiteRailItem key={item.site.id} item={item} />
                ))}
              </ul>
            </section>
          ) : null}

          {unmappedSites.length > 0 ? (
            <section className="flex flex-col">
              <div className="border-b px-3 py-2">
                <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  Unverified location
                </h2>
              </div>
              <ul className="flex flex-col">
                {unmappedSites.slice(0, 10).map((site) => (
                  <SitesMapUnmappedRailItem key={site.id} site={site} />
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      </ScrollArea>
    </aside>
  );
}

function SitesMapSiteRailItem({ item }: { readonly item: MappedSiteMapItem }) {
  return (
    <li className="border-b last:border-b-0">
      <div className="flex flex-col gap-3 p-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <Link
              to="/sites"
              search={createWorkspaceSheetSearch({
                kind: "site.detail",
                siteId: item.site.id,
              })}
              className="block truncate rounded-sm text-sm font-medium underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              {item.site.name}
            </Link>
          </div>
          <Badge variant="secondary">Mapped</Badge>
        </div>

        <SiteWorkSignal site={item.site} />

        {item.addressLines.length > 0 ? (
          <div className="grid gap-1">
            {item.addressLines.map((line) => (
              <p key={line} className="text-sm text-muted-foreground">
                {line}
              </p>
            ))}
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <Link
            to="/sites"
            search={createWorkspaceSheetSearch({
              kind: "site.detail",
              siteId: item.site.id,
            })}
            className={buttonVariants({ size: "xs", variant: "ghost" })}
          >
            Open
          </Link>
          {item.googleMapsUrl ? (
            <a
              href={item.googleMapsUrl}
              target="_blank"
              rel="noreferrer"
              className={buttonVariants({ size: "xs", variant: "outline" })}
            >
              <HugeiconsIcon
                icon={MapsLocation01Icon}
                strokeWidth={2}
                data-icon="inline-start"
              />
              Maps
            </a>
          ) : null}
        </div>
      </div>
    </li>
  );
}

function SitesMapUnmappedRailItem({ site }: { readonly site: SiteOption }) {
  const addressLines = buildSiteAddressLines(site);
  const googleMapsUrl = buildGoogleMapsUrl(site);

  return (
    <li className="border-b last:border-b-0">
      <div className="flex flex-col gap-3 p-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <Link
              to="/sites"
              search={createWorkspaceSheetSearch({
                kind: "site.detail",
                siteId: site.id,
              })}
              className="block truncate rounded-sm text-sm font-medium underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              {site.name}
            </Link>
          </div>
          <Badge variant="outline">Unmapped</Badge>
        </div>

        {addressLines.length > 0 ? (
          <div className="grid gap-1">
            {addressLines.map((line) => (
              <p key={line} className="text-sm text-muted-foreground">
                {line}
              </p>
            ))}
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <Link
            to="/sites"
            search={createWorkspaceSheetSearch({
              kind: "site.detail",
              siteId: site.id,
            })}
            className={buttonVariants({ size: "xs", variant: "ghost" })}
          >
            Open
          </Link>
          {googleMapsUrl ? (
            <a
              href={googleMapsUrl}
              target="_blank"
              rel="noreferrer"
              className={buttonVariants({ size: "xs", variant: "outline" })}
            >
              <HugeiconsIcon
                icon={MapsLocation01Icon}
                strokeWidth={2}
                data-icon="inline-start"
              />
              Maps
            </a>
          ) : null}
        </div>
      </div>
    </li>
  );
}

function SitesMapViewport({
  canRenderInteractiveMap,
  mappedSites,
}: {
  readonly canRenderInteractiveMap: boolean;
  readonly mappedSites: readonly MappedSiteMapItem[];
}) {
  if (mappedSites.length === 0) {
    return (
      <Empty className="h-full min-h-0 rounded-none border-0 bg-muted/10 px-6 py-10">
        <EmptyHeader>
          <EmptyTitle>No mapped sites.</EmptyTitle>
          <EmptyDescription>
            Add coordinates to site addresses to make this view useful.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  if (!canRenderInteractiveMap) {
    return (
      <div
        className="relative h-full min-h-0 overflow-hidden bg-muted/10 p-4"
        data-testid="sites-map-static-fallback"
      >
        <div className="absolute inset-0 bg-[linear-gradient(to_right,var(--border)_1px,transparent_1px),linear-gradient(to_bottom,var(--border)_1px,transparent_1px)] bg-[size:4rem_4rem] opacity-30" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_25%,var(--muted)_0,transparent_18rem),radial-gradient(circle_at_70%_70%,var(--muted)_0,transparent_20rem)] opacity-60" />
        <div className="relative h-full min-h-0 rounded-xl border border-dashed bg-background/45">
          {mappedSites.slice(0, 12).map((item, index) => {
            const activeJobCount = item.site.activeJobCount ?? 0;
            const position =
              STATIC_FALLBACK_MARKER_POSITIONS[
                index % STATIC_FALLBACK_MARKER_POSITIONS.length
              ] ?? DEFAULT_STATIC_FALLBACK_MARKER_POSITION;

            return (
              <div
                key={item.site.id}
                className="absolute flex max-w-48 -translate-x-1/2 -translate-y-1/2 items-center gap-2"
                data-testid="sites-map-fallback-marker"
                style={{ left: `${position[0]}%`, top: `${position[1]}%` }}
              >
                <span
                  aria-label={`${item.site.name}${
                    activeJobCount > 0
                      ? `, ${formatSiteActiveJobCount(activeJobCount)}`
                      : ""
                  }`}
                  className="relative flex size-9 shrink-0 items-center justify-center rounded-full border border-primary/25 bg-primary text-primary-foreground shadow-sm"
                >
                  <HugeiconsIcon icon={MapsLocation01Icon} strokeWidth={2} />
                  {activeJobCount > 0 ? (
                    <span className="absolute -top-1 -right-1 flex min-w-5 justify-center rounded-full border border-background bg-background px-1 text-[0.625rem] leading-5 font-semibold text-primary shadow-sm">
                      {activeJobCount}
                    </span>
                  ) : null}
                </span>
                <span className="hidden max-w-36 min-w-0 truncate rounded-full border bg-background/90 px-2.5 py-1 text-xs font-medium shadow-sm sm:block">
                  {item.site.name}
                </span>
              </div>
            );
          })}
          {mappedSites.length > 12 ? (
            <Badge
              className="absolute right-3 bottom-3 bg-background/90"
              variant="outline"
            >
              +{mappedSites.length - 12} more
            </Badge>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <React.Suspense fallback={<CoverageMapLoadingState />}>
      <SitesCoverageMapCanvas sites={mappedSites} />
    </React.Suspense>
  );
}

const STATIC_FALLBACK_MARKER_POSITIONS = [
  [15, 28],
  [33, 36],
  [53, 25],
  [73, 38],
  [24, 58],
  [45, 68],
  [64, 56],
  [84, 66],
  [18, 78],
  [39, 18],
  [59, 82],
  [78, 18],
] as const;

function CoverageMapLoadingState() {
  return (
    <div className="flex h-full min-h-0 flex-col gap-4 bg-muted/10 p-4">
      <Skeleton className="h-6 w-44" />
      <Skeleton className="h-80 w-full rounded-2xl" />
      <div className="grid gap-3 sm:grid-cols-2">
        <Skeleton className="h-20 w-full rounded-2xl" />
        <Skeleton className="h-20 w-full rounded-2xl" />
      </div>
    </div>
  );
}

function buildMappedSiteMapItems(
  sites: readonly SiteOption[]
): readonly MappedSiteMapItem[] {
  return sites
    .flatMap((site) => {
      if (!hasSiteCoordinates(site)) {
        return [];
      }

      return [
        {
          addressLines: buildSiteAddressLines(site),
          googleMapsUrl: buildGoogleMapsUrl(site),
          site: {
            ...site,
            latitude: site.latitude,
            longitude: site.longitude,
          },
        } satisfies MappedSiteMapItem,
      ];
    })
    .toSorted((left, right) => left.site.name.localeCompare(right.site.name));
}
