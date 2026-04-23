"use client";

import * as React from "react";

import { Skeleton } from "#/components/ui/skeleton";

const JobsSitePinPickerCanvas = React.lazy(async () => {
  const module = await import("./jobs-site-pin-picker-canvas");

  return { default: module.JobsSitePinPickerCanvas };
});

export function JobsSitePinPicker(props: {
  readonly latitude?: number;
  readonly longitude?: number;
  readonly onChange: (next: {
    readonly latitude: number;
    readonly longitude: number;
  }) => void;
}) {
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
      <div className="rounded-2xl border bg-muted/10 px-4 py-3 text-sm text-muted-foreground">
        Interactive pin placement is available in supported browsers. You can
        still paste latitude and longitude manually.
      </div>
    );
  }

  return (
    <React.Suspense fallback={<JobsSitePinPickerSkeleton />}>
      <JobsSitePinPickerCanvas {...props} />
    </React.Suspense>
  );
}

function JobsSitePinPickerSkeleton() {
  return (
    <div className="rounded-2xl border bg-muted/10 p-4">
      <Skeleton className="h-64 w-full rounded-2xl" />
    </div>
  );
}
