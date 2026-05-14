import type { ReactNode } from "react";

import { cn } from "#/lib/utils";

import { CeirdEntryLogo, EntryAtmosphere } from "./entry-atmosphere";
import type { EntryAtmosphereVariant } from "./entry-atmosphere";

export type AuthSplitShellMode = "contained" | "full";

interface AuthSplitShellProps {
  readonly actionClassName?: string;
  readonly atmosphere?: EntryAtmosphereVariant;
  readonly children: ReactNode;
  readonly className?: string;
  readonly context?: ReactNode;
  readonly contextClassName?: string;
  readonly mode?: AuthSplitShellMode;
}

export function AuthSplitShell(props: AuthSplitShellProps) {
  const {
    actionClassName,
    atmosphere = "standard",
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
        "relative isolate w-full overflow-hidden bg-background text-foreground",
        mode === "full" ? "min-h-screen" : "flex flex-1",
        className
      )}
    >
      <EntryAtmosphere variant={atmosphere} />
      <CeirdEntryLogo className="pointer-events-none absolute top-5 left-5 z-10 sm:top-6 sm:left-6 lg:top-8 lg:left-8" />
      <div
        data-slot="auth-split-shell-grid"
        className={cn(
          "relative z-10 mx-auto grid w-full max-w-6xl gap-4 px-4 py-4 sm:px-6 sm:py-6 lg:gap-6 lg:px-8",
          mode === "full"
            ? "min-h-screen lg:py-8"
            : "flex-1 items-start lg:py-8",
          hasContext
            ? "lg:grid-cols-[minmax(19rem,0.82fr)_minmax(28rem,1fr)] lg:items-center"
            : "lg:grid-cols-[minmax(0,1fr)]"
        )}
      >
        <section
          aria-label="Auth action column"
          data-slot="auth-split-shell-action"
          className={cn(
            "flex w-full min-w-0 justify-center",
            mode === "full"
              ? "items-start pt-[clamp(4.5rem,14svh,8rem)] pb-10 sm:pt-[clamp(5rem,16svh,9rem)] lg:items-center lg:pt-0 lg:pb-0"
              : "items-center",
            hasContext ? "lg:col-start-2 lg:row-start-1 lg:justify-start" : "",
            actionClassName
          )}
        >
          {children}
        </section>

        {hasContext ? (
          <aside
            aria-label="Auth context column"
            data-slot="auth-split-shell-context"
            className={cn(
              "min-w-0 lg:col-start-1 lg:row-start-1",
              contextClassName
            )}
          >
            {context}
          </aside>
        ) : null}
      </div>
    </div>
  );
}
