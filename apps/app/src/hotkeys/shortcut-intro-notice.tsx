"use client";
import * as React from "react";

import { Button } from "#/components/ui/button";

const SHORTCUT_INTRO_STORAGE_KEY = "ceird-shortcut-intro-seen";
const SHORTCUT_INTRO_SEEN_EVENT = "ceird:shortcut-intro-seen";
let shortcutIntroSeenInMemory = false;

function getShortcutIntroSeen() {
  if (shortcutIntroSeenInMemory) {
    return true;
  }

  try {
    const { localStorage } = window;

    if (typeof localStorage.getItem !== "function") {
      return false;
    }

    return localStorage.getItem(SHORTCUT_INTRO_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function setShortcutIntroSeen() {
  shortcutIntroSeenInMemory = true;

  try {
    const { localStorage } = window;

    if (typeof localStorage.setItem === "function") {
      localStorage.setItem(SHORTCUT_INTRO_STORAGE_KEY, "1");
    }
  } catch {
    // The notice still hides for this session when storage is unavailable.
  }

  window.dispatchEvent(new Event(SHORTCUT_INTRO_SEEN_EVENT));
}

function subscribeToShortcutIntroSeen(onStoreChange: () => void) {
  window.addEventListener(SHORTCUT_INTRO_SEEN_EVENT, onStoreChange);

  return () => {
    window.removeEventListener(SHORTCUT_INTRO_SEEN_EVENT, onStoreChange);
  };
}

const getShortcutIntroSeenServerSnapshot = () => true;

export function ShortcutIntroNotice() {
  const isSeen = React.useSyncExternalStore(
    subscribeToShortcutIntroSeen,
    getShortcutIntroSeen,
    getShortcutIntroSeenServerSnapshot
  );

  if (isSeen) {
    return null;
  }

  return (
    <div
      aria-live="polite"
      className="fixed right-3 bottom-3 z-50 flex max-w-[calc(100vw-1.5rem)] items-center gap-3 rounded-lg border border-border/70 bg-popover px-3 py-2 text-sm text-popover-foreground shadow-lg sm:right-5 sm:bottom-5"
    >
      <span className="min-w-0">
        Keyboard shortcuts are available. Press ? anytime.
      </span>
      <Button
        type="button"
        variant="secondary"
        size="xs"
        onClick={() => {
          setShortcutIntroSeen();
        }}
      >
        Got it
      </Button>
    </div>
  );
}
