"use client";
import * as React from "react";

function unsubscribeInteractiveMapCapability() {
  return null;
}

function subscribeToInteractiveMapCapability() {
  return unsubscribeInteractiveMapCapability;
}

function canUseInteractiveMapSnapshot() {
  return (
    typeof window !== "undefined" &&
    typeof window.URL?.createObjectURL === "function"
  );
}

function cannotUseInteractiveMapServerSnapshot() {
  return false;
}

export function useCanRenderInteractiveMap() {
  return React.useSyncExternalStore(
    subscribeToInteractiveMapCapability,
    canUseInteractiveMapSnapshot,
    cannotUseInteractiveMapServerSnapshot
  );
}
