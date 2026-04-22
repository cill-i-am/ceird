import type { ReactNode } from "react";

import { Badge } from "#/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "#/components/ui/card";
import { cn } from "#/lib/utils";

type EntryShellMode = "contained" | "full";

interface EntryShellProps {
  readonly badge?: string;
  readonly children: ReactNode;
  readonly description: string;
  readonly kicker?: string;
  readonly mode?: EntryShellMode;
  readonly supportingContent?: ReactNode;
  readonly title: string;
}

interface EntrySurfaceCardProps {
  readonly badge?: string;
  readonly children: ReactNode;
  readonly className?: string;
  readonly description: string;
  readonly footer?: ReactNode;
  readonly title: string;
}

interface EntryHighlightGridProps {
  readonly items: readonly {
    readonly description: string;
    readonly title: string;
  }[];
}

interface EntrySupportPanelProps {
  readonly children?: ReactNode;
  readonly className?: string;
  readonly description?: string;
  readonly title: string;
}

export const DEFAULT_AUTH_HIGHLIGHTS = [
  {
    title: "Clear ownership",
    description: "See who owns what and what should move next without digging.",
  },
  {
    title: "Fast updates",
    description:
      "Keep office staff and field crews aligned from the same workspace.",
  },
  {
    title: "Simple access",
    description: "Bring people in, verify accounts, and keep permissions tidy.",
  },
] as const;

export const INVITATION_AUTH_HIGHLIGHTS = [
  {
    title: "Context stays attached",
    description:
      "Your invitation follows you through sign in so nothing gets lost.",
  },
  {
    title: "Built for working teams",
    description: "Roles, members, and follow-up actions stay straightforward.",
  },
  {
    title: "No admin clutter",
    description: "Get into the workspace quickly and keep work moving.",
  },
] as const;

export function EntryShell(props: EntryShellProps) {
  const {
    badge,
    children,
    description,
    kicker = "Task Tracker",
    mode = "full",
    supportingContent,
    title,
  } = props;

  return (
    <div
      className={cn("w-full", mode === "full" ? "min-h-screen" : "flex flex-1")}
    >
      <div
        className={cn(
          "mx-auto grid w-full max-w-7xl gap-6 px-4 py-6 sm:px-6 lg:gap-8 lg:px-8",
          mode === "full"
            ? "min-h-screen items-center lg:grid-cols-[minmax(0,1.08fr)_minmax(0,0.92fr)] lg:py-10"
            : "flex-1 items-start lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:py-8"
        )}
      >
        <section className="relative overflow-hidden rounded-[2rem] border bg-card/80 p-6 shadow-sm ring-1 ring-border/60 sm:p-8 lg:p-10">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,color-mix(in_oklab,var(--primary)_12%,transparent),transparent_38%)]" />
          <div className="relative flex h-full flex-col gap-8">
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap items-center gap-3">
                <Badge variant="secondary" className="rounded-full px-3 py-1">
                  {kicker}
                </Badge>
                {badge ? (
                  <Badge variant="outline" className="rounded-full px-3 py-1">
                    {badge}
                  </Badge>
                ) : null}
              </div>

              <div className="flex max-w-2xl flex-col gap-3">
                <h1 className="font-heading text-3xl font-medium tracking-tight sm:text-4xl lg:text-[2.9rem]">
                  {title}
                </h1>
                <p className="max-w-[65ch] text-sm/7 text-muted-foreground sm:text-base/7">
                  {description}
                </p>
              </div>
            </div>

            {supportingContent}
          </div>
        </section>

        <div
          className={cn(
            "flex w-full",
            mode === "full" ? "items-center lg:justify-end" : "lg:pt-2"
          )}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

export function EntrySurfaceCard(props: EntrySurfaceCardProps) {
  const { badge, children, className, description, footer, title } = props;

  return (
    <Card className={cn("w-full max-w-xl", className)}>
      <CardHeader className="flex flex-col gap-4 border-b border-border/70 pb-6">
        {badge ? (
          <Badge variant="secondary" className="w-fit rounded-full px-3 py-1">
            {badge}
          </Badge>
        ) : null}

        <div className="flex flex-col gap-2">
          <CardTitle className="text-2xl tracking-tight sm:text-[1.75rem]">
            {title}
          </CardTitle>
          <CardDescription className="max-w-[52ch] text-sm/6 sm:text-base/7">
            {description}
          </CardDescription>
        </div>
      </CardHeader>

      <CardContent className="flex flex-col gap-6 pt-6">{children}</CardContent>

      {footer ? (
        <CardFooter className="flex flex-col items-stretch gap-3 border-t pt-6">
          {footer}
        </CardFooter>
      ) : null}
    </Card>
  );
}

export function EntryHighlightGrid({ items }: EntryHighlightGridProps) {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      {items.map((item) => (
        <EntrySupportPanel
          key={item.title}
          title={item.title}
          description={item.description}
        />
      ))}
    </div>
  );
}

export function EntrySupportPanel(props: EntrySupportPanelProps) {
  const { children, className, description, title } = props;

  return (
    <div
      className={cn(
        "rounded-3xl border bg-background/84 p-4 shadow-sm shadow-primary/5",
        className
      )}
    >
      <div className="flex flex-col gap-2">
        <p className="font-heading text-base font-medium tracking-tight">
          {title}
        </p>
        {description ? (
          <p className="text-sm/6 text-muted-foreground">{description}</p>
        ) : null}
        {children}
      </div>
    </div>
  );
}
