import { formatForDisplay } from "@tanstack/react-hotkeys";
import * as React from "react";

import { Kbd, KbdGroup } from "#/components/ui/kbd";
import { cn } from "#/lib/utils";

import { splitHotkeySequence } from "./hotkey-sequence";

type ShortcutDisplayPlatform = "linux" | "mac" | "windows";

function detectClientShortcutDisplayPlatform(): ShortcutDisplayPlatform {
  const platform = window.navigator.platform?.toLocaleLowerCase() ?? "";
  const userAgent = window.navigator.userAgent?.toLocaleLowerCase() ?? "";

  if (platform.includes("mac") || userAgent.includes("mac")) {
    return "mac";
  }

  if (platform.includes("win") || userAgent.includes("win")) {
    return "windows";
  }

  return "linux";
}

function getServerShortcutDisplayPlatform(): ShortcutDisplayPlatform {
  return "linux";
}

function subscribeToShortcutDisplayPlatform() {
  return () => {};
}

function useShortcutDisplayPlatform() {
  return React.useSyncExternalStore(
    subscribeToShortcutDisplayPlatform,
    detectClientShortcutDisplayPlatform,
    getServerShortcutDisplayPlatform
  );
}

function formatHotkeyDisplay(
  hotkey: string,
  platform: ShortcutDisplayPlatform
) {
  return formatForDisplay(hotkey, { platform, useSymbols: false }) || hotkey;
}

function formatHotkeyChord(hotkey: string, platform: ShortcutDisplayPlatform) {
  const display = formatHotkeyDisplay(hotkey, platform);

  return display === "+" ? [display] : display.split("+");
}

function formatHotkeyForLabel(
  hotkey: string,
  platform: ShortcutDisplayPlatform
) {
  return splitHotkeySequence(hotkey)
    .map((sequence) => formatHotkeyDisplay(sequence, platform))
    .join(" then ");
}

export function ShortcutHint({
  className,
  decorative = false,
  hotkey,
  label,
}: {
  readonly className?: string;
  readonly decorative?: boolean;
  readonly hotkey: string;
  readonly label: string;
}) {
  const platform = useShortcutDisplayPlatform();
  const sequences = splitHotkeySequence(hotkey);
  const accessibleLabel = `${label} shortcut: ${formatHotkeyForLabel(
    hotkey,
    platform
  )}`;

  return (
    <span
      aria-hidden={decorative ? true : undefined}
      aria-label={decorative ? undefined : accessibleLabel}
      className={cn("inline-flex items-center gap-1", className)}
      data-slot="shortcut-hint"
    >
      {sequences.map((sequence, sequenceIndex) => (
        <React.Fragment key={`${sequence}-${sequenceIndex}`}>
          <KbdGroup>
            {formatHotkeyChord(sequence, platform).map((key) => (
              <Kbd key={key}>{key}</Kbd>
            ))}
          </KbdGroup>
        </React.Fragment>
      ))}
    </span>
  );
}
