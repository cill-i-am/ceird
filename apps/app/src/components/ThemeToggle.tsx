import { useEffect, useState } from "react";

import { Button } from "#/components/ui/button";

type ThemeMode = "light" | "dark" | "auto";

function getInitialMode(): ThemeMode {
  if (typeof window === "undefined") {
    return "auto";
  }

  const stored = window.localStorage.getItem("theme");
  if (stored === "light" || stored === "dark" || stored === "auto") {
    return stored;
  }

  return "auto";
}

function applyThemeMode(mode: ThemeMode) {
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  let resolved = mode;

  if (mode === "auto") {
    resolved = prefersDark ? "dark" : "light";
  }

  document.documentElement.classList.remove("light", "dark");
  document.documentElement.classList.add(resolved);

  if (mode === "auto") {
    delete document.documentElement.dataset.theme;
  } else {
    document.documentElement.dataset.theme = mode;
  }

  document.documentElement.style.colorScheme = resolved;
}

export default function ThemeToggle() {
  const [mode, setMode] = useState<ThemeMode>("auto");

  useEffect(() => {
    const initialMode = getInitialMode();
    setMode(initialMode);
    applyThemeMode(initialMode);
  }, []);

  useEffect(() => {
    if (mode !== "auto") {
      return;
    }

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyThemeMode("auto");

    media.addEventListener("change", onChange);
    return () => {
      media.removeEventListener("change", onChange);
    };
  }, [mode]);

  function toggleMode() {
    let nextMode: ThemeMode;

    if (mode === "light") {
      nextMode = "dark";
    } else if (mode === "dark") {
      nextMode = "auto";
    } else {
      nextMode = "light";
    }

    setMode(nextMode);
    applyThemeMode(nextMode);
    window.localStorage.setItem("theme", nextMode);
  }

  const label =
    mode === "auto"
      ? "Theme mode: auto (system). Click to switch to light mode."
      : `Theme mode: ${mode}. Click to switch mode.`;

  let buttonLabel = "Light";

  if (mode === "auto") {
    buttonLabel = "Auto";
  } else if (mode === "dark") {
    buttonLabel = "Dark";
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="min-h-11 px-3 sm:min-h-8"
      onClick={toggleMode}
      aria-label={label}
      title={label}
    >
      {buttonLabel}
    </Button>
  );
}
