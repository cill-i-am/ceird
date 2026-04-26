import type { ReactNode } from "react";

import { cn } from "#/lib/utils";

export type AuthSplitShellMode = "contained" | "full";

interface AuthSplitShellProps {
  readonly actionClassName?: string;
  readonly children: ReactNode;
  readonly className?: string;
  readonly context?: ReactNode;
  readonly contextClassName?: string;
  readonly mode?: AuthSplitShellMode;
}

export function AuthSplitShell(props: AuthSplitShellProps) {
  const {
    actionClassName,
    children,
    className,
    context,
    contextClassName,
    mode = "full",
  } = props;

  const hasContext =
    context !== undefined && context !== null && typeof context !== "boolean";

  return (
    <div
      data-slot="auth-split-shell"
      className={cn(
        "w-full",
        mode === "full" ? "min-h-screen" : "flex flex-1",
        className
      )}
    >
      <div
        data-slot="auth-split-shell-grid"
        className={cn(
          "mx-auto grid w-full max-w-6xl gap-6 px-4 py-6 sm:px-6 lg:gap-8 lg:px-8",
          mode === "full"
            ? "min-h-screen lg:py-10"
            : "flex-1 items-start lg:py-8",
          hasContext
            ? "lg:grid-cols-[minmax(0,0.94fr)_minmax(0,1.06fr)] lg:items-center"
            : "lg:grid-cols-[minmax(0,1fr)]"
        )}
      >
        <section
          aria-label="Auth action column"
          data-slot="auth-split-shell-action"
          className={cn(
            "flex w-full min-w-0 items-center justify-center",
            hasContext ? "lg:justify-start" : "",
            actionClassName
          )}
        >
          {children}
        </section>

        {hasContext ? (
          <aside
            aria-label="Auth context column"
            data-slot="auth-split-shell-context"
            className={cn("min-w-0", contextClassName)}
          >
            {context}
          </aside>
        ) : null}
      </div>
    </div>
  );
}
