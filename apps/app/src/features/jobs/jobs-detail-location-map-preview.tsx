"use client";
import * as React from "react";

import { Skeleton } from "#/components/ui/skeleton";
import type { SiteLocationLike } from "#/features/sites/site-location";

const JobsDetailLocationMapPreviewCanvas = React.lazy(async () => {
  const module = await import("./jobs-detail-location-map-preview-canvas");

  return { default: module.JobsDetailLocationMapPreviewCanvas };
});

interface JobsDetailLocationMapPreviewProps {
  readonly site: SiteLocationLike;
}

export function JobsDetailLocationMapPreview({
  site,
}: JobsDetailLocationMapPreviewProps) {
  const [canRenderInteractiveMap, setCanRenderInteractiveMap] =
    React.useState(false);

  React.useEffect(() => {
    setCanRenderInteractiveMap(
      typeof window !== "undefined" &&
        typeof window.URL?.createObjectURL === "function"
    );
  }, []);

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
    <React.Suspense fallback={<JobsDetailLocationMapPreviewSkeleton />}>
      <JobsDetailLocationMapPreviewCanvas site={site} />
    </React.Suspense>
  );
}

function JobsDetailLocationMapPreviewSkeleton() {
  return (
    <div className="rounded-2xl border bg-muted/10 p-4">
      <Skeleton className="h-44 w-full rounded-2xl" />
    </div>
  );
}
