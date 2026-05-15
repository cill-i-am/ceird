"use client";
import type { JobListItem } from "@ceird/jobs-core";
import { SERVICE_AREA_NOT_FOUND_ERROR_TAG } from "@ceird/sites-core";
import type { SiteIdType, SiteOption } from "@ceird/sites-core";
import { Result, useAtomSet, useAtomValue } from "@effect-atom/atom-react";
import {
  Briefcase01Icon,
  Location01Icon,
  MapsLocation01Icon,
  PencilEdit02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Link, useNavigate } from "@tanstack/react-router";
import { Cause, Exit, Option } from "effect";
import * as React from "react";

import { Alert, AlertDescription, AlertTitle } from "#/components/ui/alert";
import { Badge } from "#/components/ui/badge";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "#/components/ui/tabs";
import { Textarea } from "#/components/ui/textarea";
import { AuthFormField } from "#/features/auth/auth-form-field";
import { hasOrganizationElevatedAccess } from "#/features/organizations/organization-viewer";
import type { OrganizationViewer } from "#/features/organizations/organization-viewer";
import {
  buildGoogleMapsUrl,
  buildSiteAddressLines,
  hasSiteCoordinates,
} from "#/features/sites/site-location";
import { SiteLocationMapPreview } from "#/features/sites/site-location-map-preview";
import { submitClientForm } from "#/lib/client-form-submit";

import {
  SITE_CREATE_NONE_VALUE,
  buildCreateSiteInputFromDraft,
  buildSiteServiceAreaSelectionGroups,
  defaultSiteCreateDraft,
  hasSiteCreateFieldErrors,
  validateSiteCreateDraft,
} from "./site-create-form";
import type {
  SiteCreateDraft as SitesCreateFormState,
  SiteCreateFieldErrors as SitesCreateFieldErrors,
} from "./site-create-form";
import {
  sitesOptionsStateAtom,
  updateSiteMutationAtomFamily,
} from "./sites-state";

interface SitesDetailSheetProps {
  readonly hasMoreRelatedJobs?: boolean;
  readonly initialSite: SiteOption | null;
  readonly relatedJobs?: readonly JobListItem[];
  readonly siteId: SiteIdType;
  readonly viewer: OrganizationViewer;
}

// The detail sheet owns the editable site draft while the atom-backed option can refresh underneath it.
// react-doctor-disable-next-line
export function SitesDetailSheet({
  hasMoreRelatedJobs = false,
  initialSite,
  relatedJobs = [],
  siteId,
  viewer,
}: SitesDetailSheetProps) {
  const navigate = useNavigate({ from: "/sites/$siteId" });
  const options = useAtomValue(sitesOptionsStateAtom).data;
  const currentSite =
    options.sites.find((site) => site.id === siteId) ?? initialSite;
  const updateResult = useAtomValue(updateSiteMutationAtomFamily(siteId));
  const updateSite = useAtomSet(updateSiteMutationAtomFamily(siteId), {
    mode: "promiseExit",
  });
  const canEdit = hasOrganizationElevatedAccess(viewer.role);
  const serviceAreaGroups = React.useMemo(
    () => buildSiteServiceAreaSelectionGroups(options.serviceAreas),
    [options.serviceAreas]
  );
  const [values, setValues] = React.useState<SitesCreateFormState>(() =>
    currentSite ? buildFormStateFromSite(currentSite) : defaultSiteCreateDraft
  );
  const [fieldErrors, setFieldErrors] = React.useState<SitesCreateFieldErrors>(
    {}
  );
  const [activeTab, setActiveTab] = React.useState("details");

  // Reset the editable draft when the backing site record changes.
  // react-doctor-disable-next-line
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

  async function handleSubmit() {
    if (!canEdit) {
      return;
    }

    const nextErrors = validateSiteCreateDraft(values, options.serviceAreas);
    setFieldErrors(nextErrors);

    if (hasSiteCreateFieldErrors(nextErrors)) {
      return;
    }

    const exit = await updateSite(
      buildCreateSiteInputFromDraft(values, options.serviceAreas)
    );

    if (Exit.isSuccess(exit)) {
      setFieldErrors({});
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
  }

  if (!currentSite) {
    return (
      <ResponsiveDrawer open onOpenChange={(open) => !open && closeSheet()}>
        <DrawerContent className="route-drawer-content max-h-[92vh] w-full p-2 data-[vaul-drawer-direction=right]:right-0 data-[vaul-drawer-direction=right]:sm:top-1/2 data-[vaul-drawer-direction=right]:sm:right-auto data-[vaul-drawer-direction=right]:sm:bottom-auto data-[vaul-drawer-direction=right]:sm:left-1/2 data-[vaul-drawer-direction=right]:sm:h-auto data-[vaul-drawer-direction=right]:sm:max-h-[calc(100vh-6rem)] data-[vaul-drawer-direction=right]:sm:max-w-[min(42rem,calc(100vw-6rem))] data-[vaul-drawer-direction=right]:sm:-translate-x-1/2 data-[vaul-drawer-direction=right]:sm:-translate-y-1/2 data-[vaul-drawer-direction=right]:sm:animate-none!">
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
      <DrawerContent className="route-drawer-content route-side-drawer-content flex max-h-[92vh] w-full flex-col overflow-hidden p-2 data-[vaul-drawer-direction=right]:inset-y-0 data-[vaul-drawer-direction=right]:right-0 data-[vaul-drawer-direction=right]:h-full data-[vaul-drawer-direction=right]:max-h-none data-[vaul-drawer-direction=right]:sm:max-w-2xl">
        <DrawerHeader className="shrink-0 gap-3 border-b px-5 py-4 text-left md:px-6 md:py-5">
          <div className="flex flex-wrap items-center gap-2">
            {currentSite.serviceAreaName ? (
              <Badge variant="secondary">{currentSite.serviceAreaName}</Badge>
            ) : (
              <Badge variant="outline">No service area</Badge>
            )}
            <Badge
              variant={
                hasSiteCoordinates(currentSite) ? "secondary" : "outline"
              }
            >
              {hasSiteCoordinates(currentSite) ? "Mapped" : "Unmapped"}
            </Badge>
          </div>
          <DrawerTitle>{currentSite.name}</DrawerTitle>
          <DrawerDescription className="sr-only">
            Site location details, editable dispatch fields, and related jobs.
          </DrawerDescription>
        </DrawerHeader>

        <form
          className="flex min-h-0 flex-1 flex-col"
          method="post"
          noValidate
          onSubmit={(event) => submitClientForm(event, handleSubmit)}
        >
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            {Result.builder(updateResult)
              .onError((error) =>
                isServiceAreaNotFoundError(error) ? null : (
                  <Alert variant="destructive" className="mx-5 mt-4 sm:mx-6">
                    <HugeiconsIcon icon={Location01Icon} strokeWidth={2} />
                    <AlertTitle>We couldn&apos;t update that site.</AlertTitle>
                    <AlertDescription>{error.message}</AlertDescription>
                  </Alert>
                )
              )
              .render()}

            <Tabs
              value={activeTab}
              onValueChange={setActiveTab}
              className="min-h-0 flex-1 flex-col gap-0 overflow-hidden"
            >
              <div className="relative z-10 no-scrollbar shrink-0 overflow-x-auto border-b bg-popover px-4 sm:px-6">
                <TabsList
                  aria-label="Site detail sections"
                  variant="line"
                  className="h-10"
                >
                  <TabsTrigger value="details">Details</TabsTrigger>
                  <TabsTrigger value="notes">Notes</TabsTrigger>
                  <TabsTrigger value="jobs">
                    Jobs{" "}
                    <TabCount>
                      {relatedJobs.length}
                      {hasMoreRelatedJobs ? "+" : ""}
                    </TabCount>
                  </TabsTrigger>
                  <TabsTrigger value="edit">Edit</TabsTrigger>
                </TabsList>
              </div>

              <TabsContent
                value="details"
                keepMounted
                className="min-h-0 flex-1 overflow-y-auto px-5 py-4 sm:px-6"
              >
                <SiteDetailSummary site={currentSite} />
              </TabsContent>

              <TabsContent
                value="notes"
                keepMounted
                className="min-h-0 flex-1 overflow-y-auto px-5 py-4 sm:px-6"
              >
                <SiteDetailNotes site={currentSite} />
              </TabsContent>

              <TabsContent
                value="jobs"
                keepMounted
                className="min-h-0 flex-1 overflow-y-auto px-5 py-4 sm:px-6"
              >
                <SiteRelatedJobs
                  hasMoreJobs={hasMoreRelatedJobs}
                  jobs={relatedJobs}
                />
              </TabsContent>

              <TabsContent
                value="edit"
                keepMounted
                className="min-h-0 flex-1 overflow-y-auto px-5 py-4 sm:px-6"
              >
                <div className="flex flex-col gap-5">
                  <FieldGroup>
                    <AuthFormField
                      label="Site name"
                      htmlFor="site-edit-name"
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
                      label="Service area"
                      htmlFor="site-edit-service-area"
                      errorText={fieldErrors.serviceAreaSelection}
                    >
                      <CommandSelect
                        id="site-edit-service-area"
                        value={values.serviceAreaSelection}
                        placeholder="Pick service area"
                        emptyText="No service areas found."
                        groups={serviceAreaGroups}
                        ariaInvalid={
                          fieldErrors.serviceAreaSelection ? true : undefined
                        }
                        disabled={!canEdit}
                        onValueChange={(nextValue) => {
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
                    </AuthFormField>
                  </FieldGroup>

                  <FieldGroup>
                    <AuthFormField
                      label="Address line 1"
                      htmlFor="site-edit-address-line-1"
                      errorText={fieldErrors.addressLine1}
                    >
                      <Input
                        id="site-edit-address-line-1"
                        disabled={!canEdit}
                        value={values.addressLine1}
                        aria-invalid={
                          Boolean(fieldErrors.addressLine1) || undefined
                        }
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
                      <AuthFormField label="Town" htmlFor="site-edit-town">
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
                        errorText={fieldErrors.county}
                      >
                        <Input
                          id="site-edit-county"
                          disabled={!canEdit}
                          value={values.county}
                          aria-invalid={
                            Boolean(fieldErrors.county) || undefined
                          }
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
                      errorText={fieldErrors.eircode}
                    >
                      <Input
                        id="site-edit-eircode"
                        disabled={!canEdit}
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
                      htmlFor="site-edit-access-notes"
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
                </div>
              </TabsContent>
            </Tabs>
          </div>

          <DrawerFooter className="flex shrink-0 flex-col-reverse gap-2 border-t px-5 py-4 sm:flex-row sm:justify-end sm:px-6">
            <Button
              type="button"
              variant="ghost"
              disabled={updateResult.waiting}
              onClick={closeSheet}
            >
              Close
            </Button>
            {canEdit && activeTab === "edit" ? (
              <Button type="submit" loading={updateResult.waiting}>
                {updateResult.waiting ? (
                  "Saving..."
                ) : (
                  <>
                    <HugeiconsIcon
                      icon={PencilEdit02Icon}
                      strokeWidth={2}
                      data-icon="inline-start"
                    />
                    Save changes
                  </>
                )}
              </Button>
            ) : null}
          </DrawerFooter>
        </form>
      </DrawerContent>
    </ResponsiveDrawer>
  );
}

function SiteDetailSummary({ site }: { readonly site: SiteOption }) {
  const addressLines = buildSiteAddressLines(site);
  const googleMapsUrl = buildGoogleMapsUrl(site);
  const isMapped = hasSiteCoordinates(site);

  return (
    <div className="flex flex-col gap-5">
      <section className="rounded-2xl border bg-background">
        <div className="flex flex-col gap-3 border-b px-4 py-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <HugeiconsIcon icon={Location01Icon} strokeWidth={2} />
              <h3 className="text-sm font-medium text-foreground">
                Location summary
              </h3>
            </div>
          </div>
          <Badge
            variant={isMapped ? "secondary" : "outline"}
            className="shrink-0"
          >
            {isMapped ? "Mapped" : "Unmapped"}
          </Badge>
        </div>

        <div className="grid gap-4 px-4 py-4 sm:grid-cols-2">
          <SummaryItem
            label="Service area"
            value={site.serviceAreaName ?? "No service area"}
          />
          <SummaryItem
            label="Coordinates"
            value={
              isMapped
                ? `${site.latitude.toFixed(4)}, ${site.longitude.toFixed(4)}`
                : "Coordinates pending"
            }
          />
          <div className="sm:col-span-2">
            <SummaryItem
              label="Address"
              value={
                addressLines.length > 0 ? (
                  <span className="flex flex-col gap-1">
                    {addressLines.map((line) => (
                      <span key={line}>{line}</span>
                    ))}
                  </span>
                ) : (
                  "No address"
                )
              }
            />
          </div>
        </div>

        {googleMapsUrl ? (
          <div className="border-t px-4 py-3">
            <a
              href={googleMapsUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-full text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <HugeiconsIcon icon={MapsLocation01Icon} strokeWidth={2} />
              Open in Google Maps
            </a>
          </div>
        ) : null}
      </section>

      {isMapped ? <SiteLocationMapPreview site={site} /> : null}
    </div>
  );
}

function SiteDetailNotes({ site }: { readonly site: SiteOption }) {
  return (
    <section className="rounded-2xl border bg-background">
      <div className="flex flex-col gap-1 border-b px-4 py-3">
        <h3 className="text-sm font-medium text-foreground">Site notes</h3>
      </div>

      <div className="px-4 py-4">
        {site.accessNotes ? (
          <p className="max-w-prose text-sm leading-6 text-foreground">
            {site.accessNotes}
          </p>
        ) : (
          <div className="flex items-start gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
              <HugeiconsIcon icon={Location01Icon} strokeWidth={2} />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">
                No site notes yet.
              </p>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                Add gate codes, arrival instructions, or safety context from the
                edit tab when the site needs it.
              </p>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function SummaryItem({
  label,
  value,
}: {
  readonly label: string;
  readonly value: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <p className="text-xs font-medium text-muted-foreground uppercase">
        {label}
      </p>
      <div className="text-sm leading-6 text-foreground">{value}</div>
    </div>
  );
}

function SiteRelatedJobs({
  hasMoreJobs,
  jobs,
}: {
  readonly hasMoreJobs: boolean;
  readonly jobs: readonly JobListItem[];
}) {
  if (jobs.length === 0) {
    return (
      <section className="rounded-2xl border bg-background px-4 py-5">
        <div className="flex items-start gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <HugeiconsIcon icon={Briefcase01Icon} strokeWidth={2} />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-medium text-foreground">
              No jobs linked to this site yet.
            </h3>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              Jobs attached to this site will collect here once work starts.
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="overflow-hidden rounded-2xl border bg-background">
      <div className="flex flex-col gap-1 border-b px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-sm font-medium text-foreground">
            Associated jobs
          </h3>
        </div>
        <Badge variant="secondary">
          {jobs.length}
          {hasMoreJobs ? "+" : ""}{" "}
          {jobs.length === 1 && !hasMoreJobs ? "job linked" : "jobs linked"}
        </Badge>
      </div>

      <div className="divide-y">
        {jobs.map((job) => (
          <Link
            key={job.id}
            to="/jobs/$jobId"
            params={{ jobId: job.id }}
            className="flex min-w-0 items-start justify-between gap-3 px-4 py-3 transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-foreground">
                {job.title}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Updated {formatJobUpdatedAt(job.updatedAt)}
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap justify-end gap-2">
              <Badge variant="secondary">{formatJobStatus(job.status)}</Badge>
              <Badge
                variant={job.priority === "none" ? "outline" : "secondary"}
              >
                {formatJobPriority(job.priority)}
              </Badge>
            </div>
          </Link>
        ))}
        {hasMoreJobs ? (
          <div className="px-4 py-3 text-sm text-muted-foreground">
            Showing the first {jobs.length} jobs linked to this site.
          </div>
        ) : null}
      </div>
    </section>
  );
}

function TabCount({ children }: { readonly children: React.ReactNode }) {
  return (
    <span className="rounded-full bg-muted px-1.5 py-0.5 text-xs leading-none text-muted-foreground">
      {children}
    </span>
  );
}

function formatJobStatus(status: JobListItem["status"]) {
  return status
    .split("_")
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatJobPriority(priority: JobListItem["priority"]) {
  return priority === "none"
    ? "No priority"
    : priority.slice(0, 1).toUpperCase() + priority.slice(1);
}

function formatJobUpdatedAt(updatedAt: string) {
  return new Intl.DateTimeFormat("en-IE", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
    year: "numeric",
  }).format(new Date(updatedAt));
}

function buildFormStateFromSite(site: SiteOption): SitesCreateFormState {
  return {
    accessNotes: site.accessNotes ?? "",
    addressLine1: site.addressLine1 ?? "",
    addressLine2: site.addressLine2 ?? "",
    county: site.county ?? "",
    country: "IE",
    eircode: site.eircode ?? "",
    name: site.name,
    serviceAreaSelection: site.serviceAreaId ?? SITE_CREATE_NONE_VALUE,
    town: site.town ?? "",
  };
}

function isServiceAreaNotFoundError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "_tag" in error &&
    error._tag === SERVICE_AREA_NOT_FOUND_ERROR_TAG
  );
}
