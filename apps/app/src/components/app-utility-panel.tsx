import * as React from "react";

import { cn } from "#/lib/utils";

export interface AppUtilityPanelProps extends Omit<
  React.ComponentProps<"section">,
  "title"
> {
  readonly title: React.ReactNode;
  readonly description?: React.ReactNode;
  readonly actions?: React.ReactNode;
  readonly footer?: React.ReactNode;
}

export function AppUtilityPanel({
  title,
  description,
  actions,
  footer,
  children,
  className,
  ...props
}: AppUtilityPanelProps) {
  return (
    <section
      className={cn(
        "rounded-[calc(var(--radius)*3)] border border-border/60 bg-background/80 p-5 shadow-[0_1px_0_color-mix(in_oklab,var(--border)_65%,transparent)] supports-[backdrop-filter]:bg-background/68 sm:p-6",
        className
      )}
      {...props}
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 space-y-1.5">
            <h2 className="font-heading text-lg font-medium tracking-tight text-foreground">
              {title}
            </h2>
            {description ? (
              <p className="max-w-[62ch] text-sm/6 text-muted-foreground">
                {description}
              </p>
            ) : null}
          </div>
          {actions ? (
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              {actions}
            </div>
          ) : null}
        </div>
        {children ? (
          <div className="flex flex-col gap-4">{children}</div>
        ) : null}
        {footer ? (
          <div className="border-t border-border/60 pt-4 text-sm text-muted-foreground">
            {footer}
          </div>
        ) : null}
      </div>
    </section>
  );
}
