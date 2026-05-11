import * as React from "react";

const MOBILE_BREAKPOINT = 768;
const MOBILE_MEDIA_QUERY = `(max-width: ${MOBILE_BREAKPOINT - 1}px)`;

export function useIsMobile() {
  return React.useSyncExternalStore(
    subscribeToMobileViewport,
    getMobileViewportSnapshot,
    () => false
  );
}

function subscribeToMobileViewport(onStoreChange: () => void) {
  if (typeof window === "undefined") {
    return () => null;
  }

  const mediaQuery = window.matchMedia?.(MOBILE_MEDIA_QUERY);
  mediaQuery?.addEventListener("change", onStoreChange);
  window.visualViewport?.addEventListener("resize", onStoreChange);
  window.addEventListener("resize", onStoreChange);
  // Reconcile the server desktop fallback on clients that hydrate directly into a mobile viewport.
  const hydrationCheck = window.setTimeout(onStoreChange, 0);

  return () => {
    window.clearTimeout(hydrationCheck);
    mediaQuery?.removeEventListener("change", onStoreChange);
    window.visualViewport?.removeEventListener("resize", onStoreChange);
    window.removeEventListener("resize", onStoreChange);
  };
}

function getMobileViewportSnapshot() {
  if (typeof window === "undefined") {
    return false;
  }

  const mediaMatches = window.matchMedia?.(MOBILE_MEDIA_QUERY).matches ?? false;
  const viewportWidth = Math.min(
    window.visualViewport?.width ?? Number.POSITIVE_INFINITY,
    document.documentElement.clientWidth || Number.POSITIVE_INFINITY,
    window.innerWidth
  );

  return mediaMatches || viewportWidth < MOBILE_BREAKPOINT;
}
