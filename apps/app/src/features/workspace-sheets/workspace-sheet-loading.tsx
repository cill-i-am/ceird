"use client";
import {
  Cancel01Icon,
  InformationCircleIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import { Button } from "#/components/ui/button";
import {
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "#/components/ui/drawer";
import { ResponsiveDrawer } from "#/components/ui/responsive-drawer";
import { Skeleton } from "#/components/ui/skeleton";

export function WorkspaceSheetSkeleton({
  active = true,
  title,
}: {
  readonly active?: boolean;
  readonly title: string;
}) {
  if (!active) {
    return null;
  }

  return (
    <ResponsiveDrawer open>
      <DrawerContent className="route-drawer-content route-side-drawer-content flex max-h-[92vh] w-full flex-col overflow-hidden p-2 data-[vaul-drawer-direction=right]:inset-y-0 data-[vaul-drawer-direction=right]:right-0 data-[vaul-drawer-direction=right]:h-full data-[vaul-drawer-direction=right]:max-h-none data-[vaul-drawer-direction=right]:sm:max-w-lg">
        <DrawerHeader className="shrink-0 border-b px-5 py-4 text-left md:px-6">
          <DrawerTitle>{title}</DrawerTitle>
          <DrawerDescription className="sr-only">
            Loading sheet content.
          </DrawerDescription>
        </DrawerHeader>
        <div className="flex flex-1 flex-col gap-4 px-5 py-5 sm:px-6">
          <Skeleton
            data-testid="workspace-sheet-skeleton-row"
            className="h-9 w-3/4 rounded-md"
          />
          <Skeleton
            data-testid="workspace-sheet-skeleton-row"
            className="h-24 w-full rounded-lg"
          />
          <Skeleton
            data-testid="workspace-sheet-skeleton-row"
            className="h-24 w-full rounded-lg"
          />
          <Skeleton
            data-testid="workspace-sheet-skeleton-row"
            className="h-12 w-full rounded-lg"
          />
        </div>
      </DrawerContent>
    </ResponsiveDrawer>
  );
}

export function WorkspaceSheetUnavailable({
  actionLabel,
  active = true,
  description,
  onClose,
  title,
}: {
  readonly actionLabel: string;
  readonly active?: boolean;
  readonly description: string;
  readonly onClose: () => void;
  readonly title: string;
}) {
  if (!active) {
    return null;
  }

  return (
    <ResponsiveDrawer
      open
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <DrawerContent className="route-drawer-content max-h-[92vh] w-full p-2 data-[vaul-drawer-direction=right]:right-0 data-[vaul-drawer-direction=right]:sm:top-1/2 data-[vaul-drawer-direction=right]:sm:right-auto data-[vaul-drawer-direction=right]:sm:bottom-auto data-[vaul-drawer-direction=right]:sm:left-1/2 data-[vaul-drawer-direction=right]:sm:h-auto data-[vaul-drawer-direction=right]:sm:max-h-[calc(100vh-6rem)] data-[vaul-drawer-direction=right]:sm:max-w-[min(42rem,calc(100vw-6rem))] data-[vaul-drawer-direction=right]:sm:-translate-x-1/2 data-[vaul-drawer-direction=right]:sm:-translate-y-1/2 data-[vaul-drawer-direction=right]:sm:animate-none!">
        <DrawerHeader className="border-b px-5 py-4 text-left md:px-6 md:py-5">
          <div className="flex min-w-0 items-start justify-between gap-4">
            <div className="min-w-0">
              <DrawerTitle>{title}</DrawerTitle>
              <DrawerDescription>{description}</DrawerDescription>
            </div>
            <span
              aria-hidden="true"
              className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground"
            >
              <HugeiconsIcon icon={InformationCircleIcon} strokeWidth={2} />
            </span>
          </div>
        </DrawerHeader>
        <DrawerFooter className="border-t px-5 py-4 sm:px-6">
          <Button type="button" onClick={onClose}>
            <HugeiconsIcon
              icon={Cancel01Icon}
              strokeWidth={2}
              data-icon="inline-start"
            />
            {actionLabel}
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </ResponsiveDrawer>
  );
}
