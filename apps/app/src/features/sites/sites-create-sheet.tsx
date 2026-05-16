"use client";
import {
  SERVICE_AREA_NOT_FOUND_ERROR_TAG,
  SITE_GEOCODING_FAILED_ERROR_TAG,
} from "@ceird/sites-core";
import { Result, useAtomSet, useAtomValue } from "@effect-atom/atom-react";
import {
  Add01Icon,
  Cancel01Icon,
  Location01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
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
import { submitClientForm } from "#/lib/client-form-submit";

import {
  SiteCreateDrawerFields,
  buildCreateSiteInputFromDraft,
  buildSiteServiceAreaSelectionGroups,
  defaultSiteCreateDraft,
  hasSiteCreateFieldErrors,
  validateSiteCreateDraft,
} from "./site-create-form";
import type {
  SiteCreateDraft,
  SiteCreateFieldErrors as SiteCreateDraftFieldErrors,
} from "./site-create-form";
import { createSiteMutationAtom, sitesOptionsStateAtom } from "./sites-state";

export type SitesCreateFieldErrors = SiteCreateDraftFieldErrors;

export function SitesCreateSheet() {
  const navigate = useNavigate({ from: "/sites/new" });
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const options = useAtomValue(sitesOptionsStateAtom).data;
  const createSite = useAtomSet(createSiteMutationAtom, {
    mode: "promiseExit",
  });
  const createResult = useAtomValue(createSiteMutationAtom);
  const [fieldErrors, setFieldErrors] = React.useState<SitesCreateFieldErrors>(
    {},
  );
  const [values, setValues] = React.useState<SiteCreateDraft>(
    defaultSiteCreateDraft,
  );
  const [overlayOpen, setOverlayOpen] = React.useState(false);
  const navigateAfterCloseRef = React.useRef(false);
  const resetAfterCloseRef = React.useRef(false);
  const closeNavigationTimeoutRef = React.useRef<ReturnType<
    typeof setTimeout
  > | null>(null);
  const serviceAreaGroups = React.useMemo(
    () => buildSiteServiceAreaSelectionGroups(options.serviceAreas),
    [options.serviceAreas],
  );

  React.useEffect(() => {
    if (pathname === "/sites/new") {
      setOverlayOpen(true);
    }
  }, [pathname]);

  function navigateToSites() {
    React.startTransition(() => {
      navigate({ to: "/sites" });
    });
  }

  function finishClosedSheet() {
    if (closeNavigationTimeoutRef.current) {
      clearTimeout(closeNavigationTimeoutRef.current);
      closeNavigationTimeoutRef.current = null;
    }

    if (resetAfterCloseRef.current) {
      setValues(defaultSiteCreateDraft);
      resetAfterCloseRef.current = false;
    }

    if (navigateAfterCloseRef.current) {
      navigateAfterCloseRef.current = false;
      navigateToSites();
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
      DRAWER_CLOSE_FALLBACK_MS,
    );
  }

  React.useEffect(
    () => () => {
      if (closeNavigationTimeoutRef.current) {
        clearTimeout(closeNavigationTimeoutRef.current);
      }
    },
    [],
  );

  async function handleSubmit() {
    const nextErrors = validateSiteCreateDraft(values, options.serviceAreas);
    setFieldErrors(nextErrors);

    if (hasSiteCreateFieldErrors(nextErrors)) {
      return;
    }

    const payload = buildCreateSiteInputFromDraft(values, options.serviceAreas);
    const exit = await createSite(payload);

    if (Exit.isSuccess(exit)) {
      setFieldErrors({});
      resetAfterCloseRef.current = true;
      closeSheet();
      return;
    }

    const failure = Cause.failureOption(exit.cause);

    if (
      Option.isSome(failure) &&
      failure.value._tag === SERVICE_AREA_NOT_FOUND_ERROR_TAG
    ) {
      setFieldErrors((current) => ({
        ...current,
        serviceAreaSelection: failure.value.message,
      }));
    }

    if (
      Option.isSome(failure) &&
      failure.value._tag === SITE_GEOCODING_FAILED_ERROR_TAG
    ) {
      setFieldErrors((current) => ({
        ...current,
        eircode: failure.value.message,
      }));
    }
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
                Add a site name, service area, address, and access notes.
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
            {Result.builder(createResult)
              .onError((error) =>
                isHandledCreateSiteError(error) ? null : (
                  <Alert variant="destructive">
                    <HugeiconsIcon icon={Location01Icon} strokeWidth={2} />
                    <AlertTitle>We couldn&apos;t create that site.</AlertTitle>
                    <AlertDescription>{error.message}</AlertDescription>
                  </Alert>
                ),
              )
              .render()}

            <SiteCreateDrawerFields
              draft={values}
              errors={fieldErrors}
              idPrefix="site"
              serviceAreaGroups={serviceAreaGroups}
              onDraftChange={setValues}
              onServiceAreaSelectionChange={(nextValue) => {
                setFieldErrors((current) => ({
                  ...current,
                  serviceAreaSelection: undefined,
                }));
                setValues((current) => ({
                  ...current,
                  serviceAreaSelection: nextValue,
                }));
              }}
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
    (error._tag === SERVICE_AREA_NOT_FOUND_ERROR_TAG ||
      error._tag === SITE_GEOCODING_FAILED_ERROR_TAG)
  );
}
