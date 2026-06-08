"use client";

import type { ProximityCoordinates } from "@ceird/proximity-core";
import { MapsLocation01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import MapLibreGL from "maplibre-gl";
import * as React from "react";

import {
  Map,
  MapControls,
  MapMarker,
  MapRouteLine,
  MarkerContent,
  MarkerLabel,
  useMap,
} from "#/components/ui/map";
import type { MapLineCoordinate } from "#/features/proximity/route-display-line";

export function AgentRoutePreviewMap({
  destination,
  origin,
  routeCoordinates,
}: {
  readonly destination: ProximityCoordinates;
  readonly origin: ProximityCoordinates;
  readonly routeCoordinates: readonly MapLineCoordinate[];
}) {
  const centerCoordinate = routeCoordinates.at(
    Math.floor(routeCoordinates.length / 2)
  );
  const center: [number, number] =
    centerCoordinate === undefined
      ? [destination.longitude, destination.latitude]
      : [centerCoordinate[0], centerCoordinate[1]];

  return (
    <div className="h-52 overflow-hidden rounded-md border bg-muted/20">
      <Map
        center={center}
        zoom={12}
        dragRotate={false}
        pitchWithRotate={false}
        touchPitch={false}
      >
        <FitRouteBounds coordinates={routeCoordinates} />
        <MapControls position="bottom-right" controls={["zoom"]} />
        <MapRouteLine
          id="agent-route-preview"
          coordinates={routeCoordinates}
          color="#2563eb"
          opacity={0.95}
          width={4}
        />
        <MapMarker latitude={origin.latitude} longitude={origin.longitude}>
          <MarkerContent>
            <div className="flex size-8 items-center justify-center rounded-full border border-primary/30 bg-background text-primary shadow">
              <HugeiconsIcon icon={MapsLocation01Icon} strokeWidth={2} />
            </div>
            <MarkerLabel>Origin</MarkerLabel>
          </MarkerContent>
        </MapMarker>
        <MapMarker
          latitude={destination.latitude}
          longitude={destination.longitude}
        >
          <MarkerContent>
            <div className="flex size-8 items-center justify-center rounded-full border border-border bg-foreground text-background shadow">
              <HugeiconsIcon icon={MapsLocation01Icon} strokeWidth={2} />
            </div>
            <MarkerLabel>Destination</MarkerLabel>
          </MarkerContent>
        </MapMarker>
      </Map>
    </div>
  );
}

function FitRouteBounds({
  coordinates,
}: {
  readonly coordinates: readonly MapLineCoordinate[];
}) {
  const { isLoaded, map } = useMap();

  React.useEffect(() => {
    if (!isLoaded || map === null || coordinates.length < 2) {
      return;
    }

    const bounds = new MapLibreGL.LngLatBounds();

    for (const coordinate of coordinates) {
      bounds.extend([coordinate[0], coordinate[1]]);
    }

    map.fitBounds(bounds, {
      duration: 0,
      maxZoom: 15,
      padding: 36,
    });
  }, [coordinates, isLoaded, map]);

  return null;
}
