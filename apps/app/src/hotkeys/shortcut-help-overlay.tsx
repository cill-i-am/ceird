"use client";

import { useHotkeyRegistrations } from "@tanstack/react-hotkeys";
import * as React from "react";

import { Button } from "#/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "#/components/ui/dialog";

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

function groupShortcuts(shortcuts: readonly HotkeyDefinition[]) {
  return HOTKEY_GROUPS.map((group) => ({
    group,
    shortcuts: shortcuts.filter((shortcut) => shortcut.group === group),
  })).filter(({ shortcuts: groupedShortcuts }) => groupedShortcuts.length > 0);
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
}: {
  readonly activeScopes: readonly HotkeyScope[];
}) {
  const [isOpen, setIsOpen] = React.useState(false);
  const { hotkeys, sequences } = useHotkeyRegistrations();
  const registeredShortcutIds = React.useMemo(() => {
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
  }, [hotkeys, sequences]);
  const shortcutGroups = groupShortcuts(
    getShortcutsForScopes(activeScopes, registeredShortcutIds)
  );

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <ShortcutHelpHotkeys setIsOpen={setIsOpen} />
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setIsOpen(true)}
      >
        Keyboard shortcuts
      </Button>
      <DialogContent className="max-h-[min(38rem,calc(100vh-2rem))] overflow-y-auto rounded-2xl sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>
            Press ? anytime to open this reference.
          </DialogDescription>
        </DialogHeader>
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
                      <div className="text-sm font-medium">
                        {shortcut.label}
                      </div>
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
      </DialogContent>
    </Dialog>
  );
}
