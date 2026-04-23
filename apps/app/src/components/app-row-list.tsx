import * as React from "react";

import { cn } from "#/lib/utils";

export function AppRowList({
  className,
  children,
  ...props
}: React.ComponentProps<"ul">) {
  return (
    <ul
      className={cn(
        "overflow-hidden rounded-[calc(var(--radius)*3)] border border-border/60 bg-background/78 shadow-[0_1px_0_color-mix(in_oklab,var(--border)_65%,transparent)] supports-[backdrop-filter]:bg-background/68",
        className
      )}
      {...props}
    >
      {children}
    </ul>
  );
}

export function AppRowListItem({
  className,
  children,
  ...props
}: React.ComponentProps<"li">) {
  return (
    <li
      className={cn(
        "flex min-w-0 flex-col gap-3 border-b border-border/60 px-4 py-4 last:border-b-0 sm:flex-row sm:items-center sm:gap-4 sm:px-5",
        className
      )}
      {...props}
    >
      {children}
    </li>
  );
}

export function AppRowListLeading({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "flex size-10 shrink-0 items-center justify-center rounded-[calc(var(--radius)*2.2)] border border-border/60 bg-muted/35 text-sm font-medium text-muted-foreground",
        className
      )}
      {...props}
    />
  );
}

export interface AppRowListBodyProps extends Omit<
  React.ComponentProps<"div">,
  "title"
> {
  readonly eyebrow?: React.ReactNode;
  readonly title: React.ReactNode;
  readonly description?: React.ReactNode;
}

export function AppRowListBody({
  eyebrow,
  title,
  description,
  className,
  ...props
}: AppRowListBodyProps) {
  return (
    <div className={cn("min-w-0 flex-1 space-y-1", className)} {...props}>
      {eyebrow ? (
        <p className="text-[0.68rem] font-medium tracking-[0.16em] text-muted-foreground uppercase">
          {eyebrow}
        </p>
      ) : null}
      <p className="truncate text-sm font-medium text-foreground">{title}</p>
      {description ? (
        <p className="text-sm/6 text-muted-foreground">{description}</p>
      ) : null}
    </div>
  );
}

export function AppRowListMeta({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "flex shrink-0 flex-wrap items-center gap-2 text-xs text-muted-foreground sm:justify-end",
        className
      )}
      {...props}
    />
  );
}

export function AppRowListActions({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "flex shrink-0 flex-wrap items-center gap-2 sm:justify-end",
        className
      )}
      {...props}
    />
  );
}
