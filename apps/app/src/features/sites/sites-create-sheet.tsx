"use client";
import { SITE_LOCATION_RESOLUTION_ERROR_TAG } from "@ceird/sites-core";
import {
  Add01Icon,
  Cancel01Icon,
  Location01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Cause, Exit, Option } from "effect";
import * as React from "react";

import { Alert, AlertDescription, AlertTitle } from "#/components/ui/alert";
import { Button } from "#/components/ui/button";
import {
  DRAWER_CLOSE_FALLBACK_MS,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "#/components/ui/drawer";
import { Skeleton } from "#/components/ui/skeleton";
import {
  WorkspaceSheetDrawer,
  isWorkspaceSheetLayerInteractive,
} from "#/features/workspace-sheets/workspace-sheet-drawer";
import type {
  WorkspaceSheetDrawerKind,
  WorkspaceSheetLayer,
} from "#/features/workspace-sheets/workspace-sheet-drawer";
import { useNotifyWorkspaceSheetSiteCreated } from "#/features/workspace-sheets/workspace-sheet-events";
import { submitClientForm } from "#/lib/client-form-submit";
import { cn } from "#/lib/utils";

import {
  SiteCreateDrawerFields,
  buildCreateSiteInputFromDraft,
  createDefaultSiteCreateDraft,
  hasSiteCreateFieldErrors,
  validateSiteCreateDraft,
} from "./site-create-form";
import type {
  SiteCreateDraft,
  SiteCreateFieldErrors as SiteCreateDraftFieldErrors,
} from "./site-create-form";
import {
  getSitesAsyncErrorMessage,
  isSitesAsyncFailure,
  useCreateSiteMutation,
} from "./sites-state";

type SitesCreateFieldErrors = SiteCreateDraftFieldErrors;

interface SitesCreateSheetContextValue {
  readonly closeSheet: () => void;
  readonly setCreateWaiting: (waiting: boolean) => void;
  readonly siteCreatedTargetId?: string | undefined;
}

const SitesCreateSheetContext =
  React.createContext<SitesCreateSheetContextValue | null>(null);

function useSitesCreateSheetContext() {
  const context = React.use(SitesCreateSheetContext);

  if (context === null) {
    throw new Error("SitesCreateSheet compound components require a parent.");
  }

  return context;
}

function SitesCreateSheetRoot({
  active = true,
  children,
  drawerKind = "root",
  nestedSheet,
  onClose,
  sheetLayer = "active",
  siteCreatedTargetId,
}: {
  readonly active?: boolean;
  readonly children?: React.ReactNode;
  readonly drawerKind?: WorkspaceSheetDrawerKind | undefined;
  readonly nestedSheet?: React.ReactNode;
  readonly onClose?: () => void;
  readonly sheetLayer?: WorkspaceSheetLayer | undefined;
  readonly siteCreatedTargetId?: string | undefined;
} = {}) {
  const canInteract = isWorkspaceSheetLayerInteractive(sheetLayer);
  const [overlayOpen, setOverlayOpen] = React.useState(true);
  const [createWaiting, setCreateWaiting] = React.useState(false);
  const navigateAfterCloseRef = React.useRef(false);
  const closeNavigationTimeoutRef = React.useRef<ReturnType<
    typeof setTimeout
  > | null>(null);

  const finishClosedSheet = React.useCallback(() => {
    if (closeNavigationTimeoutRef.current) {
      clearTimeout(closeNavigationTimeoutRef.current);
      closeNavigationTimeoutRef.current = null;
    }

    if (navigateAfterCloseRef.current) {
      navigateAfterCloseRef.current = false;
      onClose?.();
    }
  }, [onClose]);

  const closeSheet = React.useCallback(() => {
    navigateAfterCloseRef.current = true;
    setOverlayOpen(false);

    if (closeNavigationTimeoutRef.current) {
      clearTimeout(closeNavigationTimeoutRef.current);
    }

    closeNavigationTimeoutRef.current = setTimeout(
      finishClosedSheet,
      DRAWER_CLOSE_FALLBACK_MS
    );
  }, [finishClosedSheet]);

  React.useEffect(
    () => () => {
      if (closeNavigationTimeoutRef.current) {
        clearTimeout(closeNavigationTimeoutRef.current);
      }
    },
    []
  );

  const contextValue = React.useMemo<SitesCreateSheetContextValue>(
    () => ({
      closeSheet,
      setCreateWaiting,
      siteCreatedTargetId,
    }),
    [closeSheet, siteCreatedTargetId]
  );

  if (!active) {
    return null;
  }

  return (
    <WorkspaceSheetDrawer
      drawerKind={drawerKind}
      layer={sheetLayer}
      open={overlayOpen}
      onOpenChange={(open) => {
        if (canInteract && !open && !createWaiting) {
          closeSheet();
        }
      }}
      onAnimationEnd={(open) => {
        if (!open) {
          finishClosedSheet();
        }
      }}
    >
      <DrawerContent
        className="route-drawer-content route-side-drawer-content flex max-h-[92vh] w-full flex-col overflow-hidden p-2 data-[vaul-drawer-direction=right]:inset-y-0 data-[vaul-drawer-direction=right]:right-0 data-[vaul-drawer-direction=right]:h-full data-[vaul-drawer-direction=right]:max-h-none data-[vaul-drawer-direction=right]:sm:max-w-xl"
        data-workspace-sheet-interactive={canInteract ? "true" : "false"}
      >
        <DrawerHeader className="shrink-0 border-b px-5 py-4 text-left md:px-6">
          <div className="flex min-w-0 items-start justify-between gap-4">
            <div className="min-w-0">
              <DrawerTitle>New site</DrawerTitle>
              <DrawerDescription className="sr-only">
                Add a site name, address, and access notes.
              </DrawerDescription>
            </div>
            <DrawerClose asChild>
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                aria-label="Close new site"
                disabled={createWaiting}
              >
                <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} />
              </Button>
            </DrawerClose>
          </div>
        </DrawerHeader>

        <SitesCreateSheetContext value={contextValue}>
          {children ?? <SitesCreateSheetForm />}
        </SitesCreateSheetContext>
      </DrawerContent>
      {nestedSheet}
    </WorkspaceSheetDrawer>
  );
}

function SitesCreateSheetForm() {
  const { closeSheet, setCreateWaiting, siteCreatedTargetId } =
    useSitesCreateSheetContext();
  const notifySiteCreated = useNotifyWorkspaceSheetSiteCreated();
  const [createResult, createSite] = useCreateSiteMutation();
  const [fieldErrors, setFieldErrors] = React.useState<SitesCreateFieldErrors>(
    {}
  );
  const [values, setValues] = React.useState<SiteCreateDraft>(() =>
    createDefaultSiteCreateDraft()
  );
  const updateValues = React.useCallback((patch: Partial<SiteCreateDraft>) => {
    setValues((current) => ({
      ...current,
      ...patch,
    }));
  }, []);

  React.useEffect(() => {
    setCreateWaiting(createResult.waiting);

    return () => {
      setCreateWaiting(false);
    };
  }, [createResult.waiting, setCreateWaiting]);

  async function handleSubmit() {
    const nextErrors = validateSiteCreateDraft(values);
    setFieldErrors(nextErrors);

    if (hasSiteCreateFieldErrors(nextErrors)) {
      return;
    }

    const payload = buildCreateSiteInputFromDraft(values);
    const exit = await createSite(payload);

    if (Exit.isSuccess(exit)) {
      notifySiteCreated(exit.value, siteCreatedTargetId);
      setFieldErrors({});
      closeSheet();
      return;
    }

    const failure = Cause.findErrorOption(exit.cause);

    if (
      Option.isSome(failure) &&
      failure.value._tag === SITE_LOCATION_RESOLUTION_ERROR_TAG
    ) {
      setFieldErrors((current) => ({
        ...current,
        location: failure.value.message,
      }));
    }
  }

  return (
    <form
      className="flex min-h-0 flex-1 flex-col"
      method="post"
      noValidate
      onSubmit={(event) => submitClientForm(event, handleSubmit)}
    >
      <div className="flex flex-1 flex-col overflow-y-auto px-5 py-2 sm:px-6">
        {isSitesAsyncFailure(createResult) &&
        !isHandledCreateSiteError(createResult.error) ? (
          <Alert variant="destructive">
            <HugeiconsIcon icon={Location01Icon} strokeWidth={2} />
            <AlertTitle>We couldn&apos;t create that site.</AlertTitle>
            <AlertDescription>
              {getSitesAsyncErrorMessage(createResult.error)}
            </AlertDescription>
          </Alert>
        ) : null}

        <SiteCreateDrawerFields
          draft={values}
          errors={fieldErrors}
          idPrefix="site"
          onDraftPatch={updateValues}
        />
      </div>

      <DrawerFooter className="shrink-0 flex-col-reverse gap-2 border-t px-5 py-3 sm:flex-row sm:justify-end sm:px-6">
        <Button
          type="button"
          variant="outline"
          disabled={createResult.waiting}
          onClick={closeSheet}
        >
          Cancel
        </Button>
        <Button type="submit" loading={createResult.waiting}>
          {createResult.waiting ? (
            "Creating..."
          ) : (
            <>
              <HugeiconsIcon
                icon={Add01Icon}
                strokeWidth={2}
                data-icon="inline-start"
              />
              Create site
            </>
          )}
        </Button>
      </DrawerFooter>
    </form>
  );
}

function SitesCreateSheetLoadingContent() {
  return (
    <div
      aria-busy="true"
      className="flex min-h-0 flex-1 flex-col"
      data-testid="sites-create-sheet-loading"
    >
      <span className="sr-only" role="status">
        Loading site form.
      </span>
      <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-5 py-5 sm:px-6">
        <SiteCreateFieldSkeleton labelWidth="w-20" inputWidth="w-full" />
        <SiteCreateFieldSkeleton labelWidth="w-16" inputWidth="w-4/5" />
        <div className="space-y-3">
          <Skeleton
            data-testid="sites-create-sheet-skeleton-row"
            className="h-4 w-14 rounded-md"
          />
          <Skeleton
            data-testid="sites-create-sheet-skeleton-row"
            className="h-28 w-full rounded-lg"
          />
        </div>
      </div>
      <DrawerFooter className="shrink-0 flex-col-reverse gap-2 border-t px-5 py-3 sm:flex-row sm:justify-end sm:px-6">
        <Skeleton
          data-testid="sites-create-sheet-skeleton-row"
          className="h-9 w-full rounded-lg sm:w-20"
        />
        <Skeleton
          data-testid="sites-create-sheet-skeleton-row"
          className="h-9 w-full rounded-lg sm:w-28"
        />
      </DrawerFooter>
    </div>
  );
}

function SiteCreateFieldSkeleton({
  inputWidth,
  labelWidth,
}: {
  readonly inputWidth: string;
  readonly labelWidth: string;
}) {
  return (
    <div className="space-y-3">
      <Skeleton
        data-testid="sites-create-sheet-skeleton-row"
        className={cn("h-4 rounded-md", labelWidth)}
      />
      <Skeleton
        data-testid="sites-create-sheet-skeleton-row"
        className={cn("h-9 rounded-lg", inputWidth)}
      />
    </div>
  );
}

export const SitesCreateSheet = Object.assign(SitesCreateSheetRoot, {
  Form: SitesCreateSheetForm,
  LoadingContent: SitesCreateSheetLoadingContent,
});

function isHandledCreateSiteError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "_tag" in error &&
    error._tag === SITE_LOCATION_RESOLUTION_ERROR_TAG
  );
}
