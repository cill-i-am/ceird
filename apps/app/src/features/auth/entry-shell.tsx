import type { ReactNode } from "react";

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "#/components/ui/card";
import { cn } from "#/lib/utils";

import { AuthContextPanel } from "./auth-context-panel";
import { AuthSplitShell } from "./auth-split-shell";
import type { AuthSplitShellMode } from "./auth-split-shell";

type EntryShellMode = AuthSplitShellMode;

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
    <AuthSplitShell
      mode={mode}
      actionClassName={cn(mode === "full" ? "lg:pr-2" : "lg:pt-2")}
      context={
        <AuthContextPanel
          badge={badge}
          description={description}
          kicker={kicker}
          title={title}
        >
          {supportingContent}
        </AuthContextPanel>
      }
    >
      {children}
    </AuthSplitShell>
  );
}

export function EntrySurfaceCard(props: EntrySurfaceCardProps) {
  const { badge, children, className, description, footer, title } = props;

  return (
    <Card
      className={cn(
        "w-full max-w-xl rounded-[1.75rem] border border-border/70 bg-card/95 shadow-lg shadow-primary/5",
        className
      )}
    >
      <CardHeader className="flex flex-col gap-4 border-b border-border/70 pb-6">
        {badge ? (
          <p className="text-xs font-medium tracking-[0.18em] text-muted-foreground uppercase">
            {badge}
          </p>
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
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
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
      data-slot="entry-support-panel"
      className={cn(
        "rounded-3xl border border-border/70 bg-background/92 p-4 shadow-sm shadow-primary/5",
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
