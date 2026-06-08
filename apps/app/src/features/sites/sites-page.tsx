"use client";
import type { ProximityLimit } from "@ceird/proximity-core";
import type { SitesOptionsResponse } from "@ceird/sites-core";
import {
  Add01Icon,
  ArrowRight01Icon,
  Cancel01Icon,
  FilterHorizontalIcon,
  LeftToRightListBulletIcon,
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
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "#/components/ui/tooltip";
import { useRegisterCommandActions } from "#/features/command-bar/command-bar";
import type { CommandAction } from "#/features/command-bar/command-bar";
import { hasOrganizationElevatedAccess } from "#/features/organizations/organization-viewer";
import type { OrganizationViewer } from "#/features/organizations/organization-viewer";
import { ProximityLimitSelect } from "#/features/proximity/proximity-limit-select";
import type { ProximityResultLimitOption } from "#/features/proximity/proximity-state";
import {
  buildSiteAddressLines,
  hasSiteCoordinates,
} from "#/features/sites/site-location";
import { openWorkspaceSheetSearch } from "#/features/workspace-sheets/workspace-sheet-search";
import { useIsMobile } from "#/hooks/use-mobile";
import { ShortcutHint } from "#/hotkeys/hotkey-display";
import { HOTKEYS } from "#/hotkeys/hotkey-registry";
import { useAppHotkey, useAppHotkeySequence } from "#/hotkeys/use-app-hotkey";
import { cn } from "#/lib/utils";

import { SitesProximityPanel } from "./sites-proximity-panel";
import type { SitesViewMode } from "./sites-search";
import { useSitesNotice, useSitesOptions } from "./sites-state";

const SITE_COMMAND_LIMIT = 25;

const SitesCoverageMap = React.lazy(async () => {
  const module = await import("./sites-coverage-map");

  return { default: module.SitesCoverageMap };
});

type SiteDirectoryItem = SitesOptionsResponse["sites"][number];
interface SiteDirectoryViewItem {
  readonly addressSummary: string;
  readonly isMapped: boolean;
  readonly searchText: string;
  readonly site: SiteDirectoryItem;
}

export type SitesMapFilter = "all" | "mapped" | "unmapped";

interface SitesPageLocalState {
  readonly mapFilter: SitesMapFilter;
  readonly nearMeEnabled: boolean;
  readonly query: string;
  readonly routeLimit: ProximityLimit;
  readonly viewMode: SitesViewMode;
}

type SitesPageLocalStateAction =
  | { readonly type: "clear_filters" }
  | { readonly mapFilter: SitesMapFilter; readonly type: "set_map_filter" }
  | { readonly nearMeEnabled: boolean; readonly type: "set_near_me" }
  | { readonly query: string; readonly type: "set_query" }
  | { readonly routeLimit: ProximityLimit; readonly type: "set_route_limit" }
  | { readonly viewMode: SitesViewMode; readonly type: "set_view_mode" };

const initialSitesPageLocalState = {
  mapFilter: "all",
  nearMeEnabled: false,
  query: "",
  routeLimit: 10 as ProximityLimit,
  viewMode: "list",
} satisfies SitesPageLocalState;

function sitesPageLocalStateReducer(
  state: SitesPageLocalState,
  action: SitesPageLocalStateAction
): SitesPageLocalState {
  switch (action.type) {
    case "clear_filters": {
      return { ...state, mapFilter: "all", query: "" };
    }
    case "set_map_filter": {
      return { ...state, mapFilter: action.mapFilter };
    }
    case "set_near_me": {
      return { ...state, nearMeEnabled: action.nearMeEnabled };
    }
    case "set_query": {
      return { ...state, query: action.query };
    }
    case "set_route_limit": {
      return { ...state, routeLimit: action.routeLimit };
    }
    case "set_view_mode": {
      return { ...state, viewMode: action.viewMode };
    }
    default: {
      return state;
    }
  }
}

// Route-level page coordinates filters, commands, responsive layout, and nested route outlet.
// react-doctor-disable-next-line
export function SitesPage({
  nearMeEnabled: controlledNearMeEnabled,
  onNearMeChange,
  onRouteLimitChange,
  onViewModeChange,
  routeHotkeysEnabled = true,
  routeLimit: controlledRouteLimit,
  routeProximityLocationEnabled = false,
  viewMode: controlledViewMode,
  viewer,
}: {
  readonly nearMeEnabled?: boolean | undefined;
  readonly onNearMeChange?: (value: boolean) => void;
  readonly onRouteLimitChange?: (value: ProximityLimit) => void;
  readonly onViewModeChange?: (value: SitesViewMode) => void;
  readonly routeHotkeysEnabled?: boolean;
  readonly routeLimit?: ProximityLimit | undefined;
  readonly routeProximityLocationEnabled?: boolean | undefined;
  readonly viewMode?: SitesViewMode | undefined;
  readonly viewer: OrganizationViewer;
}) {
  const navigate = useNavigate({ from: "/sites" });
  const [localState, dispatchLocalState] = React.useReducer(
    sitesPageLocalStateReducer,
    initialSitesPageLocalState
  );
  const viewMode = controlledViewMode ?? localState.viewMode;
  const options = useSitesOptions();
  const [notice, clearNotice] = useSitesNotice();
  const canCreateSites = hasOrganizationElevatedAccess(viewer.role);
  const isMobile = useIsMobile();
  const nearMeEnabled = controlledNearMeEnabled ?? localState.nearMeEnabled;
  const routeLimit = controlledRouteLimit ?? localState.routeLimit;
  const [currentLocationRequestKey, requestCurrentLocation] = React.useReducer(
    (current: number) => current + 1,
    0
  );
  const { mapFilter, query } = localState;
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
  const filteredSites = React.useMemo(
    () => filteredSiteItems.map((item) => item.site),
    [filteredSiteItems]
  );
  const hasFilters = query.trim().length > 0 || mapFilter !== "all";
  const setViewMode = React.useCallback(
    (nextViewMode: SitesViewMode) => {
      if (nextViewMode === viewMode) {
        return;
      }

      if (controlledViewMode === undefined) {
        dispatchLocalState({
          type: "set_view_mode",
          viewMode: nextViewMode,
        });
      }

      onViewModeChange?.(nextViewMode);
    },
    [controlledViewMode, onViewModeChange, viewMode]
  );
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
        dispatchLocalState({
          nearMeEnabled: nextEnabled,
          type: "set_near_me",
        });
      }

      onNearMeChange?.(nextEnabled);
    },
    [controlledNearMeEnabled, onNearMeChange]
  );
  const setRouteLimit = React.useCallback(
    (nextLimit: ProximityLimit) => {
      if (controlledRouteLimit === undefined) {
        dispatchLocalState({
          routeLimit: nextLimit,
          type: "set_route_limit",
        });
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
    dispatchLocalState({ type: "clear_filters" });
  }, []);
  const setQuery = React.useCallback((nextQuery: string) => {
    dispatchLocalState({ query: nextQuery, type: "set_query" });
  }, []);
  const setMapFilter = React.useCallback((nextMapFilter: SitesMapFilter) => {
    dispatchLocalState({
      mapFilter: nextMapFilter,
      type: "set_map_filter",
    });
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
      actions.unshift(
        {
          disabled: viewMode === "list",
          group: "Current page",
          icon: LeftToRightListBulletIcon,
          id: "sites-switch-list-view",
          priority: 70,
          run: () => setViewMode("list"),
          scope: "route",
          shortcut: HOTKEYS.sitesListView,
          title: "Switch to list view",
        },
        {
          disabled: viewMode === "map",
          group: "Current page",
          icon: MapsSquare01Icon,
          id: "sites-switch-map-view",
          priority: 60,
          run: () => setViewMode("map"),
          scope: "route",
          shortcut: HOTKEYS.sitesMapView,
          title: "Switch to map view",
        },
        {
          disabled: nearMeEnabled,
          group: "Current page",
          icon: Location01Icon,
          id: "sites-near-me",
          priority: 75,
          run: activateNearMeWithCurrentLocation,
          scope: "route",
          shortcut: HOTKEYS.sitesNearMe,
          title: "Rank sites near me",
        }
      );
    }

    return actions;
  }, [
    activateNearMeWithCurrentLocation,
    canCreateSites,
    createSite,
    nearMeEnabled,
    openSite,
    routeHotkeysEnabled,
    setViewMode,
    siteDirectoryItems,
    viewMode,
  ]);

  useRegisterCommandActions(sitesPageCommandActions);
  useAppHotkey("sitesCreate", createSite, {
    enabled: canCreateSites && routeHotkeysEnabled,
    ignoreInputs: true,
  });
  useAppHotkeySequence("sitesNearMe", activateNearMeWithCurrentLocation, {
    enabled: routeHotkeysEnabled && !nearMeEnabled,
  });
  useAppHotkeySequence(
    "sitesListView",
    () => {
      setViewMode("list");
    },
    { enabled: routeHotkeysEnabled }
  );
  useAppHotkeySequence(
    "sitesMapView",
    () => {
      setViewMode("map");
    },
    { enabled: routeHotkeysEnabled }
  );

  return (
    <main className="flex flex-1 flex-col gap-4 p-3 sm:p-4 lg:p-5">
      <AppPageHeader
        title="Sites"
        leading={<HugeiconsIcon icon={Location01Icon} strokeWidth={2} />}
        actions={
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <ViewModeSwitch value={viewMode} onValueChange={setViewMode} />
            {canCreateSites ? (
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
            ) : null}
          </div>
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
          routeProximityLocationEnabled={routeProximityLocationEnabled}
          onActiveChange={setNearMeEnabled}
          onClearFilters={clearFilters}
          onLimitChange={setRouteLimit}
          showToolbar={false}
          viewMode={viewMode}
        >
          <SitesDirectorySection
            clearFilters={clearFilters}
            filteredSiteItems={filteredSiteItems}
            filteredSites={filteredSites}
            hasFilters={hasFilters}
            isMobile={isMobile}
            mapFilter={mapFilter}
            openSite={openSite}
            proximityControl={
              <SitesProximityFilterControl
                active={nearMeEnabled}
                limit={routeLimit}
                onDisableNearMe={() => setNearMeEnabled(false)}
                onEnableNearMe={activateNearMeWithCurrentLocation}
                onLimitChange={setRouteLimit}
              />
            }
            query={query}
            setMapFilter={setMapFilter}
            setQuery={setQuery}
            siteStats={siteStats}
            viewMode={viewMode}
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
  filteredSites,
  hasFilters,
  isMobile,
  mapFilter,
  openSite,
  proximityControl,
  query,
  setMapFilter,
  setQuery,
  siteStats,
  viewMode,
}: {
  readonly clearFilters: () => void;
  readonly filteredSiteItems: readonly SiteDirectoryViewItem[];
  readonly filteredSites: readonly SiteDirectoryItem[];
  readonly hasFilters: boolean;
  readonly isMobile: boolean;
  readonly mapFilter: SitesMapFilter;
  readonly openSite: (siteId: SiteDirectoryItem["id"]) => void;
  readonly proximityControl: React.ReactNode;
  readonly query: string;
  readonly setMapFilter: (filter: SitesMapFilter) => void;
  readonly setQuery: (query: string) => void;
  readonly siteStats: {
    readonly mappedSites: number;
    readonly totalSites: number;
    readonly unmappedSites: number;
  };
  readonly viewMode: SitesViewMode;
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
            {proximityControl}
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

      {viewMode === "list" ? (
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
      ) : (
        <section data-testid="sites-coverage-panel" className="min-h-0">
          <React.Suspense fallback={<SitesCoverageMapFallback />}>
            <SitesCoverageMap sites={filteredSites} />
          </React.Suspense>
        </section>
      )}
    </section>
  );
}

function SitesCoverageMapFallback() {
  return (
    <div
      aria-label="Loading site map view"
      className="min-h-[420px] rounded-2xl border bg-muted/10"
    />
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

function SitesProximityFilterControl({
  active,
  limit,
  onDisableNearMe,
  onEnableNearMe,
  onLimitChange,
}: {
  readonly active: boolean;
  readonly limit: ProximityLimit;
  readonly onDisableNearMe: () => void;
  readonly onEnableNearMe: () => void;
  readonly onLimitChange: (limit: ProximityResultLimitOption) => void;
}) {
  const label = active
    ? "Stop ranking sites by driving time"
    : "Rank sites by driving time from your current location";

  return (
    <div className="flex shrink-0 items-center gap-2">
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              type="button"
              size="sm"
              variant={active ? "default" : "outline"}
              className={cn(!active && "bg-background")}
              aria-pressed={active}
              onClick={active ? onDisableNearMe : onEnableNearMe}
            />
          }
        >
          <HugeiconsIcon
            icon={active ? Cancel01Icon : Location01Icon}
            strokeWidth={2}
            data-icon="inline-start"
          />
          Near me
        </TooltipTrigger>
        <TooltipContent>
          <span>{label}</span>
          {active ? null : (
            <ShortcutHint
              hotkey={HOTKEYS.sitesNearMe.hotkey}
              label={HOTKEYS.sitesNearMe.label}
            />
          )}
        </TooltipContent>
      </Tooltip>
      <ProximityLimitSelect
        disabled={!active}
        id="sites-toolbar-route-limit"
        value={limit}
        onLimitChange={onLimitChange}
      />
    </div>
  );
}

function ViewModeSwitch({
  onValueChange,
  value,
}: {
  readonly onValueChange: (value: SitesViewMode) => void;
  readonly value: SitesViewMode;
}) {
  const nextView = value === "list" ? "map" : "list";
  const label = nextView === "map" ? "Map" : "List";
  const icon =
    nextView === "map" ? MapsSquare01Icon : LeftToRightListBulletIcon;

  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      className="bg-background"
      onClick={() => onValueChange(nextView)}
    >
      <HugeiconsIcon icon={icon} strokeWidth={2} data-icon="inline-start" />
      {label}
    </Button>
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
