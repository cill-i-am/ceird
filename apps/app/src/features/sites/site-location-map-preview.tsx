"use client";
import * as React from "react";

import { Skeleton } from "#/components/ui/skeleton";
import { useCanRenderInteractiveMap } from "#/components/ui/use-can-render-interactive-map";
import type { SiteLocationLike } from "#/features/sites/site-location";

const SiteLocationMapPreviewCanvas = React.lazy(async () => {
  const module = await import("./site-location-map-preview-canvas");

  return { default: module.SiteLocationMapPreviewCanvas };
});

interface SiteLocationMapPreviewProps {
  readonly site: SiteLocationLike;
}

export function SiteLocationMapPreview({ site }: SiteLocationMapPreviewProps) {
  const canRenderInteractiveMap = useCanRenderInteractiveMap();

  if (!canRenderInteractiveMap) {
    return (
      <div className="rounded-2xl border bg-muted/10 p-4">
        <p className="text-sm text-muted-foreground">
          Preparing the site preview.
        </p>
      </div>
    );
  }

  return (
    <React.Suspense fallback={<SiteLocationMapPreviewSkeleton />}>
      <SiteLocationMapPreviewCanvas site={site} />
    </React.Suspense>
  );
}

function SiteLocationMapPreviewSkeleton() {
  return (
    <div className="rounded-2xl border bg-muted/10 p-4">
      <Skeleton className="h-44 w-full rounded-2xl" />
    </div>
  );
}
