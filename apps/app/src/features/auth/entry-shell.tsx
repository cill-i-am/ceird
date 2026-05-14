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
  readonly children: ReactNode;
  readonly context?: ReactNode;
  readonly mode?: EntryShellMode;
}

interface EntryContextPanelProps {
  readonly badge?: string;
  readonly children?: ReactNode;
  readonly description: string;
  readonly kicker?: string;
  readonly title: string;
}

interface EntrySurfaceCardProps {
  readonly badge?: string;
  readonly children?: ReactNode;
  readonly className?: string;
  readonly description?: string;
  readonly footer?: ReactNode;
  readonly title: string;
  readonly titleLevel?: 1 | 2;
}

export function EntryShell(props: EntryShellProps) {
  const { children, context, mode = "full" } = props;

  return (
    <AuthSplitShell
      mode={mode}
      actionClassName={cn(mode === "full" ? "lg:pr-2" : "lg:pt-2")}
      context={context}
    >
      {children}
    </AuthSplitShell>
  );
}

export function EntryContextPanel(props: EntryContextPanelProps) {
  const { badge, children, description, kicker = "Ceird", title } = props;

  return (
    <AuthContextPanel
      badge={badge}
      description={description}
      kicker={kicker}
      title={title}
    >
      {children}
    </AuthContextPanel>
  );
}

function hasRenderableNode(node: ReactNode): boolean {
  if (node === null || node === undefined || typeof node === "boolean") {
    return false;
  }

  if (Array.isArray(node)) {
    return node.some((child) => hasRenderableNode(child));
  }

  return true;
}

export function EntrySurfaceCard(props: EntrySurfaceCardProps) {
  const { badge, children, className, description, footer, title, titleLevel } =
    props;
  const hasBody = hasRenderableNode(children);

  return (
    <Card
      className={cn(
        "w-full max-w-xl animate-in rounded-2xl border border-border/70 bg-card/95 shadow-[0_1px_0_color-mix(in_oklab,var(--border)_65%,transparent)] ring-1 ring-border/40 duration-200 ease-out [contain:layout_paint] fade-in-0 [view-transition-name:auth-card] slide-in-from-bottom-1 motion-reduce:animate-none",
        className
      )}
    >
      <CardHeader
        className={cn(
          "flex flex-col gap-3 [view-transition-name:auth-card-header]",
          hasBody ? "border-b border-border/70 pb-5" : "pb-0"
        )}
      >
        {badge ? (
          <p className="text-[0.68rem] font-medium text-muted-foreground uppercase">
            {badge}
          </p>
        ) : null}

        <div className="flex flex-col gap-2">
          <CardTitle
            aria-level={titleLevel}
            className="text-xl sm:text-2xl"
            role={titleLevel ? "heading" : undefined}
          >
            {title}
          </CardTitle>
          {description ? (
            <CardDescription className="max-w-[52ch] text-sm/6">
              {description}
            </CardDescription>
          ) : null}
        </div>
      </CardHeader>

      {hasBody ? (
        <CardContent className="flex flex-col gap-5 pt-5 [view-transition-name:auth-card-body]">
          {children}
        </CardContent>
      ) : null}

      {footer ? (
        <CardFooter
          className={cn(
            "flex flex-col items-stretch gap-3 [view-transition-name:auth-card-footer]",
            hasBody ? "border-t border-border/70 pt-5" : "pt-0"
          )}
        >
          {footer}
        </CardFooter>
      ) : null}
    </Card>
  );
}
