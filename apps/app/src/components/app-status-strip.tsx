import * as React from "react";

import { cn } from "#/lib/utils";

export interface AppStatusStripProps extends React.ComponentProps<"section"> {
  readonly label?: string;
}

export interface AppStatusStripItemProps extends Omit<
  React.ComponentProps<"li">,
  "children" | "value"
> {
  readonly label: React.ReactNode;
  readonly value: React.ReactNode;
  readonly meta?: React.ReactNode;
}

export function AppStatusStrip({
  label = "Status",
  className,
  children,
  ...props
}: AppStatusStripProps) {
  return (
    <section
      aria-label={label}
      className={cn(
        "rounded-[calc(var(--radius)*3)] border border-border/60 bg-background/78 px-4 py-3.5 shadow-[0_1px_0_color-mix(in_oklab,var(--border)_65%,transparent)] supports-[backdrop-filter]:bg-background/66",
        className
      )}
      {...props}
    >
      <ul className="grid gap-2.5 sm:grid-cols-2 2xl:grid-cols-4">
        {children}
      </ul>
    </section>
  );
}

export function AppStatusStripItem({
  label,
  value,
  meta,
  className,
  ...props
}: AppStatusStripItemProps) {
  return (
    <li
      className={cn(
        "min-w-0 rounded-[calc(var(--radius)*2.2)] border border-border/50 bg-muted/24 px-4 py-3.5",
        className
      )}
      {...props}
    >
      <div className="min-w-0 space-y-1.5">
        <p className="text-[0.68rem] font-medium tracking-[0.16em] text-muted-foreground uppercase">
          {label}
        </p>
        <div className="min-w-0 space-y-1">
          <p className="text-sm leading-5 font-medium [overflow-wrap:anywhere] text-foreground">
            {value}
          </p>
          {meta ? (
            <p className="text-xs leading-5 [overflow-wrap:anywhere] text-muted-foreground">
              {meta}
            </p>
          ) : null}
        </div>
      </div>
    </li>
  );
}
