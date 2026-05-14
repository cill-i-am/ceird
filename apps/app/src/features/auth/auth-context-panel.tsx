import type { ReactNode } from "react";

import { Badge } from "#/components/ui/badge";
import { cn } from "#/lib/utils";

interface AuthContextPanelProps {
  readonly badge?: string;
  readonly children?: ReactNode;
  readonly className?: string;
  readonly description?: string;
  readonly kicker?: string;
  readonly title: string;
}

export function AuthContextPanel(props: AuthContextPanelProps) {
  const { badge, children, className, description, kicker, title } = props;

  return (
    <section
      data-slot="auth-context-panel"
      className={cn(
        "relative overflow-hidden rounded-2xl border border-border/70 bg-card/90 p-5 shadow-[0_1px_0_color-mix(in_oklab,var(--border)_65%,transparent)] ring-1 ring-border/40 sm:p-6 lg:p-8",
        className
      )}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-border/80"
      />

      <div className="relative flex h-full flex-col gap-7">
        {kicker || badge ? (
          <div
            data-slot="auth-context-panel-badges"
            className="flex flex-wrap items-center gap-2"
          >
            {kicker ? (
              <Badge
                variant="secondary"
                className="rounded-full px-2.5 py-1 text-[0.68rem] uppercase"
              >
                {kicker}
              </Badge>
            ) : null}
            {badge ? (
              <Badge variant="outline" className="rounded-full px-2.5 py-1">
                {badge}
              </Badge>
            ) : null}
          </div>
        ) : null}

        <header
          data-slot="auth-context-panel-header"
          className="flex max-w-2xl flex-col gap-3"
        >
          <h1 className="font-heading text-2xl leading-tight font-medium text-balance sm:text-3xl">
            {title}
          </h1>
          {description ? (
            <p className="max-w-[58ch] text-sm/7 text-muted-foreground">
              {description}
            </p>
          ) : null}
        </header>

        {children ? (
          <div
            data-slot="auth-context-panel-content"
            className="flex flex-col gap-4"
          >
            {children}
          </div>
        ) : null}
      </div>
    </section>
  );
}
