"use client";
import * as React from "react";

import { Drawer, DrawerNestedRoot } from "#/components/ui/drawer";

const RESPONSIVE_DRAWER_DESKTOP_MIN_WIDTH = 768;

type DrawerDirection = "top" | "bottom" | "left" | "right";
type DrawerRootProps = React.ComponentProps<typeof Drawer>;
type DrawerNestedRootProps = React.ComponentProps<typeof DrawerNestedRoot>;
type DistributiveOmit<T, K extends keyof T> = T extends unknown
  ? Omit<T, K>
  : never;

interface ResponsiveDrawerDirectionOptions {
  readonly desktopDirection?: Extract<DrawerDirection, "left" | "right">;
  readonly mobileDirection?: Extract<DrawerDirection, "top" | "bottom">;
}

type ResponsiveDrawerProps = DistributiveOmit<DrawerRootProps, "direction"> &
  ResponsiveDrawerDirectionOptions;

function ResponsiveDrawer({
  desktopDirection = "right",
  mobileDirection = "bottom",
  ...props
}: ResponsiveDrawerProps) {
  const direction = useResponsiveDrawerDirection({
    desktopDirection,
    mobileDirection,
  });

  return <Drawer {...props} direction={direction} />;
}

type ResponsiveNestedDrawerProps = DistributiveOmit<
  DrawerNestedRootProps,
  "direction"
> &
  ResponsiveDrawerDirectionOptions;

function ResponsiveNestedDrawer({
  desktopDirection = "right",
  mobileDirection = "bottom",
  ...props
}: ResponsiveNestedDrawerProps) {
  const direction = useResponsiveDrawerDirection({
    desktopDirection,
    mobileDirection,
  });

  return <DrawerNestedRoot {...props} direction={direction} />;
}

function useResponsiveDrawerDirection({
  desktopDirection,
  mobileDirection,
}: Required<ResponsiveDrawerDirectionOptions>) {
  const isDesktop = useResponsiveDrawerDesktop();

  return isDesktop ? desktopDirection : mobileDirection;
}

function useResponsiveDrawerDesktop() {
  return React.useSyncExternalStore(
    subscribeToResponsiveDrawerViewport,
    getResponsiveDrawerViewportSnapshot,
    () => true
  );
}

function subscribeToResponsiveDrawerViewport(onStoreChange: () => void) {
  if (typeof window === "undefined") {
    return () => null;
  }

  window.addEventListener("resize", onStoreChange);

  return () => {
    window.removeEventListener("resize", onStoreChange);
  };
}

function getResponsiveDrawerViewportSnapshot() {
  if (typeof window === "undefined") {
    return true;
  }

  return window.innerWidth >= RESPONSIVE_DRAWER_DESKTOP_MIN_WIDTH;
}

export { ResponsiveDrawer, ResponsiveNestedDrawer, useResponsiveDrawerDesktop };
