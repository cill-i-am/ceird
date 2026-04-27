"use client";

import { Result, useAtomSet, useAtomValue } from "@effect-atom/atom-react";
import { Add01Icon, Location01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useNavigate } from "@tanstack/react-router";
import {
  REGION_NOT_FOUND_ERROR_TAG,
  SITE_GEOCODING_FAILED_ERROR_TAG,
} from "@task-tracker/jobs-core";
import type { CreateSiteInput, JobRegionOption } from "@task-tracker/jobs-core";
import { Cause, Exit } from "effect";
import * as React from "react";

import { Alert, AlertDescription, AlertTitle } from "#/components/ui/alert";
import { Button } from "#/components/ui/button";
import { CommandSelect } from "#/components/ui/command-select";
import type { CommandSelectGroup } from "#/components/ui/command-select";
import {
  DrawerContent,
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

import { DEFAULT_SITE_COUNTRY } from "./site-create-defaults";
import { createSiteMutationAtom } from "./sites-state";

const NONE_VALUE = "__none__";

interface SitesCreateFormState {
  readonly accessNotes: string;
  readonly addressLine1: string;
  readonly addressLine2: string;
  readonly county: string;
  readonly country: typeof DEFAULT_SITE_COUNTRY;
  readonly eircode: string;
  readonly name: string;
  readonly regionSelection: string;
  readonly town: string;
}

interface SitesCreateFieldErrors {
  readonly addressLine1?: string;
  readonly county?: string;
  readonly eircode?: string;
  readonly name?: string;
  readonly regionSelection?: string;
}

const defaultFormState: SitesCreateFormState = {
  accessNotes: "",
  addressLine1: "",
  addressLine2: "",
  county: "",
  country: DEFAULT_SITE_COUNTRY,
  eircode: "",
  name: "",
  regionSelection: NONE_VALUE,
  town: "",
};

export function SitesCreateSheet() {
  const navigate = useNavigate();
  const options = useAtomValue(jobsOptionsStateAtom).data;
  const createSite = useAtomSet(createSiteMutationAtom, {
    mode: "promiseExit",
  });
  const createResult = useAtomValue(createSiteMutationAtom);
  const [fieldErrors, setFieldErrors] = React.useState<SitesCreateFieldErrors>(
    {}
  );
  const [values, setValues] =
    React.useState<SitesCreateFormState>(defaultFormState);
  const [overlayOpen, setOverlayOpen] = React.useState(true);
  const closeNavigationTimeout = React.useRef<ReturnType<
    typeof setTimeout
  > | null>(null);
  const regionGroups = React.useMemo(
    () => buildRegionSelectionGroups(options.regions),
    [options.regions]
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

    const nextErrors = validate(values, options.regions);
    setFieldErrors(nextErrors);

    if (hasFieldErrors(nextErrors)) {
      return;
    }

    const payload = buildCreateSiteInput(values, options.regions);
    const exit = await createSite(payload);

    if (Exit.isSuccess(exit)) {
      setFieldErrors({});
      setValues(defaultFormState);
      closeSheet();
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
        </DrawerHeader>

        <form
          className="flex min-h-0 flex-1 flex-col"
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

            <FieldGroup>
              <AuthFormField
                label="Site name"
                htmlFor="site-name"
                invalid={Boolean(fieldErrors.name)}
                errorText={fieldErrors.name}
              >
                <Input
                  id="site-name"
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
                htmlFor="site-region"
                invalid={Boolean(fieldErrors.regionSelection)}
                errorText={fieldErrors.regionSelection}
              >
                <CommandSelect
                  id="site-region"
                  value={values.regionSelection}
                  placeholder="Pick region"
                  emptyText="No regions found."
                  groups={regionGroups}
                  ariaInvalid={fieldErrors.regionSelection ? true : undefined}
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
                htmlFor="site-address-line-1"
                invalid={Boolean(fieldErrors.addressLine1)}
                errorText={fieldErrors.addressLine1}
              >
                <Input
                  id="site-address-line-1"
                  value={values.addressLine1}
                  aria-invalid={Boolean(fieldErrors.addressLine1) || undefined}
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
                htmlFor="site-address-line-2"
                invalid={false}
              >
                <Input
                  id="site-address-line-2"
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
                <AuthFormField label="Town" htmlFor="site-town" invalid={false}>
                  <Input
                    id="site-town"
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
                  htmlFor="site-county"
                  invalid={Boolean(fieldErrors.county)}
                  errorText={fieldErrors.county}
                >
                  <Input
                    id="site-county"
                    value={values.county}
                    aria-invalid={Boolean(fieldErrors.county) || undefined}
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
                htmlFor="site-eircode"
                invalid={Boolean(fieldErrors.eircode)}
                errorText={fieldErrors.eircode}
              >
                <Input
                  id="site-eircode"
                  value={values.eircode}
                  aria-invalid={Boolean(fieldErrors.eircode) || undefined}
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
                htmlFor="site-access-notes"
                invalid={false}
              >
                <Textarea
                  id="site-access-notes"
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
            <Button type="submit" disabled={createResult.waiting}>
              <HugeiconsIcon
                icon={Add01Icon}
                strokeWidth={2}
                data-icon="inline-start"
              />
              {createResult.waiting ? "Creating..." : "Create site"}
            </Button>
          </DrawerFooter>
        </form>
      </DrawerContent>
    </ResponsiveDrawer>
  );
}

function buildRegionSelectionGroups(
  regions: readonly { readonly id: string; readonly name: string }[]
) {
  return [
    {
      label: "Region",
      options: [
        { label: "No region yet", value: NONE_VALUE },
        ...regions.map((region) => ({
          label: region.name,
          value: region.id,
        })),
      ],
    },
  ] satisfies readonly CommandSelectGroup[];
}

function isHandledCreateSiteError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "_tag" in error &&
    (error._tag === REGION_NOT_FOUND_ERROR_TAG ||
      error._tag === SITE_GEOCODING_FAILED_ERROR_TAG)
  );
}

function validate(
  values: SitesCreateFormState,
  regions: readonly JobRegionOption[]
): SitesCreateFieldErrors {
  return {
    addressLine1:
      values.addressLine1.trim().length === 0
        ? "Add address line 1."
        : undefined,
    county: values.county.trim().length === 0 ? "Add county." : undefined,
    eircode: values.eircode.trim().length === 0 ? "Add Eircode." : undefined,
    name:
      values.name.trim().length === 0
        ? "Add a site name before creating it."
        : undefined,
    regionSelection:
      values.regionSelection !== NONE_VALUE &&
      findSelectedRegion(values, regions) === undefined
        ? "Pick an available region, or choose no region."
        : undefined,
  };
}

function hasFieldErrors(errors: SitesCreateFieldErrors) {
  return Object.values(errors).some((value) => value !== undefined);
}

function buildCreateSiteInput(
  values: SitesCreateFormState,
  regions: readonly JobRegionOption[]
): CreateSiteInput {
  const selectedRegion = findSelectedRegion(values, regions);

  return {
    accessNotes: toOptionalTrimmedString(values.accessNotes),
    addressLine1: values.addressLine1.trim(),
    addressLine2: toOptionalTrimmedString(values.addressLine2),
    county: values.county.trim(),
    country: values.country,
    eircode: values.eircode.trim(),
    name: values.name.trim(),
    regionId: selectedRegion?.id,
    town: toOptionalTrimmedString(values.town),
  };
}

function findSelectedRegion(
  values: SitesCreateFormState,
  regions: readonly JobRegionOption[]
) {
  if (values.regionSelection === NONE_VALUE) {
    return;
  }

  return regions.find((region) => region.id === values.regionSelection);
}

function toOptionalTrimmedString(value: string) {
  const trimmed = value.trim();

  return trimmed.length === 0 ? undefined : trimmed;
}
