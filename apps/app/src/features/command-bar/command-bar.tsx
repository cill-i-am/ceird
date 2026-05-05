"use client";
/* oxlint-disable unicorn/no-array-sort */

import { HugeiconsIcon } from "@hugeicons/react";
import * as React from "react";

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "#/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "#/components/ui/dialog";

type CommandScope = "detail" | "global" | "org" | "route";

export interface CommandAction {
  readonly disabled?: boolean;
  readonly group: string;
  readonly icon?: React.ComponentProps<typeof HugeiconsIcon>["icon"];
  readonly id: string;
  readonly keywords?: readonly string[];
  readonly priority?: number;
  readonly run: () => Promise<void> | void;
  readonly scope: CommandScope;
  readonly subtitle?: string;
  readonly title: string;
}

interface CommandRegistryContextValue {
  readonly actions: readonly CommandAction[];
  readonly registerActions: (
    ownerId: symbol,
    actions: readonly CommandAction[]
  ) => void;
  readonly unregisterActions: (ownerId: symbol) => void;
}

const CommandRegistryContext =
  React.createContext<CommandRegistryContextValue | null>(null);

const SCOPE_ORDER: Record<CommandScope, number> = {
  detail: 0,
  route: 1,
  org: 2,
  global: 3,
};

export function CommandBarProvider({
  children,
}: {
  readonly children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);
  const [actionsByOwner, setActionsByOwner] = React.useState<
    ReadonlyMap<symbol, readonly CommandAction[]>
  >(() => new Map());

  const actions = React.useMemo(
    () => sortCommandActions([...actionsByOwner.values()].flat()),
    [actionsByOwner]
  );
  const registerActions = React.useCallback(
    (ownerId: symbol, nextActions: readonly CommandAction[]) => {
      setActionsByOwner(
        (current) => new Map([...current, [ownerId, nextActions]])
      );
    },
    []
  );
  const unregisterActions = React.useCallback((ownerId: symbol) => {
    setActionsByOwner((current) => {
      if (!current.has(ownerId)) {
        return current;
      }

      const next = new Map(current);
      next.delete(ownerId);

      return next;
    });
  }, []);

  React.useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key.toLowerCase() !== "k") {
        return;
      }

      if (!event.metaKey && !event.ctrlKey) {
        return;
      }

      event.preventDefault();
      setOpen((current) => !current);
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  const contextValue = React.useMemo<CommandRegistryContextValue>(
    () => ({
      actions,
      registerActions,
      unregisterActions,
    }),
    [actions, registerActions, unregisterActions]
  );

  return (
    <CommandRegistryContext.Provider value={contextValue}>
      {children}
      {open ? (
        <CommandBarDialog
          actions={actions}
          open={open}
          onOpenChange={setOpen}
        />
      ) : null}
    </CommandRegistryContext.Provider>
  );
}

export function useCommandActions() {
  return React.use(CommandRegistryContext)?.actions ?? [];
}

export function useRegisterCommandActions(
  actions: readonly CommandAction[]
): void {
  const context = React.use(CommandRegistryContext);
  const ownerId = React.useRef<symbol>(Symbol("command-actions"));
  const registerActions = context?.registerActions;
  const unregisterActions = context?.unregisterActions;

  React.useEffect(() => {
    if (!registerActions || !unregisterActions) {
      return;
    }

    const currentOwnerId = ownerId.current;
    registerActions(currentOwnerId, actions);

    return () => {
      unregisterActions(currentOwnerId);
    };
  }, [actions, registerActions, unregisterActions]);
}

function CommandBarDialog({
  actions,
  onOpenChange,
  open,
}: {
  readonly actions: readonly CommandAction[];
  readonly onOpenChange: (open: boolean) => void;
  readonly open: boolean;
}) {
  const groups = React.useMemo(() => groupCommandActions(actions), [actions]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="overflow-hidden p-0 sm:max-w-xl"
        showCloseButton={false}
      >
        <DialogTitle className="sr-only">Command bar</DialogTitle>
        <DialogDescription className="sr-only">
          Search for a command to run.
        </DialogDescription>
        <Command>
          <CommandInput placeholder="Type a command or search..." />
          <CommandList className="max-h-[min(28rem,calc(100vh-10rem))]">
            <CommandEmpty>No commands found.</CommandEmpty>
            {groups.map((group, index) => (
              <React.Fragment key={group.heading}>
                {index > 0 ? <CommandSeparator /> : null}
                <CommandGroup heading={group.heading}>
                  {group.actions.map((action) => (
                    <CommandItem
                      key={action.id}
                      disabled={action.disabled}
                      value={buildCommandValue(action)}
                      onSelect={() => {
                        onOpenChange(false);
                        void runCommandAction(action);
                      }}
                    >
                      {action.icon ? (
                        <HugeiconsIcon icon={action.icon} strokeWidth={2} />
                      ) : null}
                      <span className="min-w-0 flex-1 truncate">
                        {action.title}
                      </span>
                      {action.subtitle ? (
                        <span className="ml-auto truncate text-xs text-muted-foreground">
                          {action.subtitle}
                        </span>
                      ) : null}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </React.Fragment>
            ))}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}

function sortCommandActions(actions: readonly CommandAction[]) {
  const sorted = [...actions];
  sorted.sort(compareCommandActions);

  return sorted;
}

function compareCommandActions(left: CommandAction, right: CommandAction) {
  const scopeOrder = SCOPE_ORDER[left.scope] - SCOPE_ORDER[right.scope];

  if (scopeOrder !== 0) {
    return scopeOrder;
  }

  const priorityOrder = (right.priority ?? 0) - (left.priority ?? 0);

  if (priorityOrder !== 0) {
    return priorityOrder;
  }

  return left.title.localeCompare(right.title);
}

function groupCommandActions(actions: readonly CommandAction[]) {
  const groups = new Map<string, CommandAction[]>();

  for (const action of actions) {
    const current = groups.get(action.group) ?? [];
    current.push(action);
    groups.set(action.group, current);
  }

  return [...groups.entries()].map(([heading, groupActions]) => ({
    actions: groupActions,
    heading,
  }));
}

function buildCommandValue(action: CommandAction) {
  return [action.title, action.subtitle, ...(action.keywords ?? [])]
    .filter((value): value is string => typeof value === "string")
    .join(" ");
}

async function runCommandAction(action: CommandAction) {
  try {
    await action.run();
  } catch (error) {
    reportCommandActionError(error);
  }
}

function reportCommandActionError(error: unknown) {
  if (
    typeof window !== "undefined" &&
    "reportError" in window &&
    typeof window.reportError === "function"
  ) {
    window.reportError(error);
    return;
  }

  // eslint-disable-next-line no-console -- Surface command failures without producing unhandled promise rejections.
  console.error("Command action failed", error);
}
