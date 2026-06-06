"use client";
import { CommandIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  getHotkeyManager,
  getSequenceManager,
  toHotkeyRegistrationView,
} from "@tanstack/react-hotkeys";
import * as React from "react";

import { Button } from "#/components/ui/button";
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from "#/components/ui/responsive-dialog";
import { cn } from "#/lib/utils";

import { ShortcutHint } from "./hotkey-display";
import { HOTKEYS, HOTKEY_GROUPS } from "./hotkey-registry";
import type {
  HotkeyDefinition,
  HotkeyId,
  HotkeyScope,
} from "./hotkey-registry";
import { useAppHotkey } from "./use-app-hotkey";

const SHORTCUTS = Object.values(HOTKEYS);

interface AppHotkeyRegistrationMeta {
  readonly appHotkeyId?: HotkeyId;
}

function getShortcutsForScopes(
  activeScopes: readonly HotkeyScope[],
  registeredShortcutIds: ReadonlySet<HotkeyId>
) {
  const activeScopeSet = new Set<HotkeyScope>(activeScopes);

  return SHORTCUTS.filter(
    (shortcut) =>
      activeScopeSet.has(shortcut.scope) &&
      registeredShortcutIds.has(shortcut.id as HotkeyId)
  );
}

function groupShortcuts(
  shortcuts: readonly HotkeyDefinition[],
  activeScopes: readonly HotkeyScope[]
) {
  const groupOrder = buildShortcutGroupOrder(shortcuts, activeScopes);

  return groupOrder.flatMap((group) => {
    const groupedShortcuts = shortcuts.filter(
      (shortcut) => shortcut.group === group
    );

    return groupedShortcuts.length > 0
      ? [{ group, shortcuts: groupedShortcuts }]
      : [];
  });
}

function buildShortcutGroupOrder(
  shortcuts: readonly HotkeyDefinition[],
  activeScopes: readonly HotkeyScope[]
) {
  const activeScopeRank = new Map(
    activeScopes.map((scope, index) => [scope, index] as const)
  );

  return HOTKEY_GROUPS.toSorted((left, right) => {
    const leftRank = getShortcutGroupRank(left, shortcuts, activeScopeRank);
    const rightRank = getShortcutGroupRank(right, shortcuts, activeScopeRank);

    if (leftRank !== rightRank) {
      return leftRank - rightRank;
    }

    return HOTKEY_GROUPS.indexOf(left) - HOTKEY_GROUPS.indexOf(right);
  });
}

function getShortcutGroupRank(
  group: HotkeyDefinition["group"],
  shortcuts: readonly HotkeyDefinition[],
  activeScopeRank: ReadonlyMap<HotkeyScope, number>
) {
  const contextualRanks: number[] = [];

  for (const shortcut of shortcuts) {
    if (shortcut.group !== group || shortcut.scope === "global") {
      continue;
    }

    const rank = activeScopeRank.get(shortcut.scope);
    if (typeof rank === "number") {
      contextualRanks.push(rank);
    }
  }

  return Math.min(...contextualRanks, Number.POSITIVE_INFINITY);
}

const ShortcutHelpHotkeys = React.memo(function ShortcutHelpHotkeys({
  setIsOpen,
}: {
  readonly setIsOpen: React.Dispatch<React.SetStateAction<boolean>>;
}) {
  const openHelp = React.useCallback(() => setIsOpen(true), [setIsOpen]);

  useAppHotkey("help", openHelp);
  useAppHotkey("helpAlternate", openHelp);

  return null;
});

export function ShortcutHelpOverlay({
  activeScopes,
  buttonClassName,
  labelClassName,
  registerHotkeys = true,
}: {
  readonly activeScopes: readonly HotkeyScope[];
  readonly buttonClassName?: string | undefined;
  readonly labelClassName?: string | undefined;
  readonly registerHotkeys?: boolean | undefined;
}) {
  const [isOpen, setIsOpen] = React.useState(false);

  return (
    <ResponsiveDialog open={isOpen} onOpenChange={setIsOpen}>
      {registerHotkeys ? <ShortcutHelpHotkeys setIsOpen={setIsOpen} /> : null}
      <Button
        type="button"
        variant="outline"
        size="sm"
        className={cn("gap-1.5", buttonClassName)}
        aria-label="Keyboard shortcuts"
        onClick={() => setIsOpen(true)}
      >
        <HugeiconsIcon
          icon={CommandIcon}
          strokeWidth={2}
          data-icon="inline-start"
        />
        <span className={labelClassName}>Keyboard shortcuts</span>
      </Button>
      {isOpen ? <ShortcutHelpContent activeScopes={activeScopes} /> : null}
    </ResponsiveDialog>
  );
}

function ShortcutHelpContent({
  activeScopes,
}: {
  readonly activeScopes: readonly HotkeyScope[];
}) {
  const registeredShortcutIds = React.useMemo(() => {
    const hotkeys = Array.from(
      getHotkeyManager().registrations.state.values()
    ).map(toHotkeyRegistrationView);
    const sequences = Array.from(
      getSequenceManager().registrations.state.values()
    );
    const idSet = new Set<HotkeyId>();

    for (const registration of hotkeys) {
      if (registration.options.enabled === false) {
        continue;
      }

      const meta = registration.options.meta as
        | AppHotkeyRegistrationMeta
        | undefined;

      if (meta?.appHotkeyId) {
        idSet.add(meta.appHotkeyId);
      }
    }

    for (const registration of sequences) {
      if (registration.options.enabled === false) {
        continue;
      }

      const meta = registration.options.meta as
        | AppHotkeyRegistrationMeta
        | undefined;

      if (meta?.appHotkeyId) {
        idSet.add(meta.appHotkeyId);
      }
    }

    return idSet;
  }, []);
  const shortcutGroups = groupShortcuts(
    getShortcutsForScopes(activeScopes, registeredShortcutIds),
    activeScopes
  );

  return (
    <ResponsiveDialogContent className="max-h-[min(38rem,calc(100vh-2rem))] overflow-y-auto rounded-2xl sm:max-w-xl">
      <ResponsiveDialogHeader>
        <ResponsiveDialogTitle>Keyboard shortcuts</ResponsiveDialogTitle>
        <ResponsiveDialogDescription>
          Press ? anytime to open this reference.
        </ResponsiveDialogDescription>
      </ResponsiveDialogHeader>
      <div className="grid gap-5">
        {shortcutGroups.map(({ group, shortcuts }) => (
          <section key={group} aria-labelledby={`shortcut-group-${group}`}>
            <h3
              id={`shortcut-group-${group}`}
              className="mb-2 text-xs font-medium tracking-normal text-muted-foreground"
            >
              {group}
            </h3>
            <div className="grid gap-1.5">
              {shortcuts.map((shortcut) => (
                <div
                  key={shortcut.id}
                  className="flex min-h-10 items-center justify-between gap-3 rounded-md border border-border/70 px-3 py-2"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-medium">{shortcut.label}</div>
                    {shortcut.when ? (
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        {shortcut.when}
                      </div>
                    ) : null}
                  </div>
                  <ShortcutHint
                    className="shrink-0"
                    hotkey={shortcut.hotkey}
                    label={shortcut.label}
                  />
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </ResponsiveDialogContent>
  );
}
