import * as React from "react";

function unsubscribeHydration() {
  return null;
}

function subscribeToHydration() {
  return unsubscribeHydration;
}
const getHydratedSnapshot = () => true;
const getServerHydrationSnapshot = () => false;

export function useIsHydrated() {
  return React.useSyncExternalStore(
    subscribeToHydration,
    getHydratedSnapshot,
    getServerHydrationSnapshot
  );
}
