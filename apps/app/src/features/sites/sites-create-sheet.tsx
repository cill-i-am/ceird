"use client";
import {
  SERVICE_AREA_NOT_FOUND_ERROR_TAG,
  SITE_GEOCODING_FAILED_ERROR_TAG,
} from "@ceird/sites-core";
import { Result, useAtomSet, useAtomValue } from "@effect-atom/atom-react";
import { Add01Icon, Location01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { Cause, Exit, Option } from "effect";
import * as React from "react";

import { Alert, AlertDescription, AlertTitle } from "#/components/ui/alert";
import { Button } from "#/components/ui/button";
import {
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
  SiteCreateFields,
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
    {}
  );
  const [values, setValues] = React.useState<SiteCreateDraft>(
    defaultSiteCreateDraft
  );
  const [overlayOpen, setOverlayOpen] = React.useState(false);
  const navigateAfterCloseRef = React.useRef(false);
  const resetAfterCloseRef = React.useRef(false);
  const successCloseRef = React.useRef<HTMLButtonElement>(null);
  const serviceAreaGroups = React.useMemo(
    () => buildSiteServiceAreaSelectionGroups(options.serviceAreas),
    [options.serviceAreas]
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

  function closeSheet() {
    navigateAfterCloseRef.current = true;
    setOverlayOpen(false);
  }

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
      successCloseRef.current?.click();
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
          if (resetAfterCloseRef.current) {
            setValues(defaultSiteCreateDraft);
            resetAfterCloseRef.current = false;
          }

          if (navigateAfterCloseRef.current) {
            navigateAfterCloseRef.current = false;
            navigateToSites();
          }
        }
      }}
    >
      <DrawerContent className="route-drawer-content max-h-[92vh] w-full p-2 data-[vaul-drawer-direction=right]:right-0 data-[vaul-drawer-direction=right]:sm:top-1/2 data-[vaul-drawer-direction=right]:sm:right-auto data-[vaul-drawer-direction=right]:sm:bottom-auto data-[vaul-drawer-direction=right]:sm:left-1/2 data-[vaul-drawer-direction=right]:sm:h-auto data-[vaul-drawer-direction=right]:sm:max-h-[calc(100vh-6rem)] data-[vaul-drawer-direction=right]:sm:max-w-[min(42rem,calc(100vw-6rem))] data-[vaul-drawer-direction=right]:sm:-translate-x-1/2 data-[vaul-drawer-direction=right]:sm:-translate-y-1/2 data-[vaul-drawer-direction=right]:sm:animate-none!">
        <DrawerHeader className="border-b px-5 py-4 text-left md:px-6 md:py-5">
          <DrawerTitle>New site</DrawerTitle>
          <DrawerDescription>
            Add the address and service area for dispatch.
          </DrawerDescription>
        </DrawerHeader>

        <form
          className="flex min-h-0 flex-1 flex-col"
          method="post"
          noValidate
          onSubmit={(event) => submitClientForm(event, handleSubmit)}
        >
          <DrawerClose asChild>
            <button
              ref={successCloseRef}
              type="button"
              className="hidden"
              aria-hidden="true"
              tabIndex={-1}
            />
          </DrawerClose>
          <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-5 py-4 sm:px-6">
            {Result.builder(createResult)
              .onError((error) =>
                isHandledCreateSiteError(error) ? null : (
                  <Alert variant="destructive">
                    <HugeiconsIcon icon={Location01Icon} strokeWidth={2} />
                    <AlertTitle>We couldn&apos;t create that site.</AlertTitle>
                    <AlertDescription>{error.message}</AlertDescription>
                  </Alert>
                )
              )
              .render()}

            <SiteCreateFields
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

          <DrawerFooter className="flex flex-col-reverse gap-2 border-t px-5 py-4 sm:flex-row sm:justify-end sm:px-6">
            <DrawerClose asChild>
              <Button
                type="button"
                variant="ghost"
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
