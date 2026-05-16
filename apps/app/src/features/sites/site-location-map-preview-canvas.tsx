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
import type { MappedSiteLocationLike } from "#/features/sites/site-location";

import { SiteLocationMapPreviewFrame } from "./site-location-map-preview-frame";
import type { SiteLocationMapPreviewVariant } from "./site-location-map-preview-frame";

interface SiteLocationMapPreviewCanvasProps {
  readonly site: MappedSiteLocationLike;
  readonly variant?: SiteLocationMapPreviewVariant;
}

export function SiteLocationMapPreviewCanvas({
  site,
  variant = "card",
}: SiteLocationMapPreviewCanvasProps) {
  if (variant === "embedded") {
    return (
      <SiteLocationMapPreviewFrame variant="embedded">
        <SiteLocationMap site={site} />
      </SiteLocationMapPreviewFrame>
    );
  }

  return (
    <SiteLocationMapPreviewFrame variant="card" className="overflow-hidden p-0">
      <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
        <div className="flex flex-col gap-0.5">
          <p className="text-sm font-medium">Map preview</p>
        </div>
      </div>
      <div className="h-44">
        <SiteLocationMap site={site} label={site.name ?? "Mapped site"} />
      </div>
    </SiteLocationMapPreviewFrame>
  );
}

function SiteLocationMap({
  label,
  site,
}: {
  readonly label?: React.ReactNode;
  readonly site: MappedSiteLocationLike;
}) {
  return (
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
          {label ? <MarkerLabel>{label}</MarkerLabel> : null}
        </MarkerContent>
      </MapMarker>
    </Map>
  );
}
