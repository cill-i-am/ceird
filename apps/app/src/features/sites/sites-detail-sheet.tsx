"use client";
import type { JobListItem, JobPriority, JobStatus } from "@ceird/jobs-core";
import type { SiteIdType, SiteOption } from "@ceird/sites-core";
import { SITE_LOCATION_RESOLUTION_ERROR_TAG } from "@ceird/sites-core";
import {
  ArrowUpRight01Icon,
  Cancel01Icon,
  Location01Icon,
  PencilEdit02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Cause, Exit, Option } from "effect";
import * as React from "react";

import { Alert, AlertDescription, AlertTitle } from "#/components/ui/alert";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import {
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "#/components/ui/drawer";
import { Input } from "#/components/ui/input";
import {
  ResponsiveDrawer,
  ResponsiveNestedDrawer,
} from "#/components/ui/responsive-drawer";
import { hasOrganizationElevatedAccess } from "#/features/organizations/organization-viewer";
import type { OrganizationViewer } from "#/features/organizations/organization-viewer";
import {
  buildGoogleMapsUrl,
  buildSiteAddressLines,
} from "#/features/sites/site-location";
import { SiteLocationMapPreview } from "#/features/sites/site-location-map-preview";
import { usePushWorkspaceSheet } from "#/features/workspace-sheets/workspace-sheet-navigation";
import { submitClientForm } from "#/lib/client-form-submit";

import {
  SiteAccessNotesField,
  SiteAddressFields,
  buildUpdateSiteInputFromDraft,
  createDefaultSiteCreateDraft,
  createSiteCreateDraftFromSite,
  hasSiteCreateFieldErrors,
  siteCreateDraftLocationEqualsSite,
  validateSiteCreateDraft,
} from "./site-create-form";
import type {
  SiteCreateDraft as SitesCreateFormState,
  SiteCreateFieldErrors as SitesCreateFieldErrors,
} from "./site-create-form";
import {
  getSitesAsyncErrorMessage,
  isSitesAsyncFailure,
  useSitesOptions,
  useUpdateSiteMutation,
} from "./sites-state";

interface SitesDetailSheetProps {
  readonly active?: boolean;
  readonly hasMoreRelatedJobs?: boolean;
  readonly initialSite: SiteOption | null;
  readonly onClose?: () => void;
  readonly relatedJobs?: readonly JobListItem[];
  readonly siteId: SiteIdType;
  readonly viewer: OrganizationViewer;
}

const EMPTY_RELATED_JOBS: readonly JobListItem[] = [];
const SITE_JOB_UPDATED_AT_FORMATTER = new Intl.DateTimeFormat("en-IE", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
  year: "numeric",
});
const RELATED_JOB_PRIORITY_LABELS = {
  high: "High",
  low: "Low",
  medium: "Medium",
  none: "No priority",
  urgent: "Urgent",
} satisfies Record<JobPriority, string>;
const RELATED_JOB_STATUS_LABELS = {
  blocked: "Blocked",
  canceled: "Canceled",
  completed: "Completed",
  in_progress: "In progress",
  new: "New",
  triaged: "Triaged",
} satisfies Record<JobStatus, string>;
type SiteDetailEditor = "location" | "notes";

// The detail sheet owns the editable site draft while the provider-backed option can refresh underneath it.
// react-doctor-disable-next-line
export function SitesDetailSheet({
  active = true,
  hasMoreRelatedJobs = false,
  initialSite,
  onClose,
  relatedJobs = EMPTY_RELATED_JOBS,
  siteId,
  viewer,
  // react-doctor-disable-next-line
}: SitesDetailSheetProps) {
  const options = useSitesOptions();
  const currentSite = React.useMemo(
    () => options.sites.find((site) => site.id === siteId) ?? initialSite,
    [initialSite, options.sites, siteId]
  );
  const [updateResult, updateSite] = useUpdateSiteMutation(siteId);
  const canEdit = hasOrganizationElevatedAccess(viewer.role);
  const [values, setValues] = React.useState<SitesCreateFormState>(() =>
    currentSite
      ? createSiteCreateDraftFromSite(currentSite)
      : createDefaultSiteCreateDraft()
  );
  const [fieldErrors, setFieldErrors] = React.useState<SitesCreateFieldErrors>(
    {}
  );
  const [activeEditor, setActiveEditor] =
    React.useState<SiteDetailEditor | null>(null);
  const [drawerOpen, setDrawerOpen] = React.useState(true);
  const [editorOpen, setEditorOpen] = React.useState(false);
  const [isEditingName, setIsEditingName] = React.useState(false);
  const [nameDraft, setNameDraft] = React.useState(currentSite?.name ?? "");
  const navigateAfterCloseRef = React.useRef(false);

  // Reset the editable draft when the backing site record changes.
  // react-doctor-disable-next-line
  React.useEffect(() => {
    if (currentSite) {
      setValues(createSiteCreateDraftFromSite(currentSite));
      setNameDraft(currentSite.name);
      setFieldErrors({});
    }
  }, [currentSite]);

  function closeSheet() {
    navigateAfterCloseRef.current = true;
    setDrawerOpen(false);
  }

  function openEditor(editor: SiteDetailEditor) {
    if (!currentSite) {
      return;
    }

    setValues(createSiteCreateDraftFromSite(currentSite));
    setFieldErrors({});
    setActiveEditor(editor);
    setEditorOpen(true);
  }

  const resetEditorAfterClose = React.useCallback(() => {
    if (!currentSite) {
      setValues(createDefaultSiteCreateDraft());
      setFieldErrors({});
      setActiveEditor(null);
      return;
    }

    setValues(createSiteCreateDraftFromSite(currentSite));
    setFieldErrors({});
    setActiveEditor(null);
  }, [currentSite]);

  async function submitSiteDraft(
    nextValues: SitesCreateFormState,
    onSuccess?: () => void,
    buildOptions: {
      readonly clearEmptyLocation?: boolean;
      readonly includeLocation?: boolean;
    } = {}
  ) {
    if (!canEdit) {
      return false;
    }

    const nextErrors = validateSiteCreateDraft(nextValues);
    setFieldErrors(nextErrors);

    if (hasSiteCreateFieldErrors(nextErrors)) {
      return false;
    }

    const exit = await updateSite(
      buildUpdateSiteInputFromDraft(nextValues, buildOptions)
    );

    if (Exit.isSuccess(exit)) {
      setFieldErrors({});
      onSuccess?.();
      return true;
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

    return false;
  }

  async function handleEditorSubmit() {
    const includeLocation =
      activeEditor === "location" &&
      (currentSite === null ||
        !siteCreateDraftLocationEqualsSite(values, currentSite));

    return await submitSiteDraft(values, undefined, {
      clearEmptyLocation: activeEditor === "location",
      includeLocation,
    });
  }

  async function handleNameSubmit() {
    if (!currentSite) {
      return;
    }

    const nextValues = {
      ...createSiteCreateDraftFromSite(currentSite),
      name: nameDraft,
    };

    await submitSiteDraft(
      nextValues,
      () => {
        setIsEditingName(false);
      },
      { includeLocation: false }
    );
  }

  const activeEditorUpdateError =
    activeEditor !== null &&
    isSitesAsyncFailure(updateResult) &&
    !isHandledUpdateSiteError(updateResult.error)
      ? getSitesAsyncErrorMessage(updateResult.error)
      : undefined;

  if (!active) {
    return null;
  }

  if (!currentSite) {
    return (
      <ResponsiveDrawer
        open={drawerOpen}
        onOpenChange={(open) => {
          if (!open) {
            closeSheet();
          }
        }}
        onAnimationEnd={(open) => {
          if (!open && navigateAfterCloseRef.current) {
            navigateAfterCloseRef.current = false;
            onClose?.();
          }
        }}
      >
        <DrawerContent className="route-drawer-content max-h-[92vh] w-full p-2 data-[vaul-drawer-direction=right]:right-0 data-[vaul-drawer-direction=right]:sm:top-1/2 data-[vaul-drawer-direction=right]:sm:right-auto data-[vaul-drawer-direction=right]:sm:bottom-auto data-[vaul-drawer-direction=right]:sm:left-1/2 data-[vaul-drawer-direction=right]:sm:h-auto data-[vaul-drawer-direction=right]:sm:max-h-[calc(100vh-6rem)] data-[vaul-drawer-direction=right]:sm:max-w-[min(42rem,calc(100vw-6rem))] data-[vaul-drawer-direction=right]:sm:-translate-x-1/2 data-[vaul-drawer-direction=right]:sm:-translate-y-1/2 data-[vaul-drawer-direction=right]:sm:animate-none!">
          <DrawerHeader className="border-b px-5 py-4 text-left md:px-6 md:py-5">
            <DrawerTitle>Site not found</DrawerTitle>
            <DrawerDescription>
              This site is no longer available in the current organization.
            </DrawerDescription>
          </DrawerHeader>
          <DrawerFooter className="border-t px-5 py-4 sm:px-6">
            <DrawerClose asChild>
              <Button type="button">Back to sites</Button>
            </DrawerClose>
          </DrawerFooter>
        </DrawerContent>
      </ResponsiveDrawer>
    );
  }

  return (
    <ResponsiveDrawer
      open={drawerOpen}
      onOpenChange={(open) => {
        if (!open) {
          closeSheet();
        }
      }}
      onAnimationEnd={(open) => {
        if (!open && navigateAfterCloseRef.current) {
          navigateAfterCloseRef.current = false;
          onClose?.();
        }
      }}
    >
      <DrawerContent className="route-drawer-content route-side-drawer-content flex max-h-[92vh] w-full flex-col overflow-hidden p-2 data-[vaul-drawer-direction=right]:inset-y-0 data-[vaul-drawer-direction=right]:right-0 data-[vaul-drawer-direction=right]:h-full data-[vaul-drawer-direction=right]:max-h-none data-[vaul-drawer-direction=right]:sm:max-w-2xl">
        <DrawerHeader className="shrink-0 gap-3 border-b px-5 py-4 text-left md:px-6 md:py-5">
          <div className="flex min-w-0 items-start justify-between gap-3">
            <SiteTitleEditor
              canEdit={canEdit}
              errorText={fieldErrors.name}
              isEditing={isEditingName}
              name={currentSite.name}
              nameDraft={nameDraft}
              setFieldErrors={setFieldErrors}
              setIsEditing={setIsEditingName}
              setNameDraft={setNameDraft}
              submit={handleNameSubmit}
              waiting={updateResult.waiting}
            />
            <div className="flex shrink-0 items-center gap-2">
              <DrawerClose asChild>
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  aria-label="Close site details"
                >
                  <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} />
                </Button>
              </DrawerClose>
            </div>
          </div>
          <DrawerDescription className="sr-only">
            Site location details, editable dispatch fields, and related jobs.
          </DrawerDescription>
        </DrawerHeader>

        <ResponsiveNestedDrawer
          open={editorOpen}
          onOpenChange={(open) => {
            setEditorOpen(open);
          }}
          onAnimationEnd={(open) => {
            if (!open) {
              resetEditorAfterClose();
            }
          }}
        >
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
              {isSitesAsyncFailure(updateResult) ? (
                <Alert variant="destructive" className="mx-5 mt-4 sm:mx-6">
                  <HugeiconsIcon icon={Location01Icon} strokeWidth={2} />
                  <AlertTitle>We couldn&apos;t update that site.</AlertTitle>
                  <AlertDescription>
                    {getSitesAsyncErrorMessage(updateResult.error)}
                  </AlertDescription>
                </Alert>
              ) : null}

              <section
                aria-label={`${currentSite.name} overview`}
                className="min-h-0 flex-1 overflow-y-auto px-5 py-4 sm:px-6"
              >
                <div className="flex flex-col gap-4">
                  <SiteDetailsCard
                    canEdit={canEdit}
                    onOpenEditor={openEditor}
                    site={currentSite}
                  />
                  <SiteRelatedJobs
                    canCreateJobs={canEdit}
                    hasMoreJobs={hasMoreRelatedJobs}
                    jobs={relatedJobs}
                    siteId={siteId}
                  />
                </div>
              </section>
            </div>
          </div>

          <SiteDetailEditorDrawer
            activeEditor={activeEditor}
            formError={activeEditorUpdateError}
            fieldErrors={fieldErrors}
            onSubmit={handleEditorSubmit}
            setFieldErrors={setFieldErrors}
            setValues={setValues}
            values={values}
            waiting={updateResult.waiting}
          />
        </ResponsiveNestedDrawer>
      </DrawerContent>
    </ResponsiveDrawer>
  );
}

function SiteTitleEditor({
  canEdit,
  errorText,
  isEditing,
  name,
  nameDraft,
  setFieldErrors,
  setIsEditing,
  setNameDraft,
  submit,
  waiting,
}: {
  readonly canEdit: boolean;
  readonly errorText: string | undefined;
  readonly isEditing: boolean;
  readonly name: string;
  readonly nameDraft: string;
  readonly setFieldErrors: React.Dispatch<
    React.SetStateAction<SitesCreateFieldErrors>
  >;
  readonly setIsEditing: React.Dispatch<React.SetStateAction<boolean>>;
  readonly setNameDraft: React.Dispatch<React.SetStateAction<string>>;
  readonly submit: () => Promise<void>;
  readonly waiting: boolean;
}) {
  if (isEditing) {
    return (
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-start gap-2">
          <div className="min-w-0 flex-1">
            <label htmlFor="site-title-edit" className="sr-only">
              Site name
            </label>
            <Input
              id="site-title-edit"
              value={nameDraft}
              aria-invalid={Boolean(errorText) || undefined}
              aria-describedby={errorText ? "site-title-edit-error" : undefined}
              disabled={waiting}
              onChange={(event) => {
                clearSiteFieldError(setFieldErrors, "name");
                setNameDraft(event.target.value);
              }}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  setNameDraft(name);
                  clearSiteFieldError(setFieldErrors, "name");
                  setIsEditing(false);
                }

                if (event.key === "Enter") {
                  event.preventDefault();
                  void submit();
                }
              }}
            />
            {errorText ? (
              <p
                id="site-title-edit-error"
                className="mt-1 text-xs text-destructive"
              >
                {errorText}
              </p>
            ) : null}
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            aria-label="Save site name"
            loading={waiting}
            onClick={() => void submit()}
          >
            Save
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            aria-label="Cancel site name editing"
            disabled={waiting}
            onClick={() => {
              setNameDraft(name);
              clearSiteFieldError(setFieldErrors, "name");
              setIsEditing(false);
            }}
          >
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="group/title flex min-w-0 items-center gap-2">
      <DrawerTitle className="truncate">{name}</DrawerTitle>
      {canEdit ? (
        <Button
          type="button"
          size="icon-xs"
          variant="ghost"
          aria-label="Edit site name"
          className="opacity-70 group-hover/title:opacity-100 focus-visible:opacity-100"
          onClick={() => {
            setNameDraft(name);
            clearSiteFieldError(setFieldErrors, "name");
            setIsEditing(true);
          }}
        >
          <HugeiconsIcon icon={PencilEdit02Icon} strokeWidth={2} />
        </Button>
      ) : null}
    </div>
  );
}

function SiteDetailsCard({
  canEdit,
  onOpenEditor,
  site,
}: {
  readonly canEdit: boolean;
  readonly onOpenEditor: (editor: SiteDetailEditor) => void;
  readonly site: SiteOption;
}) {
  const addressLines = buildSiteAddressLines(site);
  const googleMapsUrl = buildGoogleMapsUrl(site);

  return (
    <section
      aria-label="Site details"
      className="overflow-hidden rounded-lg border bg-card"
    >
      <div className="group/site-location flex flex-col gap-4 p-4">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-medium text-foreground">Location</h3>
          {canEdit ? (
            <DrawerTrigger asChild>
              <Button
                type="button"
                size="xs"
                variant="ghost"
                aria-label="Edit location"
                className="opacity-0 transition-opacity group-hover/site-location:opacity-100 focus-visible:opacity-100"
                onClick={() => onOpenEditor("location")}
              >
                Edit
              </Button>
            </DrawerTrigger>
          ) : null}
        </div>

        <div className="grid items-stretch gap-4 lg:grid-cols-[minmax(0,0.9fr)_minmax(15rem,1.1fr)]">
          <div className="flex min-h-44 min-w-0 flex-col gap-4">
            <div className="flex flex-1 flex-col gap-1">
              <div className="text-sm leading-6 text-foreground">
                {addressLines.length > 0 ? (
                  <span className="flex flex-col gap-1">
                    {addressLines.map((line) => (
                      <span key={line}>{line}</span>
                    ))}
                  </span>
                ) : (
                  "No address"
                )}
              </div>
            </div>

            {googleMapsUrl ? (
              <a
                href={googleMapsUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex w-fit items-center gap-2 rounded-md border bg-card px-3 py-2 text-sm font-medium text-foreground shadow-xs transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none has-data-[icon=inline-end]:pr-2"
              >
                View on map
                <HugeiconsIcon
                  icon={ArrowUpRight01Icon}
                  strokeWidth={2}
                  data-icon="inline-end"
                />
              </a>
            ) : null}
          </div>

          <SiteLocationMapPreview site={site} variant="embedded" />
        </div>
      </div>

      <div className="group/site-notes border-t p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 className="text-sm font-medium text-foreground">Notes summary</h3>
          {canEdit ? (
            <DrawerTrigger asChild>
              <Button
                type="button"
                size="xs"
                variant="ghost"
                aria-label={
                  site.accessNotes ? "Edit notes summary" : "Add notes summary"
                }
                className="opacity-0 transition-opacity group-hover/site-notes:opacity-100 focus-visible:opacity-100"
                onClick={() => onOpenEditor("notes")}
              >
                {site.accessNotes ? "Edit" : "Add"}
              </Button>
            </DrawerTrigger>
          ) : null}
        </div>

        {site.accessNotes ? (
          <p className="max-w-prose text-sm leading-6 text-foreground">
            {site.accessNotes}
          </p>
        ) : (
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">
              No site notes yet.
            </p>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              Add gate codes, arrival instructions, or safety context when the
              site needs it.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}

function SiteDetailEditorDrawer({
  activeEditor,
  fieldErrors,
  formError,
  onSubmit,
  setFieldErrors,
  setValues,
  values,
  waiting,
}: {
  readonly activeEditor: SiteDetailEditor | null;
  readonly fieldErrors: SitesCreateFieldErrors;
  readonly formError: string | undefined;
  readonly onSubmit: () => Promise<boolean>;
  readonly setFieldErrors: React.Dispatch<
    React.SetStateAction<SitesCreateFieldErrors>
  >;
  readonly setValues: React.Dispatch<
    React.SetStateAction<SitesCreateFormState>
  >;
  readonly values: SitesCreateFormState;
  readonly waiting: boolean;
}) {
  const successCloseRef = React.useRef<HTMLButtonElement>(null);

  if (!activeEditor) {
    return null;
  }

  const editorCopy = getSiteDetailEditorCopy(activeEditor);
  const updateDraft = (patch: Partial<SitesCreateFormState>) => {
    clearSiteFieldErrorsForPatch(setFieldErrors, patch);
    setValues((current) => ({
      ...current,
      ...patch,
    }));
  };

  return (
    <DrawerContent
      overlayClassName="z-[55]"
      className="z-[60] flex max-h-[88vh] w-full flex-col overflow-hidden p-2 data-[vaul-drawer-direction=bottom]:pb-[calc(0.5rem+env(safe-area-inset-bottom))] data-[vaul-drawer-direction=right]:inset-y-0 data-[vaul-drawer-direction=right]:right-0 data-[vaul-drawer-direction=right]:h-full data-[vaul-drawer-direction=right]:max-h-none data-[vaul-drawer-direction=right]:sm:max-w-lg"
    >
      <form
        className="flex min-h-0 flex-1 flex-col"
        method="post"
        noValidate
        onSubmit={(event) =>
          submitClientForm(event, async () => {
            const didSave = await onSubmit();

            if (didSave) {
              successCloseRef.current?.click();
            }
          })
        }
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
        <DrawerHeader className="shrink-0 gap-1.5 border-b px-5 py-4 text-left md:px-6 md:py-5">
          <div className="flex min-w-0 items-start justify-between gap-3">
            <div className="min-w-0">
              <DrawerTitle>{editorCopy.title}</DrawerTitle>
              <DrawerDescription className="mt-1 max-w-prose">
                {editorCopy.description}
              </DrawerDescription>
            </div>
            <DrawerClose asChild>
              <Button
                type="button"
                size="icon-sm"
                variant="ghost"
                aria-label={`Close ${editorCopy.title.toLowerCase()}`}
                disabled={waiting}
              >
                <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} />
              </Button>
            </DrawerClose>
          </div>
        </DrawerHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-5 py-4 sm:px-6">
          {formError ? (
            <Alert variant="destructive">
              <HugeiconsIcon icon={Location01Icon} strokeWidth={2} />
              <AlertTitle>We couldn&apos;t update that site.</AlertTitle>
              <AlertDescription>{formError}</AlertDescription>
            </Alert>
          ) : null}

          {activeEditor === "notes" ? (
            <SiteAccessNotesField
              draft={values}
              idPrefix="site-detail-editor"
              label="Notes summary"
              rows={5}
              onDraftPatch={updateDraft}
            />
          ) : null}

          {activeEditor === "location" ? (
            <SiteAddressFields
              draft={values}
              errors={fieldErrors}
              idPrefix="site-detail-editor"
              onDraftPatch={updateDraft}
            />
          ) : null}
        </div>

        <DrawerFooter className="shrink-0 flex-col-reverse gap-2 border-t px-5 py-4 sm:flex-row sm:justify-end sm:px-6">
          <DrawerClose asChild>
            <Button type="button" variant="outline" disabled={waiting}>
              Cancel
            </Button>
          </DrawerClose>
          <Button type="submit" loading={waiting}>
            {editorCopy.saveLabel}
          </Button>
        </DrawerFooter>
      </form>
    </DrawerContent>
  );
}

function getSiteDetailEditorCopy(editor: SiteDetailEditor) {
  switch (editor) {
    case "location": {
      return {
        description: "Update the address used for dispatch and map lookup.",
        saveLabel: "Save location",
        title: "Edit location",
      };
    }
    case "notes": {
      return {
        description:
          "Keep this to the access or safety context people need before visiting.",
        saveLabel: "Save notes",
        title: "Edit notes summary",
      };
    }
    default: {
      const exhaustiveEditor: never = editor;

      return exhaustiveEditor;
    }
  }
}

function SiteRelatedJobs({
  canCreateJobs,
  hasMoreJobs,
  jobs,
  siteId,
}: {
  readonly canCreateJobs: boolean;
  readonly hasMoreJobs: boolean;
  readonly jobs: readonly JobListItem[];
  readonly siteId: SiteIdType;
}) {
  const pushWorkspaceSheet = usePushWorkspaceSheet();

  if (jobs.length === 0) {
    return (
      <section
        aria-label="Related jobs"
        className="overflow-hidden rounded-lg border bg-card"
      >
        <div className="flex items-center gap-2 border-b px-4 py-3">
          <h3 className="text-sm font-medium text-foreground">Related jobs</h3>
          <Badge variant="outline">0</Badge>
        </div>
        <div className="p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">
                No jobs linked to this site yet.
              </p>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                Jobs attached to this site will collect here once work starts.
              </p>
            </div>
            {canCreateJobs ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() =>
                  pushWorkspaceSheet({ kind: "job.create", siteId })
                }
              >
                New job
              </Button>
            ) : null}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section
      aria-label="Related jobs"
      className="overflow-hidden rounded-lg border bg-card"
    >
      <div className="flex items-center gap-2 border-b px-4 py-3">
        <h3 className="text-sm font-medium text-foreground">Related jobs</h3>
        <Badge variant="secondary">
          {jobs.length}
          {hasMoreJobs ? "+" : ""}
        </Badge>
      </div>

      <div className="divide-y">
        {jobs.map((job) => (
          <button
            key={job.id}
            type="button"
            className="flex w-full min-w-0 items-start justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            onClick={() =>
              pushWorkspaceSheet({ jobId: job.id, kind: "job.detail" })
            }
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
              <Badge variant="secondary">
                {RELATED_JOB_STATUS_LABELS[job.status]}
              </Badge>
              <Badge
                variant={job.priority === "none" ? "outline" : "secondary"}
              >
                {RELATED_JOB_PRIORITY_LABELS[job.priority]}
              </Badge>
            </div>
          </button>
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

function formatJobUpdatedAt(updatedAt: string) {
  return SITE_JOB_UPDATED_AT_FORMATTER.format(new Date(updatedAt));
}

function clearSiteFieldError(
  setFieldErrors: React.Dispatch<React.SetStateAction<SitesCreateFieldErrors>>,
  field: keyof SitesCreateFieldErrors
) {
  setFieldErrors((current) => {
    if (current[field] === undefined) {
      return current;
    }

    return {
      ...current,
      [field]: undefined,
    };
  });
}

function clearSiteFieldErrorsForPatch(
  setFieldErrors: React.Dispatch<React.SetStateAction<SitesCreateFieldErrors>>,
  patch: Partial<SitesCreateFormState>
) {
  setFieldErrors((current) => {
    let next: SitesCreateFieldErrors | null = null;

    for (const field of SITE_DETAIL_PATCH_ERROR_FIELDS) {
      if (field in patch && current[field] !== undefined) {
        next = {
          ...(next ?? current),
          [field]: undefined,
        };
      }
    }

    return next ?? current;
  });
}

const SITE_DETAIL_PATCH_ERROR_FIELDS = [
  "location",
  "name",
] as const satisfies readonly (keyof SitesCreateFieldErrors)[];

function isHandledUpdateSiteError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "_tag" in error &&
    error._tag === SITE_LOCATION_RESOLUTION_ERROR_TAG
  );
}
