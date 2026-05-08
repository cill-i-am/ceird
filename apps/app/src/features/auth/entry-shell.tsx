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

export function EntryShell(props: EntryShellProps) {
  const {
    badge,
    children,
    description,
    kicker = "Ceird",
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
          <p className="text-xs font-medium text-muted-foreground uppercase">
            {badge}
          </p>
        ) : null}

        <div className="flex flex-col gap-2">
          <CardTitle className="text-2xl sm:text-[1.75rem]">{title}</CardTitle>
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
