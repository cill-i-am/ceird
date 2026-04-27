"use client";

import { Result, useAtomSet, useAtomValue } from "@effect-atom/atom-react";
import { Location01Icon, PencilEdit02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useNavigate } from "@tanstack/react-router";
import { REGION_NOT_FOUND_ERROR_TAG } from "@task-tracker/jobs-core";
import type { JobSiteOption, SiteIdType } from "@task-tracker/jobs-core";
import { Cause, Exit } from "effect";
import * as React from "react";

import { Alert, AlertDescription, AlertTitle } from "#/components/ui/alert";
import { Button } from "#/components/ui/button";
import { CommandSelect } from "#/components/ui/command-select";
import {
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "#/components/ui/drawer";
import { FieldGroup } from "#/components/ui/field";
import { Input } from "#/components/ui/input";
import { ResponsiveDrawer } from "#/components/ui/responsive-drawer";
import { Textarea } from "#/components/ui/textarea";
import { AuthFormField } from "#/features/auth/auth-form-field";
import { jobsOptionsStateAtom } from "#/features/jobs/jobs-state";
import { hasJobsElevatedAccess } from "#/features/jobs/jobs-viewer";
import type { JobsViewer } from "#/features/jobs/jobs-viewer";

import {
  buildRegionSelectionGroups,
  buildSiteInput,
  hasSiteFieldErrors,
  validateSiteForm,
} from "./sites-create-sheet";
import type {
  SitesCreateFieldErrors,
  SitesCreateFormState,
} from "./sites-create-sheet";
import { updateSiteMutationAtomFamily } from "./sites-state";

const NONE_VALUE = "__none__";

interface SitesDetailSheetProps {
  readonly initialSite: JobSiteOption | null;
  readonly siteId: SiteIdType;
  readonly viewer: JobsViewer;
}

export function SitesDetailSheet({
  initialSite,
  siteId,
  viewer,
}: SitesDetailSheetProps) {
  const navigate = useNavigate();
  const options = useAtomValue(jobsOptionsStateAtom).data;
  const currentSite =
    options.sites.find((site) => site.id === siteId) ?? initialSite;
  const updateResult = useAtomValue(updateSiteMutationAtomFamily(siteId));
  const updateSite = useAtomSet(updateSiteMutationAtomFamily(siteId), {
    mode: "promiseExit",
  });
  const canEdit = hasJobsElevatedAccess(viewer.role);
  const regionGroups = React.useMemo(
    () => buildRegionSelectionGroups(options.regions),
    [options.regions]
  );
  const [values, setValues] = React.useState<SitesCreateFormState>(() =>
    currentSite ? buildFormStateFromSite(currentSite) : buildEmptySiteState()
  );
  const [fieldErrors, setFieldErrors] = React.useState<SitesCreateFieldErrors>(
    {}
  );

  React.useEffect(() => {
    if (currentSite) {
      setValues(buildFormStateFromSite(currentSite));
      setFieldErrors({});
    }
  }, [currentSite]);

  function closeSheet() {
    React.startTransition(() => {
      navigate({ to: "/sites" });
    });
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canEdit) {
      return;
    }

    const nextErrors = validateSiteForm(values, options.regions);
    setFieldErrors(nextErrors);

    if (hasSiteFieldErrors(nextErrors)) {
      return;
    }

    const exit = await updateSite(buildSiteInput(values, options.regions));

    if (Exit.isSuccess(exit)) {
      setFieldErrors({});
      return;
    }

    const failure = Cause.failureOption(exit.cause);

    if (
      failure._tag === "Some" &&
      failure.value._tag === REGION_NOT_FOUND_ERROR_TAG
    ) {
      setFieldErrors((current) => ({
        ...current,
        regionSelection: failure.value.message,
      }));
    }
  }

  if (!currentSite) {
    return (
      <ResponsiveDrawer open onOpenChange={(open) => !open && closeSheet()}>
        <DrawerContent className="max-h-[92vh] w-full p-2 data-[vaul-drawer-direction=right]:right-0 data-[vaul-drawer-direction=right]:sm:top-1/2 data-[vaul-drawer-direction=right]:sm:right-auto data-[vaul-drawer-direction=right]:sm:bottom-auto data-[vaul-drawer-direction=right]:sm:left-1/2 data-[vaul-drawer-direction=right]:sm:h-auto data-[vaul-drawer-direction=right]:sm:max-h-[calc(100vh-6rem)] data-[vaul-drawer-direction=right]:sm:max-w-[min(42rem,calc(100vw-6rem))] data-[vaul-drawer-direction=right]:sm:-translate-x-1/2 data-[vaul-drawer-direction=right]:sm:-translate-y-1/2 data-[vaul-drawer-direction=right]:sm:animate-none!">
          <DrawerHeader className="border-b px-5 py-4 text-left md:px-6 md:py-5">
            <DrawerTitle>Site not found</DrawerTitle>
            <DrawerDescription>
              This site is no longer available in the current organization.
            </DrawerDescription>
          </DrawerHeader>
          <DrawerFooter className="border-t px-5 py-4 sm:px-6">
            <Button type="button" onClick={closeSheet}>
              Back to sites
            </Button>
          </DrawerFooter>
        </DrawerContent>
      </ResponsiveDrawer>
    );
  }

  return (
    <ResponsiveDrawer open onOpenChange={(open) => !open && closeSheet()}>
      <DrawerContent className="max-h-[92vh] w-full p-2 data-[vaul-drawer-direction=right]:right-0 data-[vaul-drawer-direction=right]:sm:top-1/2 data-[vaul-drawer-direction=right]:sm:right-auto data-[vaul-drawer-direction=right]:sm:bottom-auto data-[vaul-drawer-direction=right]:sm:left-1/2 data-[vaul-drawer-direction=right]:sm:h-auto data-[vaul-drawer-direction=right]:sm:max-h-[calc(100vh-6rem)] data-[vaul-drawer-direction=right]:sm:max-w-[min(42rem,calc(100vw-6rem))] data-[vaul-drawer-direction=right]:sm:-translate-x-1/2 data-[vaul-drawer-direction=right]:sm:-translate-y-1/2 data-[vaul-drawer-direction=right]:sm:animate-none!">
        <DrawerHeader className="border-b px-5 py-4 text-left md:px-6 md:py-5">
          <DrawerTitle>{currentSite.name}</DrawerTitle>
          <DrawerDescription>
            Inspect and update the dispatch details for this site.
          </DrawerDescription>
        </DrawerHeader>

        <form
          className="flex min-h-0 flex-1 flex-col"
          noValidate
          onSubmit={handleSubmit}
        >
          <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-5 py-4 sm:px-6">
            {Result.builder(updateResult)
              .onError((error) =>
                isRegionNotFoundError(error) ? null : (
                  <Alert variant="destructive">
                    <HugeiconsIcon icon={Location01Icon} strokeWidth={2} />
                    <AlertTitle>We couldn&apos;t update that site.</AlertTitle>
                    <AlertDescription>{error.message}</AlertDescription>
                  </Alert>
                )
              )
              .render()}

            <FieldGroup>
              <AuthFormField
                label="Site name"
                htmlFor="site-edit-name"
                invalid={Boolean(fieldErrors.name)}
                errorText={fieldErrors.name}
              >
                <Input
                  id="site-edit-name"
                  disabled={!canEdit}
                  value={values.name}
                  aria-invalid={Boolean(fieldErrors.name) || undefined}
                  onChange={(event) =>
                    setValues((current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                />
              </AuthFormField>

              <AuthFormField
                label="Region"
                htmlFor="site-edit-region"
                invalid={Boolean(fieldErrors.regionSelection)}
                errorText={fieldErrors.regionSelection}
              >
                <CommandSelect
                  id="site-edit-region"
                  value={values.regionSelection}
                  placeholder="Pick region"
                  emptyText="No regions found."
                  groups={regionGroups}
                  ariaInvalid={fieldErrors.regionSelection ? true : undefined}
                  disabled={!canEdit}
                  onValueChange={(nextValue) => {
                    setFieldErrors((current) => ({
                      ...current,
                      regionSelection: undefined,
                    }));
                    setValues((current) => ({
                      ...current,
                      regionSelection: nextValue,
                    }));
                  }}
                />
              </AuthFormField>
            </FieldGroup>

            <FieldGroup>
              <AuthFormField
                label="Address line 1"
                htmlFor="site-edit-address-line-1"
                invalid={false}
              >
                <Input
                  id="site-edit-address-line-1"
                  disabled={!canEdit}
                  value={values.addressLine1}
                  onChange={(event) =>
                    setValues((current) => ({
                      ...current,
                      addressLine1: event.target.value,
                    }))
                  }
                />
              </AuthFormField>

              <AuthFormField
                label="Address line 2"
                htmlFor="site-edit-address-line-2"
                invalid={false}
              >
                <Input
                  id="site-edit-address-line-2"
                  disabled={!canEdit}
                  value={values.addressLine2}
                  onChange={(event) =>
                    setValues((current) => ({
                      ...current,
                      addressLine2: event.target.value,
                    }))
                  }
                />
              </AuthFormField>

              <div className="grid gap-4 sm:grid-cols-2">
                <AuthFormField
                  label="Town"
                  htmlFor="site-edit-town"
                  invalid={false}
                >
                  <Input
                    id="site-edit-town"
                    disabled={!canEdit}
                    value={values.town}
                    onChange={(event) =>
                      setValues((current) => ({
                        ...current,
                        town: event.target.value,
                      }))
                    }
                  />
                </AuthFormField>

                <AuthFormField
                  label="County"
                  htmlFor="site-edit-county"
                  invalid={false}
                >
                  <Input
                    id="site-edit-county"
                    disabled={!canEdit}
                    value={values.county}
                    onChange={(event) =>
                      setValues((current) => ({
                        ...current,
                        county: event.target.value,
                      }))
                    }
                  />
                </AuthFormField>
              </div>

              <AuthFormField
                label="Eircode"
                htmlFor="site-edit-eircode"
                invalid={false}
              >
                <Input
                  id="site-edit-eircode"
                  disabled={!canEdit}
                  value={values.eircode}
                  onChange={(event) =>
                    setValues((current) => ({
                      ...current,
                      eircode: event.target.value,
                    }))
                  }
                />
              </AuthFormField>

              <AuthFormField
                label="Access notes"
                htmlFor="site-edit-access-notes"
                invalid={false}
              >
                <Textarea
                  id="site-edit-access-notes"
                  disabled={!canEdit}
                  rows={3}
                  value={values.accessNotes}
                  onChange={(event) =>
                    setValues((current) => ({
                      ...current,
                      accessNotes: event.target.value,
                    }))
                  }
                />
              </AuthFormField>
            </FieldGroup>

            <div className="grid gap-4 sm:grid-cols-2">
              <AuthFormField
                label="Latitude"
                htmlFor="site-edit-latitude"
                invalid={Boolean(fieldErrors.latitude)}
                errorText={fieldErrors.latitude}
              >
                <Input
                  id="site-edit-latitude"
                  disabled={!canEdit}
                  inputMode="decimal"
                  value={values.latitude}
                  aria-invalid={Boolean(fieldErrors.latitude) || undefined}
                  onChange={(event) =>
                    setValues((current) => ({
                      ...current,
                      latitude: event.target.value,
                    }))
                  }
                />
              </AuthFormField>

              <AuthFormField
                label="Longitude"
                htmlFor="site-edit-longitude"
                invalid={Boolean(fieldErrors.longitude)}
                errorText={fieldErrors.longitude}
              >
                <Input
                  id="site-edit-longitude"
                  disabled={!canEdit}
                  inputMode="decimal"
                  value={values.longitude}
                  aria-invalid={Boolean(fieldErrors.longitude) || undefined}
                  onChange={(event) =>
                    setValues((current) => ({
                      ...current,
                      longitude: event.target.value,
                    }))
                  }
                />
              </AuthFormField>
            </div>
          </div>

          <DrawerFooter className="flex flex-col-reverse gap-2 border-t px-5 py-4 sm:flex-row sm:justify-end sm:px-6">
            <Button
              type="button"
              variant="ghost"
              disabled={updateResult.waiting}
              onClick={closeSheet}
            >
              Close
            </Button>
            {canEdit ? (
              <Button type="submit" disabled={updateResult.waiting}>
                <HugeiconsIcon
                  icon={PencilEdit02Icon}
                  strokeWidth={2}
                  data-icon="inline-start"
                />
                {updateResult.waiting ? "Saving..." : "Save changes"}
              </Button>
            ) : null}
          </DrawerFooter>
        </form>
      </DrawerContent>
    </ResponsiveDrawer>
  );
}

function buildFormStateFromSite(site: JobSiteOption): SitesCreateFormState {
  return {
    accessNotes: site.accessNotes ?? "",
    addressLine1: site.addressLine1 ?? "",
    addressLine2: site.addressLine2 ?? "",
    county: site.county ?? "",
    eircode: site.eircode ?? "",
    latitude: site.latitude === undefined ? "" : String(site.latitude),
    longitude: site.longitude === undefined ? "" : String(site.longitude),
    name: site.name,
    regionSelection: site.regionId ?? NONE_VALUE,
    town: site.town ?? "",
  };
}

function buildEmptySiteState(): SitesCreateFormState {
  return {
    accessNotes: "",
    addressLine1: "",
    addressLine2: "",
    county: "",
    eircode: "",
    latitude: "",
    longitude: "",
    name: "",
    regionSelection: NONE_VALUE,
    town: "",
  };
}

function isRegionNotFoundError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "_tag" in error &&
    error._tag === REGION_NOT_FOUND_ERROR_TAG
  );
}
