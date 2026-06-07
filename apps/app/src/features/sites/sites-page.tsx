"use client";
import type { ProximityLimit } from "@ceird/proximity-core";
import type { SitesOptionsResponse } from "@ceird/sites-core";
import {
  Add01Icon,
  ArrowRight01Icon,
  FilterHorizontalIcon,
  Location01Icon,
  MapPinCheckIcon,
  MapPinXIcon,
  MapsSquare01Icon,
  Search01Icon,
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
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "#/components/ui/input-group";
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
import { openWorkspaceSheetSearch } from "#/features/workspace-sheets/workspace-sheet-search";
import { useIsMobile } from "#/hooks/use-mobile";
import { ShortcutHint } from "#/hotkeys/hotkey-display";
import { HOTKEYS } from "#/hotkeys/hotkey-registry";
import { useAppHotkey, useAppHotkeySequence } from "#/hotkeys/use-app-hotkey";

import { SitesProximityPanel } from "./sites-proximity-panel";
import { useSitesNotice, useSitesOptions } from "./sites-state";

const SITE_COMMAND_LIMIT = 25;

type SiteDirectoryItem = SitesOptionsResponse["sites"][number];
interface SiteDirectoryViewItem {
  readonly addressSummary: string;
  readonly isMapped: boolean;
  readonly searchText: string;
  readonly site: SiteDirectoryItem;
}

export type SitesMapFilter = "all" | "mapped" | "unmapped";

// Route-level page coordinates filters, commands, responsive layout, and nested route outlet.
// react-doctor-disable-next-line
export function SitesPage({
  nearMeEnabled: controlledNearMeEnabled,
  onNearMeChange,
  onRouteLimitChange,
  routeHotkeysEnabled = true,
  routeLimit: controlledRouteLimit,
  viewer,
}: {
  readonly nearMeEnabled?: boolean | undefined;
  readonly onNearMeChange?: (value: boolean) => void;
  readonly onRouteLimitChange?: (value: ProximityLimit) => void;
  readonly routeHotkeysEnabled?: boolean;
  readonly routeLimit?: ProximityLimit | undefined;
  readonly viewer: OrganizationViewer;
}) {
  const navigate = useNavigate({ from: "/sites" });
  const options = useSitesOptions();
  const [notice, clearNotice] = useSitesNotice();
  const canCreateSites = hasOrganizationElevatedAccess(viewer.role);
  const isMobile = useIsMobile();
  const [uncontrolledNearMeEnabled, setUncontrolledNearMeEnabled] =
    React.useState(false);
  const nearMeEnabled = controlledNearMeEnabled ?? uncontrolledNearMeEnabled;
  const [uncontrolledRouteLimit, setUncontrolledRouteLimit] =
    React.useState<ProximityLimit>(10 as ProximityLimit);
  const routeLimit = controlledRouteLimit ?? uncontrolledRouteLimit;
  const [currentLocationRequestKey, requestCurrentLocation] = React.useReducer(
    (current: number) => current + 1,
    0
  );
  const [query, setQuery] = React.useState("");
  const [mapFilter, setMapFilter] = React.useState<SitesMapFilter>("all");
  const siteDirectoryItems = React.useMemo<readonly SiteDirectoryViewItem[]>(
    () =>
      options.sites.map((site) => {
        const addressSummary = buildSiteAddressSummary(site);
        const isMapped = hasSiteCoordinates(site);

        return {
          addressSummary,
          isMapped,
          searchText: normalizeSearchValue(
            [site.name, addressSummary].join(" ")
          ),
          site,
        };
      }),
    [options.sites]
  );
  const siteStats = React.useMemo(() => {
    let mappedSites = 0;

    for (const item of siteDirectoryItems) {
      if (item.isMapped) {
        mappedSites += 1;
      }
    }

    return {
      mappedSites,
      totalSites: siteDirectoryItems.length,
      unmappedSites: siteDirectoryItems.length - mappedSites,
    };
  }, [siteDirectoryItems]);
  const filteredSiteItems = React.useMemo(() => {
    const normalizedQuery = normalizeSearchValue(query);

    return siteDirectoryItems.filter(({ isMapped, searchText }) => {
      const matchesQuery =
        normalizedQuery.length === 0 || searchText.includes(normalizedQuery);
      const matchesMap =
        mapFilter === "all" ||
        (mapFilter === "mapped" && isMapped) ||
        (mapFilter === "unmapped" && !isMapped);

      return matchesQuery && matchesMap;
    });
  }, [mapFilter, query, siteDirectoryItems]);
  const hasFilters = query.trim().length > 0 || mapFilter !== "all";
  const createSite = React.useCallback(() => {
    navigate({
      search: (current) =>
        openWorkspaceSheetSearch(current, { kind: "site.create" }),
    });
  }, [navigate]);
  const openSite = React.useCallback(
    (siteId: SiteDirectoryItem["id"]) => {
      navigate({
        search: (current) =>
          openWorkspaceSheetSearch(current, { kind: "site.detail", siteId }),
      });
    },
    [navigate]
  );
  const setNearMeEnabled = React.useCallback(
    (nextEnabled: boolean) => {
      if (controlledNearMeEnabled === undefined) {
        setUncontrolledNearMeEnabled(nextEnabled);
      }

      onNearMeChange?.(nextEnabled);
    },
    [controlledNearMeEnabled, onNearMeChange]
  );
  const setRouteLimit = React.useCallback(
    (nextLimit: ProximityLimit) => {
      if (controlledRouteLimit === undefined) {
        setUncontrolledRouteLimit(nextLimit);
      }

      onRouteLimitChange?.(nextLimit);
    },
    [controlledRouteLimit, onRouteLimitChange]
  );
  const activateNearMeWithCurrentLocation = React.useCallback(() => {
    setNearMeEnabled(true);
    requestCurrentLocation();
  }, [requestCurrentLocation, setNearMeEnabled]);
  const clearFilters = React.useCallback(() => {
    setQuery("");
    setMapFilter("all");
  }, []);
  const sitesPageCommandActions = React.useMemo<
    readonly CommandAction[]
  >(() => {
    const actions: CommandAction[] = siteDirectoryItems
      .slice(0, SITE_COMMAND_LIMIT)
      .map(({ addressSummary, site }) => ({
        group: "Sites",
        icon: Location01Icon,
        id: `sites-open-${site.id}`,
        keywords: [addressSummary],
        priority: 60,
        run: () => openSite(site.id),
        scope: "route",
        subtitle: addressSummary,
        title: `Open ${site.name}`,
      }));

    if (canCreateSites && routeHotkeysEnabled) {
      actions.unshift({
        group: "Current page",
        icon: Add01Icon,
        id: "sites-create",
        priority: 80,
        run: createSite,
        scope: "route",
        shortcut: HOTKEYS.sitesCreate,
        title: "Create site",
      });
    }

    if (routeHotkeysEnabled) {
      actions.unshift({
        disabled: nearMeEnabled,
        group: "Current page",
        icon: Location01Icon,
        id: "sites-near-me",
        priority: 75,
        run: activateNearMeWithCurrentLocation,
        scope: "route",
        shortcut: HOTKEYS.sitesNearMe,
        title: "Rank sites near me",
      });
    }

    return actions;
  }, [
    activateNearMeWithCurrentLocation,
    canCreateSites,
    createSite,
    nearMeEnabled,
    openSite,
    routeHotkeysEnabled,
    siteDirectoryItems,
  ]);

  useRegisterCommandActions(sitesPageCommandActions);
  useAppHotkey("sitesCreate", createSite, {
    enabled: canCreateSites && routeHotkeysEnabled,
    ignoreInputs: true,
  });
  useAppHotkeySequence("sitesNearMe", activateNearMeWithCurrentLocation, {
    enabled: routeHotkeysEnabled && !nearMeEnabled,
  });

  return (
    <main className="flex flex-1 flex-col gap-4 p-3 sm:p-4 lg:p-5">
      <AppPageHeader
        title="Sites"
        leading={<HugeiconsIcon icon={Location01Icon} strokeWidth={2} />}
        actions={
          canCreateSites ? (
            <Link
              to="/sites"
              search={(current) =>
                openWorkspaceSheetSearch(current, { kind: "site.create" })
              }
              className={buttonVariants({ size: "sm" })}
            >
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
              onClick={clearNotice}
            >
              Dismiss
            </Button>
          </AlertAction>
        </Alert>
      ) : null}

      {options.sites.length > 0 ? (
        <SitesProximityPanel
          active={nearMeEnabled}
          currentLocationRequestKey={currentLocationRequestKey}
          limit={routeLimit}
          mapFilter={mapFilter}
          query={query}
          onActiveChange={setNearMeEnabled}
          onClearFilters={clearFilters}
          onLimitChange={setRouteLimit}
        >
          <SitesDirectorySection
            clearFilters={clearFilters}
            filteredSiteItems={filteredSiteItems}
            hasFilters={hasFilters}
            isMobile={isMobile}
            mapFilter={mapFilter}
            openSite={openSite}
            query={query}
            setMapFilter={setMapFilter}
            setQuery={setQuery}
            siteStats={siteStats}
          />
        </SitesProximityPanel>
      ) : (
        <Empty className="min-h-[24rem] border-transparent bg-transparent">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <HugeiconsIcon icon={MapsSquare01Icon} strokeWidth={2} />
            </EmptyMedia>
            <EmptyTitle>No sites in this workspace.</EmptyTitle>
            <EmptyDescription>
              Create a site to pin addresses and job locations.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
    </main>
  );
}

function SitesDirectorySection({
  clearFilters,
  filteredSiteItems,
  hasFilters,
  isMobile,
  mapFilter,
  openSite,
  query,
  setMapFilter,
  setQuery,
  siteStats,
}: {
  readonly clearFilters: () => void;
  readonly filteredSiteItems: readonly SiteDirectoryViewItem[];
  readonly hasFilters: boolean;
  readonly isMobile: boolean;
  readonly mapFilter: SitesMapFilter;
  readonly openSite: (siteId: SiteDirectoryItem["id"]) => void;
  readonly query: string;
  readonly setMapFilter: (filter: SitesMapFilter) => void;
  readonly setQuery: (query: string) => void;
  readonly siteStats: {
    readonly mappedSites: number;
    readonly totalSites: number;
    readonly unmappedSites: number;
  };
}) {
  return (
    <section aria-labelledby="sites-directory-heading" className="min-h-0">
      <div className="mb-3 flex flex-col gap-3">
        <h2
          id="sites-directory-heading"
          className="text-sm font-medium text-foreground"
        >
          Site directory
        </h2>

        <div className="flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
          <div className="grid min-w-0 gap-2 xl:w-[min(24rem,100%)]">
            <InputGroup>
              <InputGroupAddon>
                <HugeiconsIcon icon={Search01Icon} strokeWidth={2} />
              </InputGroupAddon>
              <InputGroupInput
                aria-label="Search sites"
                type="search"
                placeholder="Search sites..."
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </InputGroup>
          </div>

          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <SitesMapFilterButton
              active={mapFilter === "all"}
              count={siteStats.totalSites}
              label="All sites"
              onClick={() => setMapFilter("all")}
            />
            <SitesMapFilterButton
              active={mapFilter === "mapped"}
              count={siteStats.mappedSites}
              label="Mapped"
              onClick={() => setMapFilter("mapped")}
            />
            <SitesMapFilterButton
              active={mapFilter === "unmapped"}
              count={siteStats.unmappedSites}
              label="Unmapped"
              onClick={() => setMapFilter("unmapped")}
            />
            {hasFilters ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={clearFilters}
              >
                Clear
              </Button>
            ) : null}
          </div>
        </div>
      </div>

      <div className="min-h-0 overflow-hidden rounded-lg border bg-background">
        {isMobile ? (
          <SitesMobileDirectory items={filteredSiteItems} />
        ) : (
          <SitesDesktopDirectory
            items={filteredSiteItems}
            openSite={openSite}
          />
        )}

        {filteredSiteItems.length === 0 ? (
          <Empty className="min-h-72 border-transparent bg-transparent">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <HugeiconsIcon icon={FilterHorizontalIcon} strokeWidth={2} />
              </EmptyMedia>
              <EmptyTitle>No sites match these filters.</EmptyTitle>
              <EmptyDescription>
                Clear filters or search for another site or address.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : null}
      </div>
    </section>
  );
}

function SitesMobileDirectory({
  items,
}: {
  readonly items: readonly SiteDirectoryViewItem[];
}) {
  return (
    <ul aria-label="Sites mobile directory" className="divide-y">
      {items.map((item) => (
        <SiteDirectoryCard key={item.site.id} item={item} />
      ))}
    </ul>
  );
}

function SitesDesktopDirectory({
  items,
  openSite,
}: {
  readonly items: readonly SiteDirectoryViewItem[];
  readonly openSite: (siteId: SiteDirectoryItem["id"]) => void;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Site</TableHead>
          <TableHead className="w-10">
            <span className="sr-only">Open</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map(({ addressSummary, isMapped, site }) => (
          <TableRow
            key={site.id}
            aria-label={`Open ${site.name}`}
            tabIndex={0}
            className="cursor-pointer"
            onClick={() => openSite(site.id)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                openSite(site.id);
              }
            }}
          >
            <TableCell>
              <div className="flex min-w-0 items-center gap-2">
                <SiteMapIndicator isMapped={isMapped} />
                <div className="min-w-0">
                  <Link
                    to="/sites"
                    search={(current) =>
                      openWorkspaceSheetSearch(current, {
                        kind: "site.detail",
                        siteId: site.id,
                      })
                    }
                    className="block truncate font-medium text-foreground outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                    onClick={(event) => event.stopPropagation()}
                  >
                    {site.name}
                  </Link>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {addressSummary}
                  </p>
                </div>
              </div>
            </TableCell>
            <TableCell className="text-right text-muted-foreground">
              <HugeiconsIcon
                icon={ArrowRight01Icon}
                strokeWidth={2}
                aria-hidden
              />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function SiteDirectoryCard({ item }: { readonly item: SiteDirectoryViewItem }) {
  const { addressSummary, isMapped, site } = item;

  return (
    <li>
      <Link
        to="/sites"
        search={(current) =>
          openWorkspaceSheetSearch(current, {
            kind: "site.detail",
            siteId: site.id,
          })
        }
        className="group block px-3 py-3 transition-colors outline-none hover:bg-muted/30 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset sm:px-4"
      >
        <div className="flex min-w-0 items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-2">
              <span className="truncate font-medium text-foreground">
                {site.name}
              </span>
              <SiteMapIndicator isMapped={isMapped} size="compact" />
            </div>
            <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
              {addressSummary}
            </p>
          </div>
          <HugeiconsIcon
            icon={ArrowRight01Icon}
            strokeWidth={2}
            className="shrink-0 text-muted-foreground"
            aria-hidden
          />
        </div>
      </Link>
    </li>
  );
}

function SitesMapFilterButton({
  active,
  count,
  label,
  onClick,
}: {
  readonly active: boolean;
  readonly count: number;
  readonly label: string;
  readonly onClick: () => void;
}) {
  return (
    <Button
      type="button"
      size="sm"
      variant={active ? "default" : "outline"}
      aria-pressed={active}
      aria-label={`${label} ${count}`}
      onClick={onClick}
    >
      {label}
      <Badge variant={active ? "secondary" : "outline"}>{count}</Badge>
    </Button>
  );
}

function SiteMapIndicator({
  isMapped,
  size = "default",
}: {
  readonly isMapped: boolean;
  readonly size?: "compact" | "default";
}) {
  return (
    <span
      aria-label={isMapped ? "Map ready" : "Map coordinates missing"}
      className={
        isMapped
          ? "flex size-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary"
          : "flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground"
      }
      title={isMapped ? "Map ready" : "Map coordinates missing"}
    >
      <HugeiconsIcon
        icon={isMapped ? MapPinCheckIcon : MapPinXIcon}
        strokeWidth={2}
        className={size === "compact" ? "size-4" : undefined}
        aria-hidden
      />
    </span>
  );
}

function buildSiteAddressSummary(
  site: Parameters<typeof buildSiteAddressLines>[0]
) {
  const address = buildSiteAddressLines(site).join(", ");

  return address || "No address";
}

function normalizeSearchValue(value: string) {
  return value.trim().toLocaleLowerCase("en-IE");
}
