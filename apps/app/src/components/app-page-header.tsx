import * as React from "react";

import { cn } from "#/lib/utils";

export interface AppPageHeaderProps extends Omit<
  React.ComponentProps<"header">,
  "title"
> {
  readonly eyebrow?: React.ReactNode;
  readonly leading?: React.ReactNode;
  readonly title: React.ReactNode;
  readonly description?: React.ReactNode;
  readonly actions?: React.ReactNode;
}

export function AppPageHeader({
  eyebrow,
  leading,
  title,
  description,
  actions,
  children,
  className,
  ...props
}: AppPageHeaderProps) {
  return (
    <header
      className={cn(
        "flex min-w-0 flex-col gap-4 border-b border-border/60 pb-4",
        className
      )}
      {...props}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          {leading ? (
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              {leading}
            </span>
          ) : null}
          <div className="min-w-0">
            {eyebrow ? (
              <p className="text-[0.68rem] font-medium text-muted-foreground uppercase">
                {eyebrow}
              </p>
            ) : null}
            <h1 className="truncate font-heading text-xl font-medium text-foreground">
              {title}
            </h1>
          </div>
        </div>
        {actions ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {actions}
          </div>
        ) : null}
      </div>
      {description ? (
        <p className="max-w-[68ch] text-sm/6 text-muted-foreground">
          {description}
        </p>
      ) : null}
      {children ? <div className="flex flex-col gap-3">{children}</div> : null}
    </header>
  );
}
