"use client";

import { Result, useAtomSet, useAtomValue } from "@effect-atom/atom-react";
import { Add01Icon, Location01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useNavigate } from "@tanstack/react-router";
import {
  SERVICE_AREA_NOT_FOUND_ERROR_TAG,
  SITE_GEOCODING_FAILED_ERROR_TAG,
} from "@task-tracker/jobs-core";
import { Cause, Exit } from "effect";
import * as React from "react";

import { Alert, AlertDescription, AlertTitle } from "#/components/ui/alert";
import { Button } from "#/components/ui/button";
import {
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "#/components/ui/drawer";
import { ResponsiveDrawer } from "#/components/ui/responsive-drawer";
import { jobsOptionsStateAtom } from "#/features/jobs/jobs-state";

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
import { createSiteMutationAtom } from "./sites-state";

export type SitesCreateFormState = SiteCreateDraft;
export type SitesCreateFieldErrors = SiteCreateDraftFieldErrors;

export const defaultSiteFormState = defaultSiteCreateDraft;
export const buildServiceAreaSelectionGroups =
  buildSiteServiceAreaSelectionGroups;
export const validateSiteForm = validateSiteCreateDraft;
export const hasSiteFieldErrors = hasSiteCreateFieldErrors;
export const buildSiteInput = buildCreateSiteInputFromDraft;

export function SitesCreateSheet() {
  const navigate = useNavigate({ from: "/sites/new" });
  const options = useAtomValue(jobsOptionsStateAtom).data;
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
  const [overlayOpen, setOverlayOpen] = React.useState(true);
  const closeNavigationTimeout = React.useRef<ReturnType<
    typeof setTimeout
  > | null>(null);
  const serviceAreaGroups = React.useMemo(
    () => buildSiteServiceAreaSelectionGroups(options.serviceAreas),
    [options.serviceAreas]
  );

  React.useEffect(
    () => () => {
      if (closeNavigationTimeout.current) {
        clearTimeout(closeNavigationTimeout.current);
      }
    },
    []
  );

  function closeSheet({
    delayed = false,
  }: { readonly delayed?: boolean } = {}) {
    setOverlayOpen(false);

    if (closeNavigationTimeout.current) {
      clearTimeout(closeNavigationTimeout.current);
    }

    const navigateToSites = () => {
      React.startTransition(() => {
        navigate({ to: "/sites" });
      });
    };

    if (!delayed) {
      navigateToSites();
      return;
    }

    closeNavigationTimeout.current = setTimeout(navigateToSites, 140);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const nextErrors = validateSiteCreateDraft(values, options.serviceAreas);
    setFieldErrors(nextErrors);

    if (hasSiteCreateFieldErrors(nextErrors)) {
      return;
    }

    const payload = buildCreateSiteInputFromDraft(values, options.serviceAreas);
    const exit = await createSite(payload);

    if (Exit.isSuccess(exit)) {
      setFieldErrors({});
      setValues(defaultSiteCreateDraft);
      closeSheet();
      return;
    }

    const failure = Cause.failureOption(exit.cause);

    if (
      failure._tag === "Some" &&
      failure.value._tag === SERVICE_AREA_NOT_FOUND_ERROR_TAG
    ) {
      setFieldErrors((current) => ({
        ...current,
        serviceAreaSelection: failure.value.message,
      }));
    }

    if (
      failure._tag === "Some" &&
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
          closeSheet({ delayed: true });
        }
      }}
    >
      <DrawerContent className="max-h-[92vh] w-full p-2 data-[vaul-drawer-direction=right]:right-0 data-[vaul-drawer-direction=right]:sm:top-1/2 data-[vaul-drawer-direction=right]:sm:right-auto data-[vaul-drawer-direction=right]:sm:bottom-auto data-[vaul-drawer-direction=right]:sm:left-1/2 data-[vaul-drawer-direction=right]:sm:h-auto data-[vaul-drawer-direction=right]:sm:max-h-[calc(100vh-6rem)] data-[vaul-drawer-direction=right]:sm:max-w-[min(42rem,calc(100vw-6rem))] data-[vaul-drawer-direction=right]:sm:-translate-x-1/2 data-[vaul-drawer-direction=right]:sm:-translate-y-1/2 data-[vaul-drawer-direction=right]:sm:animate-none!">
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
          onSubmit={handleSubmit}
        >
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
            <Button
              type="button"
              variant="ghost"
              disabled={createResult.waiting}
              onClick={() => closeSheet({ delayed: true })}
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
