"use client";
import * as React from "react";

import { Drawer, DrawerNestedRoot } from "#/components/ui/drawer";
import { useIsMobile } from "#/hooks/use-mobile";

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
  const isMobile = useIsMobile();

  return isMobile ? mobileDirection : desktopDirection;
}

export { ResponsiveDrawer, ResponsiveNestedDrawer };
