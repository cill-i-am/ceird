"use client";
import type { ReactNode } from "react";

import { cn } from "#/lib/utils";

export type SiteLocationMapPreviewVariant = "card" | "embedded";

export function SiteLocationMapPreviewFrame({
  children,
  className,
  variant,
}: {
  readonly children: ReactNode;
  readonly className?: string;
  readonly variant: SiteLocationMapPreviewVariant;
}) {
  if (variant === "embedded") {
    return (
      <div
        aria-label="Map preview"
        className={cn(
          "h-full min-h-44 overflow-hidden rounded-md border bg-muted/10",
          className
        )}
      >
        {children}
      </div>
    );
  }

  return (
    <div className={cn("rounded-2xl border bg-muted/10 p-4", className)}>
      {children}
    </div>
  );
}
