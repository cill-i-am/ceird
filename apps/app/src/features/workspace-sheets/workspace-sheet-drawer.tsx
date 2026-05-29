"use client";
import * as React from "react";

import {
  ResponsiveDrawer,
  ResponsiveNestedDrawer,
} from "#/components/ui/responsive-drawer";

export type WorkspaceSheetDrawerKind = "nested" | "root";
export type WorkspaceSheetLayer = "active" | "background";

export function getWorkspaceSheetDrawerKind(
  index: number
): WorkspaceSheetDrawerKind {
  return index === 0 ? "root" : "nested";
}

export function getWorkspaceSheetLayer(
  index: number,
  total: number
): WorkspaceSheetLayer {
  return index === total - 1 ? "active" : "background";
}

export function isWorkspaceSheetLayerInteractive(layer: WorkspaceSheetLayer) {
  return layer === "active";
}

interface WorkspaceSheetDrawerProps {
  readonly children?: React.ReactNode;
  readonly drawerKind: WorkspaceSheetDrawerKind;
  readonly layer: WorkspaceSheetLayer;
  readonly onAnimationEnd?: ((open: boolean) => void) | undefined;
  readonly onOpenChange?: ((open: boolean) => void) | undefined;
  readonly open?: boolean | undefined;
}

export function WorkspaceSheetDrawer({
  drawerKind,
  layer,
  ...props
}: WorkspaceSheetDrawerProps) {
  const dismissible = isWorkspaceSheetLayerInteractive(layer);

  if (drawerKind === "nested") {
    return <ResponsiveNestedDrawer {...props} dismissible={dismissible} />;
  }

  return <ResponsiveDrawer {...props} dismissible={dismissible} />;
}
