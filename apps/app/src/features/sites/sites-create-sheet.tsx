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
import { ResponsiveDrawer } from "#/components/ui/responsive-drawer";
import { useNotifyWorkspaceSheetSiteCreated } from "#/features/workspace-sheets/workspace-sheet-events";
import { submitClientForm } from "#/lib/client-form-submit";

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

export type SitesCreateFieldErrors = SiteCreateDraftFieldErrors;

export function SitesCreateSheet({
  active = true,
  onClose,
  siteCreatedTargetId,
}: {
  readonly active?: boolean;
  readonly onClose?: () => void;
  readonly siteCreatedTargetId?: string | undefined;
} = {}) {
  const notifySiteCreated = useNotifyWorkspaceSheetSiteCreated();
  const [createResult, createSite] = useCreateSiteMutation();
  const [fieldErrors, setFieldErrors] = React.useState<SitesCreateFieldErrors>(
    {}
  );
  const [values, setValues] = React.useState<SiteCreateDraft>(() =>
    createDefaultSiteCreateDraft()
  );
  const [overlayOpen, setOverlayOpen] = React.useState(true);
  const navigateAfterCloseRef = React.useRef(false);
  const resetAfterCloseRef = React.useRef(false);
  const closeNavigationTimeoutRef = React.useRef<ReturnType<
    typeof setTimeout
  > | null>(null);
  const updateValues = React.useCallback((patch: Partial<SiteCreateDraft>) => {
    setValues((current) => ({
      ...current,
      ...patch,
    }));
  }, []);
  function finishClosedSheet() {
    if (closeNavigationTimeoutRef.current) {
      clearTimeout(closeNavigationTimeoutRef.current);
      closeNavigationTimeoutRef.current = null;
    }

    if (resetAfterCloseRef.current) {
      setValues(createDefaultSiteCreateDraft());
      resetAfterCloseRef.current = false;
    }

    if (navigateAfterCloseRef.current) {
      navigateAfterCloseRef.current = false;
      onClose?.();
    }
  }

  function closeSheet() {
    navigateAfterCloseRef.current = true;
    setOverlayOpen(false);

    if (closeNavigationTimeoutRef.current) {
      clearTimeout(closeNavigationTimeoutRef.current);
    }

    closeNavigationTimeoutRef.current = setTimeout(
      finishClosedSheet,
      DRAWER_CLOSE_FALLBACK_MS
    );
  }

  React.useEffect(
    () => () => {
      if (closeNavigationTimeoutRef.current) {
        clearTimeout(closeNavigationTimeoutRef.current);
      }
    },
    []
  );

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
      resetAfterCloseRef.current = true;
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

  if (!active) {
    return null;
  }

  return (
    <ResponsiveDrawer
      open={overlayOpen}
      onOpenChange={(open) => {
        if (!open && !createResult.waiting) {
          closeSheet();
        }
      }}
      onAnimationEnd={(open) => {
        if (!open) {
          finishClosedSheet();
        }
      }}
    >
      <DrawerContent className="route-drawer-content route-side-drawer-content flex max-h-[92vh] w-full flex-col overflow-hidden p-2 data-[vaul-drawer-direction=right]:inset-y-0 data-[vaul-drawer-direction=right]:right-0 data-[vaul-drawer-direction=right]:h-full data-[vaul-drawer-direction=right]:max-h-none data-[vaul-drawer-direction=right]:sm:max-w-xl">
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
                disabled={createResult.waiting}
              >
                <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} />
              </Button>
            </DrawerClose>
          </div>
        </DrawerHeader>

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
            <DrawerClose asChild>
              <Button
                type="button"
                variant="outline"
                disabled={createResult.waiting}
              >
                Cancel
              </Button>
            </DrawerClose>
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
      </DrawerContent>
    </ResponsiveDrawer>
  );
}

function isHandledCreateSiteError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "_tag" in error &&
    error._tag === SITE_LOCATION_RESOLUTION_ERROR_TAG
  );
}
