"use client";

import type { JobProximityRow } from "@ceird/jobs-core";
import type { ProximityOriginSummary } from "@ceird/proximity-core";
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

export function JobsProximityMap({
  origin,
  rows,
  selectedJobId,
  onSelectedJobIdChange,
}: {
  readonly origin: ProximityOriginSummary;
  readonly rows: readonly JobProximityRow[];
  readonly selectedJobId: string | null;
  readonly onSelectedJobIdChange: (jobId: string) => void;
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

          const selected = selectedJobId === row.job.id;
          const routeCoordinates = routeDisplayLineToMapCoordinates(
            row.routeLine
          );

          return (
            <React.Fragment key={row.job.id}>
              {routeCoordinates.length >= 2 ? (
                <MapRouteLine
                  id={`job-route-${row.job.id}`}
                  coordinates={routeCoordinates}
                  color={selected ? "#2563eb" : "#64748b"}
                  opacity={selected ? 0.95 : 0.45}
                  width={selected ? 5 : 3}
                />
              ) : null}
              <MapMarker
                latitude={row.site.latitude}
                longitude={row.site.longitude}
                onClick={() => onSelectedJobIdChange(row.job.id)}
              >
                <MarkerContent
                  interactive
                  ariaLabel={`Select ${row.job.title}`}
                >
                  <RankBadge rank={index + 1} selected={selected} />
                  <MarkerLabel visibility="hover">{row.job.title}</MarkerLabel>
                </MarkerContent>
              </MapMarker>
            </React.Fragment>
          );
        })}
      </Map>
    </div>
  );
}
