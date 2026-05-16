"use client";
import * as React from "react";

import { Skeleton } from "#/components/ui/skeleton";
import { useCanRenderInteractiveMap } from "#/components/ui/use-can-render-interactive-map";
import { hasSiteCoordinates } from "#/features/sites/site-location";
import type { SiteLocationLike } from "#/features/sites/site-location";

import { SiteLocationMapPreviewFrame } from "./site-location-map-preview-frame";
import type { SiteLocationMapPreviewVariant } from "./site-location-map-preview-frame";

const SiteLocationMapPreviewCanvas = React.lazy(async () => {
  const module = await import("./site-location-map-preview-canvas");

  return { default: module.SiteLocationMapPreviewCanvas };
});

interface SiteLocationMapPreviewProps {
  readonly site: SiteLocationLike;
  readonly variant?: SiteLocationMapPreviewVariant;
}

export function SiteLocationMapPreview({
  site,
  variant = "card",
}: SiteLocationMapPreviewProps) {
  const canRenderInteractiveMap = useCanRenderInteractiveMap();

  if (!hasSiteCoordinates(site)) {
    return (
      <SiteLocationMapPreviewMessage variant={variant}>
        The preview needs site coordinates before it can render a map.
      </SiteLocationMapPreviewMessage>
    );
  }

  if (!canRenderInteractiveMap) {
    return (
      <SiteLocationMapPreviewMessage variant={variant}>
        Preparing the site preview.
      </SiteLocationMapPreviewMessage>
    );
  }

  return (
    <React.Suspense
      fallback={<SiteLocationMapPreviewSkeleton variant={variant} />}
    >
      <SiteLocationMapPreviewCanvas site={site} variant={variant} />
    </React.Suspense>
  );
}

function SiteLocationMapPreviewSkeleton({
  variant,
}: {
  readonly variant: SiteLocationMapPreviewVariant;
}) {
  if (variant === "embedded") {
    return (
      <SiteLocationMapPreviewFrame variant="embedded">
        <Skeleton className="h-full w-full rounded-none" />
      </SiteLocationMapPreviewFrame>
    );
  }

  return (
    <SiteLocationMapPreviewFrame variant="card">
      <Skeleton className="h-44 w-full rounded-2xl" />
    </SiteLocationMapPreviewFrame>
  );
}

function SiteLocationMapPreviewMessage({
  children,
  variant,
}: {
  readonly children: React.ReactNode;
  readonly variant: SiteLocationMapPreviewVariant;
}) {
  return (
    <SiteLocationMapPreviewFrame
      variant={variant}
      className={
        variant === "embedded"
          ? "flex items-center px-4 text-sm text-muted-foreground"
          : "text-sm text-muted-foreground"
      }
    >
      {children}
    </SiteLocationMapPreviewFrame>
  );
}
