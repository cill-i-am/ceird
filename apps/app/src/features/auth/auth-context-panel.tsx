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
        "relative overflow-hidden rounded-[2rem] border border-border/70 bg-card/88 p-6 shadow-sm ring-1 ring-border/50 sm:p-8 lg:p-10",
        className
      )}
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,color-mix(in_oklab,var(--primary)_14%,transparent),transparent_42%)]" />

      <div className="relative flex h-full flex-col gap-8">
        {kicker || badge ? (
          <div
            data-slot="auth-context-panel-badges"
            className="flex flex-wrap items-center gap-3"
          >
            {kicker ? (
              <Badge
                variant="secondary"
                className="rounded-full px-3 py-1 text-[0.7rem] tracking-[0.18em] uppercase"
              >
                {kicker}
              </Badge>
            ) : null}
            {badge ? (
              <Badge variant="outline" className="rounded-full px-3 py-1">
                {badge}
              </Badge>
            ) : null}
          </div>
        ) : null}

        <header
          data-slot="auth-context-panel-header"
          className="flex max-w-2xl flex-col gap-3"
        >
          <h1 className="font-heading text-3xl font-medium tracking-tight sm:text-4xl lg:text-[2.75rem]">
            {title}
          </h1>
          {description ? (
            <p className="max-w-[62ch] text-sm/7 text-muted-foreground sm:text-base/7">
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
