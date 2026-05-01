import { formatForDisplay } from "@tanstack/react-hotkeys";
import * as React from "react";

import { Kbd, KbdGroup } from "#/components/ui/kbd";
import { cn } from "#/lib/utils";

import { splitHotkeySequence } from "./hotkey-sequence";

function formatHotkeyDisplay(hotkey: string) {
  return formatForDisplay(hotkey, { useSymbols: false }) || hotkey;
}

function formatHotkeyChord(hotkey: string) {
  const display = formatHotkeyDisplay(hotkey);

  return display === "+" ? [display] : display.split("+");
}

export function formatHotkeyForLabel(hotkey: string) {
  return splitHotkeySequence(hotkey)
    .map((sequence) => formatHotkeyDisplay(sequence))
    .join(" then ");
}

export function ShortcutHint({
  className,
  hotkey,
  label,
}: {
  readonly className?: string;
  readonly hotkey: string;
  readonly label: string;
}) {
  const sequences = splitHotkeySequence(hotkey);
  const accessibleLabel = `${label} shortcut: ${formatHotkeyForLabel(hotkey)}`;

  return (
    <span
      aria-label={accessibleLabel}
      className={cn("inline-flex items-center gap-1", className)}
    >
      {sequences.map((sequence, sequenceIndex) => (
        <React.Fragment key={sequence}>
          {sequenceIndex > 0 ? (
            <span aria-hidden="true" className="text-muted-foreground">
              then
            </span>
          ) : null}
          <KbdGroup>
            {formatHotkeyChord(sequence).map((key) => (
              <Kbd key={key}>{key}</Kbd>
            ))}
          </KbdGroup>
        </React.Fragment>
      ))}
    </span>
  );
}
