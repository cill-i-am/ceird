"use client";

import { MapsLocation01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import {
  Map,
  MapControls,
  MapMarker,
  MarkerContent,
  MarkerLabel,
} from "#/components/ui/map";

import { hasSiteCoordinates } from "./jobs-location";
import type { SiteLocationLike } from "./jobs-location";

interface JobsDetailLocationMapPreviewCanvasProps {
  readonly site: SiteLocationLike;
}

export function JobsDetailLocationMapPreviewCanvas({
  site,
}: JobsDetailLocationMapPreviewCanvasProps) {
  if (!hasSiteCoordinates(site)) {
    return (
      <div className="rounded-2xl border bg-muted/10 p-4 text-sm text-muted-foreground">
        The preview needs site coordinates before it can render a map.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border bg-muted/10">
      <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
        <div className="flex flex-col gap-0.5">
          <p className="text-sm font-medium">Map preview</p>
          <p className="text-xs text-muted-foreground">
            A quick visual check before you open navigation.
          </p>
        </div>
      </div>
      <div className="h-44">
        <Map
          center={[site.longitude, site.latitude]}
          zoom={12}
          dragRotate={false}
          pitchWithRotate={false}
          touchPitch={false}
        >
          <MapControls position="bottom-right" controls={["zoom"]} />
          <MapMarker latitude={site.latitude} longitude={site.longitude}>
            <MarkerContent>
              <div className="flex size-10 items-center justify-center rounded-full border border-primary/30 bg-primary text-primary-foreground shadow-lg">
                <HugeiconsIcon icon={MapsLocation01Icon} strokeWidth={2} />
              </div>
              <MarkerLabel>{site.name ?? "Mapped site"}</MarkerLabel>
            </MarkerContent>
          </MapMarker>
        </Map>
      </div>
    </div>
  );
}
