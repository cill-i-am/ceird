"use client";

import type { ProximityOriginSummary } from "@ceird/proximity-core";
import type { SiteProximityRow } from "@ceird/sites-core";
import { MapsLocation01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import * as React from "react";

import {
  Map,
  MapControls,
  MapMarker,
  MapRouteLine,
  MarkerContent,
  MarkerLabel,
} from "#/components/ui/map";
import { RankBadge } from "#/features/proximity/proximity-result-row";
import { routeDisplayLineToMapCoordinates } from "#/features/proximity/route-display-line";

export function SitesProximityMap({
  origin,
  rows,
  selectedSiteId,
  onSelectedSiteIdChange,
}: {
  readonly origin: ProximityOriginSummary;
  readonly rows: readonly SiteProximityRow[];
  readonly selectedSiteId: string | null;
  readonly onSelectedSiteIdChange: (siteId: string) => void;
}) {
  const firstDestination = rows.find(
    (row) => row.site.latitude !== undefined && row.site.longitude !== undefined
  )?.site;
  const center = firstDestination
    ? [
        firstDestination.longitude ?? origin.coordinates.longitude,
        firstDestination.latitude ?? origin.coordinates.latitude,
      ]
    : [origin.coordinates.longitude, origin.coordinates.latitude];

  return (
    <div className="min-h-[360px] overflow-hidden rounded-lg border bg-muted/20">
      <Map
        center={center as [number, number]}
        zoom={11}
        dragRotate={false}
        pitchWithRotate={false}
        touchPitch={false}
      >
        <MapControls
          position="bottom-right"
          controls={["zoom", "fullscreen"]}
        />
        <MapMarker
          latitude={origin.coordinates.latitude}
          longitude={origin.coordinates.longitude}
        >
          <MarkerContent>
            <div className="flex size-9 items-center justify-center rounded-full border border-primary/30 bg-background text-primary shadow">
              <HugeiconsIcon icon={MapsLocation01Icon} strokeWidth={2} />
            </div>
            <MarkerLabel>Origin</MarkerLabel>
          </MarkerContent>
        </MapMarker>
        {rows.map((row, index) => {
          if (
            row.site.latitude === undefined ||
            row.site.longitude === undefined
          ) {
            return null;
          }

          const selected = selectedSiteId === row.site.id;
          const routeCoordinates = routeDisplayLineToMapCoordinates(
            row.routeLine
          );

          return (
            <React.Fragment key={row.site.id}>
              {routeCoordinates.length >= 2 ? (
                <MapRouteLine
                  id={`site-route-${row.site.id}`}
                  coordinates={routeCoordinates}
                  color={selected ? "#2563eb" : "#64748b"}
                  opacity={selected ? 0.95 : 0.45}
                  width={selected ? 5 : 3}
                />
              ) : null}
              <MapMarker
                latitude={row.site.latitude}
                longitude={row.site.longitude}
                onClick={() => onSelectedSiteIdChange(row.site.id)}
              >
                <MarkerContent
                  interactive
                  ariaLabel={`Select ${row.site.name}`}
                >
                  <RankBadge rank={index + 1} selected={selected} />
                  <MarkerLabel visibility="hover">{row.site.name}</MarkerLabel>
                </MarkerContent>
              </MapMarker>
            </React.Fragment>
          );
        })}
      </Map>
    </div>
  );
}
