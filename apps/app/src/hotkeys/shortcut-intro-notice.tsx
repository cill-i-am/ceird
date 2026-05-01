"use client";

import * as React from "react";

import { Button } from "#/components/ui/button";

const SHORTCUT_INTRO_STORAGE_KEY = "task-tracker-shortcut-intro-seen";

function getShortcutIntroSeen() {
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
  try {
    const { localStorage } = window;

    if (typeof localStorage.setItem === "function") {
      localStorage.setItem(SHORTCUT_INTRO_STORAGE_KEY, "1");
    }
  } catch {
    // The notice still hides for this session when storage is unavailable.
  }
}

export function ShortcutIntroNotice() {
  const [isSeen, setIsSeen] = React.useState(true);

  React.useEffect(() => {
    setIsSeen(getShortcutIntroSeen());
  }, []);

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
          setIsSeen(true);
        }}
      >
        Got it
      </Button>
    </div>
  );
}
