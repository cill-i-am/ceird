"use client";

import { Location01Icon, MapsGlobal01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import * as React from "react";

import { Button } from "#/components/ui/button";
import {
  Map,
  MapControls,
  MapMarker,
  MarkerContent,
  MarkerLabel,
  useMap,
} from "#/components/ui/map";
import { cn } from "#/lib/utils";

import {
  DEFAULT_JOBS_MAP_CENTER,
  DEFAULT_JOBS_MAP_ZOOM,
} from "./jobs-location";

const FALLBACK_PIN = {
  latitude: DEFAULT_JOBS_MAP_CENTER[1],
  longitude: DEFAULT_JOBS_MAP_CENTER[0],
};
const PIN_NUDGE_STEP = 0.0005;

export function JobsSitePinPickerCanvas(props: {
  readonly latitude?: number;
  readonly longitude?: number;
  readonly onChange: (next: {
    readonly latitude: number;
    readonly longitude: number;
  }) => void;
}) {
  const hasCoordinates =
    typeof props.latitude === "number" && typeof props.longitude === "number";
  const pin = hasCoordinates
    ? {
        latitude: props.latitude,
        longitude: props.longitude,
      }
    : FALLBACK_PIN;

  return (
    <div className="overflow-hidden rounded-2xl border bg-muted/10">
      <div className="flex items-center gap-2 border-b px-4 py-3 text-sm text-muted-foreground">
        <HugeiconsIcon icon={MapsGlobal01Icon} strokeWidth={2} />
        Click anywhere on the map, drag the pin, or use the nudge controls
        below.
      </div>
      <div className="h-64">
        <Map
          center={[pin.longitude, pin.latitude]}
          zoom={hasCoordinates ? 12 : DEFAULT_JOBS_MAP_ZOOM}
          dragRotate={false}
          pitchWithRotate={false}
          touchPitch={false}
        >
          <PinMapInteractions
            latitude={props.latitude}
            longitude={props.longitude}
            onChange={props.onChange}
          />
          <MapControls position="bottom-right" showZoom />
          <MapMarker
            latitude={pin.latitude}
            longitude={pin.longitude}
            draggable
            onDragEnd={({ lat, lng }) =>
              props.onChange({
                latitude: lat,
                longitude: lng,
              })
            }
          >
            <MarkerContent>
              <div
                className={cn(
                  "flex size-10 items-center justify-center rounded-full border shadow-lg",
                  hasCoordinates
                    ? "border-primary/30 bg-primary text-primary-foreground"
                    : "border-border bg-background/90 text-foreground"
                )}
              >
                <HugeiconsIcon icon={Location01Icon} strokeWidth={2} />
              </div>
              <MarkerLabel>
                {hasCoordinates
                  ? "Pinned site"
                  : "Drag or click to place the pin"}
              </MarkerLabel>
            </MarkerContent>
          </MapMarker>
        </Map>
      </div>
      <div className="flex flex-wrap items-center gap-2 border-t px-4 py-3">
        <Button
          type="button"
          size="xs"
          variant="outline"
          onClick={() =>
            props.onChange({
              latitude: FALLBACK_PIN.latitude,
              longitude: FALLBACK_PIN.longitude,
            })
          }
        >
          Use default center
        </Button>
        <Button
          type="button"
          size="xs"
          variant="ghost"
          onClick={() =>
            props.onChange(nudgePin(pin, { latitudeDelta: PIN_NUDGE_STEP }))
          }
        >
          North
        </Button>
        <Button
          type="button"
          size="xs"
          variant="ghost"
          onClick={() =>
            props.onChange(nudgePin(pin, { latitudeDelta: -PIN_NUDGE_STEP }))
          }
        >
          South
        </Button>
        <Button
          type="button"
          size="xs"
          variant="ghost"
          onClick={() =>
            props.onChange(nudgePin(pin, { longitudeDelta: -PIN_NUDGE_STEP }))
          }
        >
          West
        </Button>
        <Button
          type="button"
          size="xs"
          variant="ghost"
          onClick={() =>
            props.onChange(nudgePin(pin, { longitudeDelta: PIN_NUDGE_STEP }))
          }
        >
          East
        </Button>
      </div>
    </div>
  );
}

function nudgePin(
  pin: {
    readonly latitude: number;
    readonly longitude: number;
  },
  {
    latitudeDelta = 0,
    longitudeDelta = 0,
  }: {
    readonly latitudeDelta?: number;
    readonly longitudeDelta?: number;
  }
) {
  return {
    latitude: clamp(pin.latitude + latitudeDelta, -90, 90),
    longitude: clamp(pin.longitude + longitudeDelta, -180, 180),
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function PinMapInteractions(props: {
  readonly latitude?: number;
  readonly longitude?: number;
  readonly onChange: (next: {
    readonly latitude: number;
    readonly longitude: number;
  }) => void;
}) {
  const { isLoaded, map } = useMap();
  const handlePick = React.useEffectEvent(
    (lngLat: { readonly lat: number; readonly lng: number }) => {
      props.onChange({
        latitude: lngLat.lat,
        longitude: lngLat.lng,
      });
    }
  );

  React.useEffect(() => {
    if (!map || !isLoaded) {
      return;
    }

    const handleClick = (event: {
      readonly lngLat: { readonly lat: number; readonly lng: number };
    }) => {
      handlePick(event.lngLat);
    };

    map.on("click", handleClick);

    return () => {
      map.off("click", handleClick);
    };
  }, [isLoaded, map]);

  React.useEffect(() => {
    if (
      !map ||
      !isLoaded ||
      typeof props.latitude !== "number" ||
      typeof props.longitude !== "number"
    ) {
      return;
    }

    map.easeTo({
      center: [props.longitude, props.latitude],
      duration: 300,
      zoom: Math.max(map.getZoom(), 12),
    });
  }, [isLoaded, map, props.latitude, props.longitude]);

  return null;
}
