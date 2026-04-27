import * as React from "react";

import { cn } from "#/lib/utils";

export interface AppPageHeaderProps extends Omit<
  React.ComponentProps<"header">,
  "title"
> {
  readonly eyebrow?: React.ReactNode;
  readonly title: React.ReactNode;
  readonly description?: React.ReactNode;
  readonly actions?: React.ReactNode;
}

export function AppPageHeader({
  eyebrow,
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
        "flex flex-col gap-4 border-b border-border/60 pb-5 sm:gap-5 sm:pb-6",
        className
      )}
      {...props}
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          {eyebrow ? (
            <p className="text-[0.68rem] font-medium text-muted-foreground uppercase">
              {eyebrow}
            </p>
          ) : null}
          <div className="flex flex-col gap-1.5">
            <h1 className="font-heading text-2xl font-medium text-foreground sm:text-3xl">
              {title}
            </h1>
            {description ? (
              <p className="max-w-[68ch] text-sm/6 text-muted-foreground sm:text-[0.95rem]/6">
                {description}
              </p>
            ) : null}
          </div>
        </div>
        {actions ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            {actions}
          </div>
        ) : null}
      </div>
      {children ? <div className="flex flex-col gap-3">{children}</div> : null}
    </header>
  );
}
