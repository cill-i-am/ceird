"use client";
import { MapsLocation01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Link } from "@tanstack/react-router";
import * as React from "react";

import { Badge } from "#/components/ui/badge";
import { buttonVariants } from "#/components/ui/button";
import {
  Map,
  MapControls,
  MapFitBounds,
  MapMarker,
  MarkerContent,
  MarkerLabel,
  MarkerPopup,
} from "#/components/ui/map";
import {
  DEFAULT_SITE_MAP_CENTER,
  DEFAULT_SITE_MAP_ZOOM,
} from "#/features/sites/site-location";
import { openWorkspaceSheetSearch } from "#/features/workspace-sheets/workspace-sheet-search";

import type { MappedSiteMapItem } from "./sites-coverage-map";

export function SitesCoverageMapCanvas({
  sites,
}: {
  readonly sites: readonly MappedSiteMapItem[];
}) {
  const mapCoordinates = React.useMemo(
    () =>
      sites.map((item) => [item.site.longitude, item.site.latitude] as const),
    [sites]
  );

  return (
    <div className="h-full min-h-0">
      <Map
        center={[DEFAULT_SITE_MAP_CENTER[0], DEFAULT_SITE_MAP_CENTER[1]]}
        zoom={DEFAULT_SITE_MAP_ZOOM}
        dragRotate={false}
        pitchWithRotate={false}
        touchPitch={false}
      >
        <MapFitBounds
          coordinates={mapCoordinates}
          duration={600}
          maxZoom={12}
          padding={72}
          singleZoom={11}
        />
        <MapControls
          position="bottom-right"
          controls={["zoom", "fullscreen"]}
        />
        {sites.map((item) => (
          <MapMarker
            key={item.site.id}
            latitude={item.site.latitude}
            longitude={item.site.longitude}
          >
            <MarkerContent interactive ariaLabel={`Open ${item.site.name}`}>
              <div className="flex size-10 items-center justify-center rounded-full border border-primary/30 bg-primary text-primary-foreground shadow-lg">
                <HugeiconsIcon icon={MapsLocation01Icon} strokeWidth={2} />
              </div>
              <MarkerLabel visibility="hover">{item.site.name}</MarkerLabel>
            </MarkerContent>
            <MarkerPopup closeButton offset={24}>
              <div className="flex w-72 flex-col gap-3">
                <div className="flex flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{item.site.name}</p>
                    <Badge variant="secondary">Mapped</Badge>
                  </div>
                  {item.addressLines.map((line) => (
                    <p
                      key={line}
                      className="text-sm leading-6 text-muted-foreground"
                    >
                      {line}
                    </p>
                  ))}
                </div>

                <div className="flex flex-wrap gap-2">
                  <Link
                    to="/sites"
                    search={(current) =>
                      openWorkspaceSheetSearch(current, {
                        kind: "site.detail",
                        siteId: item.site.id,
                      })
                    }
                    className={buttonVariants({ size: "sm" })}
                  >
                    Open site
                  </Link>
                  {item.googleMapsUrl ? (
                    <a
                      href={item.googleMapsUrl}
                      target="_blank"
                      rel="noreferrer"
                      className={buttonVariants({
                        size: "sm",
                        variant: "outline",
                      })}
                    >
                      <HugeiconsIcon
                        icon={MapsLocation01Icon}
                        strokeWidth={2}
                        data-icon="inline-start"
                      />
                      Open in Google Maps
                    </a>
                  ) : null}
                </div>
              </div>
            </MarkerPopup>
          </MapMarker>
        ))}
      </Map>
    </div>
  );
}
