"use client";

import { Result, useAtomSet, useAtomValue } from "@effect-atom/atom-react";
import {
  Add01Icon,
  AlertSquareIcon,
  ArrowDown01Icon,
  Briefcase01Icon,
  Flag01Icon,
  Location01Icon,
  MinusSignIcon,
  SignalFull02Icon,
  SignalLow02Icon,
  SignalMedium02Icon,
  UserIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useNavigate } from "@tanstack/react-router";
import {
  CONTACT_NOT_FOUND_ERROR_TAG,
  SITE_NOT_FOUND_ERROR_TAG,
} from "@task-tracker/jobs-core";
import type {
  ContactIdType,
  CreateJobInput,
  JobPriority,
  JobContactOption,
  RegionIdType,
  JobSiteOption,
  SiteIdType,
} from "@task-tracker/jobs-core";
import { Cause, Exit } from "effect";
import * as React from "react";

import { Alert, AlertDescription, AlertTitle } from "#/components/ui/alert";
import { Badge } from "#/components/ui/badge";
import { Button, buttonVariants } from "#/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "#/components/ui/command";
import { CommandSelect } from "#/components/ui/command-select";
import type { CommandSelectGroup } from "#/components/ui/command-select";
import {
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "#/components/ui/drawer";
import { FieldGroup } from "#/components/ui/field";
import { Input } from "#/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "#/components/ui/popover";
import {
  ResponsiveDrawer,
  ResponsiveNestedDrawer,
} from "#/components/ui/responsive-drawer";
import { Spinner } from "#/components/ui/spinner";
import { Textarea } from "#/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "#/components/ui/tooltip";
import { AuthFormField } from "#/features/auth/auth-form-field";
import { ShortcutHint } from "#/hotkeys/hotkey-display";
import { HOTKEYS } from "#/hotkeys/hotkey-registry";
import { useAppHotkey } from "#/hotkeys/use-app-hotkey";
import { cn } from "#/lib/utils";

import { JobsSitePinPicker } from "./jobs-site-pin-picker";
import {
  createJobMutationAtom,
  deriveContactsForSite,
  jobsOptionsStateAtom,
} from "./jobs-state";

const INLINE_CREATE_VALUE = "__create__";
const NONE_VALUE = "__none__";

const PRIORITY_OPTIONS: readonly {
  readonly icon: React.ComponentProps<typeof HugeiconsIcon>["icon"];
  readonly label: string;
  readonly value: JobPriority;
}[] = [
  { icon: MinusSignIcon, label: "None", value: "none" },
  { icon: AlertSquareIcon, label: "Urgent", value: "urgent" },
  {
    icon: SignalFull02Icon,
    label: "High",
    value: "high",
  },
  {
    icon: SignalMedium02Icon,
    label: "Medium",
    value: "medium",
  },
  {
    icon: SignalLow02Icon,
    label: "Low",
    value: "low",
  },
];

interface JobsCreateFormState {
  readonly contactName: string;
  readonly contactSelection: string;
  readonly priority: JobPriority;
  readonly siteAccessNotes: string;
  readonly siteAddressLine1: string;
  readonly siteAddressLine2: string;
  readonly siteCounty: string;
  readonly siteEircode: string;
  readonly siteLatitude: string;
  readonly siteLongitude: string;
  readonly siteName: string;
  readonly siteRegionSelection: string;
  readonly siteSelection: string;
  readonly siteTown: string;
  readonly title: string;
}

interface JobsCreateFieldErrors {
  readonly contactName?: string;
  readonly siteLatitude?: string;
  readonly siteLongitude?: string;
  readonly siteName?: string;
  readonly title?: string;
}

const defaultFormState: JobsCreateFormState = {
  contactName: "",
  contactSelection: NONE_VALUE,
  priority: "none",
  siteAccessNotes: "",
  siteAddressLine1: "",
  siteAddressLine2: "",
  siteCounty: "",
  siteEircode: "",
  siteLatitude: "",
  siteLongitude: "",
  siteName: "",
  siteRegionSelection: NONE_VALUE,
  siteSelection: NONE_VALUE,
  siteTown: "",
  title: "",
};

function openMetadataSelect(
  trigger: React.RefObject<HTMLButtonElement | null>,
  setOpen: React.Dispatch<React.SetStateAction<boolean>>
) {
  trigger.current?.focus();
  setOpen(true);
}

function getCreateHotkeyState({
  createWaiting,
  contactSelectOpen,
  locationDrawerOpen,
  overlayOpen,
  prioritySelectOpen,
  siteDrawerOpen,
  siteSelectOpen,
}: {
  readonly contactSelectOpen: boolean;
  readonly createWaiting: boolean;
  readonly locationDrawerOpen: boolean;
  readonly overlayOpen: boolean;
  readonly prioritySelectOpen: boolean;
  readonly siteDrawerOpen: boolean;
  readonly siteSelectOpen: boolean;
}) {
  const selectOpen = prioritySelectOpen || siteSelectOpen || contactSelectOpen;
  const nestedDrawerOpen = siteDrawerOpen || locationDrawerOpen;

  return {
    canCancel:
      overlayOpen && !createWaiting && !nestedDrawerOpen && !selectOpen,
    canOpenMetadata: overlayOpen && !nestedDrawerOpen && !selectOpen,
    canSubmit:
      overlayOpen && !createWaiting && !nestedDrawerOpen && !selectOpen,
  };
}

export function JobsCreateSheet() {
  const navigate = useNavigate();
  const options = useAtomValue(jobsOptionsStateAtom).data;
  const createJob = useAtomSet(createJobMutationAtom, {
    mode: "promiseExit",
  });
  const createResult = useAtomValue(createJobMutationAtom);
  const [fieldErrors, setFieldErrors] = React.useState<JobsCreateFieldErrors>(
    {}
  );
  const [values, setValues] =
    React.useState<JobsCreateFormState>(defaultFormState);
  const [overlayOpen, setOverlayOpen] = React.useState(true);
  const [siteDrawerOpen, setSiteDrawerOpen] = React.useState(false);
  const [locationDrawerOpen, setLocationDrawerOpen] = React.useState(false);
  const [prioritySelectOpen, setPrioritySelectOpen] = React.useState(false);
  const [siteSelectOpen, setSiteSelectOpen] = React.useState(false);
  const [contactSelectOpen, setContactSelectOpen] = React.useState(false);
  const formRef = React.useRef<HTMLFormElement | null>(null);
  const prioritySelectRef = React.useRef<HTMLButtonElement | null>(null);
  const siteSelectRef = React.useRef<HTMLButtonElement | null>(null);
  const contactSelectRef = React.useRef<HTMLButtonElement | null>(null);
  const closeNavigationTimeout = React.useRef<ReturnType<
    typeof setTimeout
  > | null>(null);

  const selectedSiteId =
    values.siteSelection === NONE_VALUE ||
    values.siteSelection === INLINE_CREATE_VALUE
      ? undefined
      : resolveSelectedOptionId(options.sites, values.siteSelection);
  const contactGroups = deriveContactsForSite(options.contacts, selectedSiteId);
  const prioritySelectionGroups = buildPrioritySelectionGroups();
  const siteRegionSelectionGroups = buildSiteRegionSelectionGroups(
    options.regions
  );
  const siteSelectionGroups = buildSiteSelectionGroups(options.sites);
  const contactSelectionGroups = buildContactSelectionGroups(contactGroups);
  const showInlineSiteSummary =
    values.siteSelection === INLINE_CREATE_VALUE && hasInlineSiteDraft(values);

  React.useEffect(() => {
    if (values.siteSelection !== INLINE_CREATE_VALUE) {
      setSiteDrawerOpen(false);
      setLocationDrawerOpen(false);
    }
  }, [values.siteSelection]);

  React.useEffect(() => {
    if (fieldErrors.siteLatitude || fieldErrors.siteLongitude) {
      setSiteDrawerOpen(true);
      setLocationDrawerOpen(true);
    }
  }, [fieldErrors.siteLatitude, fieldErrors.siteLongitude]);

  React.useEffect(() => {
    if (fieldErrors.siteName && values.siteSelection === INLINE_CREATE_VALUE) {
      setSiteDrawerOpen(true);
    }
  }, [fieldErrors.siteName, values.siteSelection]);

  React.useEffect(
    () => () => {
      if (closeNavigationTimeout.current) {
        clearTimeout(closeNavigationTimeout.current);
      }
    },
    []
  );
  const parsedSiteCoordinates = resolveSiteCoordinateDraft(values);
  const hotkeyState = getCreateHotkeyState({
    contactSelectOpen,
    createWaiting: createResult.waiting,
    locationDrawerOpen,
    overlayOpen,
    prioritySelectOpen,
    siteDrawerOpen,
    siteSelectOpen,
  });

  function closeSheet({
    delayed = false,
  }: { readonly delayed?: boolean } = {}) {
    setOverlayOpen(false);

    if (closeNavigationTimeout.current) {
      clearTimeout(closeNavigationTimeout.current);
    }

    const navigateToJobs = () => {
      React.startTransition(() => {
        navigate({ to: "/jobs" });
      });
    };

    if (!delayed) {
      navigateToJobs();
      return;
    }

    closeNavigationTimeout.current = setTimeout(navigateToJobs, 140);
  }

  useAppHotkey(
    "jobCreateSubmit",
    () => {
      formRef.current?.requestSubmit();
    },
    { enabled: hotkeyState.canSubmit }
  );
  useAppHotkey(
    "jobCreateCancel",
    () => {
      closeSheet({ delayed: true });
    },
    {
      enabled: hotkeyState.canCancel,
      ignoreInputs: true,
    }
  );
  useAppHotkey(
    "jobCreatePriority",
    () => openMetadataSelect(prioritySelectRef, setPrioritySelectOpen),
    { enabled: hotkeyState.canOpenMetadata }
  );
  useAppHotkey(
    "jobCreateSite",
    () => openMetadataSelect(siteSelectRef, setSiteSelectOpen),
    { enabled: hotkeyState.canOpenMetadata }
  );
  useAppHotkey(
    "jobCreateContact",
    () => openMetadataSelect(contactSelectRef, setContactSelectOpen),
    { enabled: hotkeyState.canOpenMetadata }
  );

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const nextErrors = validate(values);
    setFieldErrors(nextErrors);

    if (hasFieldErrors(nextErrors)) {
      return;
    }

    const selectionIds = resolveCreateSelectionIds(values, options);

    if (
      values.siteSelection !== NONE_VALUE &&
      values.siteSelection !== INLINE_CREATE_VALUE &&
      selectionIds.siteId === undefined
    ) {
      setFieldErrors((current) => ({
        ...current,
        siteName: "That site is no longer available. Pick another one.",
      }));
      return;
    }

    if (
      values.contactSelection !== NONE_VALUE &&
      values.contactSelection !== INLINE_CREATE_VALUE &&
      selectionIds.contactId === undefined
    ) {
      setFieldErrors((current) => ({
        ...current,
        contactName:
          "That contact is no longer available. Pick another one or create a new contact.",
      }));
      return;
    }

    const payload = buildCreateJobInput(values, selectionIds);
    const exit = await createJob(payload);

    if (Exit.isSuccess(exit)) {
      setFieldErrors({});
      setValues(defaultFormState);
      closeSheet();
      return;
    }

    const failure = Cause.failureOption(exit.cause);

    if (
      failure._tag === "Some" &&
      failure.value._tag === SITE_NOT_FOUND_ERROR_TAG
    ) {
      setFieldErrors((current) => ({
        ...current,
        siteName: "That site is no longer available. Pick another one.",
      }));
    }

    if (
      failure._tag === "Some" &&
      failure.value._tag === CONTACT_NOT_FOUND_ERROR_TAG
    ) {
      setFieldErrors((current) => ({
        ...current,
        contactName:
          "That contact is no longer available. Pick another one or create a new contact.",
      }));
    }
  }

  return (
    <ResponsiveCreateOverlay
      open={overlayOpen}
      onOpenChange={(open) => {
        if (!open) {
          closeSheet({ delayed: true });
        }
      }}
    >
      <form
        ref={formRef}
        className="flex min-h-0 flex-1 flex-col"
        method="post"
        noValidate
        onSubmit={handleSubmit}
      >
        <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-5 py-4 sm:px-6">
          {Result.builder(createResult)
            .onError((error) => (
              <Alert variant="destructive">
                <HugeiconsIcon icon={Briefcase01Icon} strokeWidth={2} />
                <AlertTitle>We couldn&apos;t create that job.</AlertTitle>
                <AlertDescription>{error.message}</AlertDescription>
              </Alert>
            ))
            .render()}

          <FieldGroup>
            <AuthFormField
              label="Title"
              htmlFor="job-title"
              invalid={Boolean(fieldErrors.title)}
              errorText={fieldErrors.title}
            >
              <Input
                id="job-title"
                value={values.title}
                aria-invalid={Boolean(fieldErrors.title) || undefined}
                onChange={(event) =>
                  setValues((current) => ({
                    ...current,
                    title: event.target.value,
                  }))
                }
              />
            </AuthFormField>
          </FieldGroup>

          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <LinearMetadataSelect
                id="job-priority"
                label="Priority"
                value={values.priority}
                open={prioritySelectOpen}
                placeholder="Priority"
                emptyText="No priorities found."
                groups={prioritySelectionGroups}
                icon={Flag01Icon}
                triggerRef={prioritySelectRef}
                searchPlaceholder="Set priority to..."
                showGroupHeadings={false}
                onOpenChange={setPrioritySelectOpen}
                onValueChange={(nextValue) =>
                  setValues((current) => ({
                    ...current,
                    priority: nextValue as JobPriority,
                  }))
                }
              />
              <LinearMetadataSelect
                id="job-site"
                label="Site"
                value={values.siteSelection}
                open={siteSelectOpen}
                placeholder="Site"
                emptyText="No sites found."
                groups={siteSelectionGroups}
                icon={Location01Icon}
                errorText={fieldErrors.siteName}
                triggerRef={siteSelectRef}
                onOpenChange={setSiteSelectOpen}
                onValueChange={(nextValue) => {
                  setValues((current) => ({
                    ...current,
                    siteSelection: nextValue,
                  }));

                  if (nextValue === INLINE_CREATE_VALUE) {
                    setSiteDrawerOpen(true);
                  }
                }}
              />
              <LinearContactSelect
                id="job-contact"
                value={values.contactSelection}
                contactName={values.contactName}
                open={contactSelectOpen}
                groups={contactSelectionGroups}
                errorText={fieldErrors.contactName}
                triggerRef={contactSelectRef}
                onOpenChange={setContactSelectOpen}
                onValueChange={(nextValue) =>
                  setValues((current) => ({
                    ...current,
                    contactSelection: nextValue,
                    contactName: "",
                  }))
                }
                onCreateContact={(contactName) =>
                  setValues((current) => ({
                    ...current,
                    contactName,
                    contactSelection: INLINE_CREATE_VALUE,
                  }))
                }
              />
            </div>
            {fieldErrors.siteName ? (
              <p className="text-sm text-destructive">{fieldErrors.siteName}</p>
            ) : null}
            {fieldErrors.contactName ? (
              <p className="text-sm text-destructive">
                {fieldErrors.contactName}
              </p>
            ) : null}
          </div>

          <FieldGroup>
            {showInlineSiteSummary ? (
              <div className="flex items-center justify-between gap-3 border-y py-3">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                    <HugeiconsIcon icon={Location01Icon} strokeWidth={2} />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-medium">New site</p>
                    <p className="truncate text-sm text-muted-foreground">
                      {values.siteName.trim()}
                    </p>
                  </div>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setSiteDrawerOpen(true)}
                >
                  Edit details
                </Button>
              </div>
            ) : null}
          </FieldGroup>
        </div>

        <DrawerFooter className="flex flex-col-reverse gap-2 border-t px-5 py-4 sm:flex-row sm:justify-end sm:px-6">
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => closeSheet({ delayed: true })}
                >
                  Cancel
                </Button>
              }
            />
            <TooltipContent>
              <span>Cancel</span>
              <ShortcutHint
                hotkey={HOTKEYS.jobCreateCancel.hotkey}
                label={HOTKEYS.jobCreateCancel.label}
              />
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button type="submit" disabled={createResult.waiting}>
                  {createResult.waiting ? (
                    <Spinner data-icon="inline-start" />
                  ) : (
                    <HugeiconsIcon
                      icon={Add01Icon}
                      strokeWidth={2}
                      data-icon="inline-start"
                    />
                  )}
                  {createResult.waiting ? "Creating..." : "Create job"}
                </Button>
              }
            />
            <TooltipContent>
              <span>Create job</span>
              <ShortcutHint
                hotkey={HOTKEYS.jobCreateSubmit.hotkey}
                label={HOTKEYS.jobCreateSubmit.label}
              />
            </TooltipContent>
          </Tooltip>
        </DrawerFooter>
      </form>

      <ResponsiveNestedDrawer
        open={siteDrawerOpen}
        onOpenChange={(nextOpen) => {
          setSiteDrawerOpen(nextOpen);

          if (!nextOpen) {
            setLocationDrawerOpen(false);
          }
        }}
      >
        <DrawerContent className="max-h-[92vh] w-full p-2 data-[vaul-drawer-direction=right]:inset-y-0 data-[vaul-drawer-direction=right]:right-0 data-[vaul-drawer-direction=right]:h-full data-[vaul-drawer-direction=right]:max-h-none data-[vaul-drawer-direction=right]:sm:max-w-2xl">
          <DrawerHeader className="border-b px-5 py-4 text-left md:px-6">
            <Badge variant="secondary" className="w-fit rounded-full px-3 py-1">
              Site
            </Badge>
            <DrawerTitle>New site</DrawerTitle>
            <DrawerDescription>
              Capture the place once. Pin it if the map matters.
            </DrawerDescription>
          </DrawerHeader>

          <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-5 py-4 sm:px-6">
            <FieldGroup>
              <AuthFormField
                label="Site name"
                htmlFor="new-site-name"
                invalid={Boolean(fieldErrors.siteName)}
                errorText={fieldErrors.siteName}
              >
                <Input
                  id="new-site-name"
                  value={values.siteName}
                  aria-invalid={Boolean(fieldErrors.siteName) || undefined}
                  onChange={(event) =>
                    setValues((current) => ({
                      ...current,
                      siteName: event.target.value,
                    }))
                  }
                />
              </AuthFormField>

              <AuthFormField
                label="Region"
                htmlFor="new-site-region"
                invalid={false}
              >
                <CommandSelect
                  id="new-site-region"
                  value={values.siteRegionSelection}
                  placeholder="Pick region"
                  emptyText="No regions found."
                  groups={siteRegionSelectionGroups}
                  onValueChange={(nextValue) =>
                    setValues((current) => ({
                      ...current,
                      siteRegionSelection: nextValue,
                    }))
                  }
                />
              </AuthFormField>
            </FieldGroup>

            <div className="flex items-center justify-between gap-3 border-y py-3">
              <div className="min-w-0">
                <p className="text-sm font-medium">Location</p>
                <p className="truncate text-sm text-muted-foreground">
                  {parsedSiteCoordinates
                    ? `${formatCoordinate(parsedSiteCoordinates.latitude)}, ${formatCoordinate(
                        parsedSiteCoordinates.longitude
                      )}`
                    : "Address and pin are optional"}
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setLocationDrawerOpen(true)}
              >
                Edit location
              </Button>
            </div>
          </div>

          <DrawerFooter className="flex-row justify-end border-t px-5 py-4 sm:px-6">
            <Button type="button" onClick={() => setSiteDrawerOpen(false)}>
              Done
            </Button>
          </DrawerFooter>

          <ResponsiveNestedDrawer
            open={locationDrawerOpen}
            onOpenChange={setLocationDrawerOpen}
          >
            <DrawerContent className="max-h-[92vh] w-full p-2 data-[vaul-drawer-direction=right]:inset-y-0 data-[vaul-drawer-direction=right]:right-0 data-[vaul-drawer-direction=right]:h-full data-[vaul-drawer-direction=right]:max-h-none data-[vaul-drawer-direction=right]:sm:max-w-3xl">
              <DrawerHeader className="border-b px-5 py-4 text-left md:px-6">
                <Badge
                  variant="secondary"
                  className="w-fit rounded-full px-3 py-1"
                >
                  Location
                </Badge>
                <DrawerTitle>Site location</DrawerTitle>
                <DrawerDescription>
                  Add the address, then place the pin if helpful.
                </DrawerDescription>
              </DrawerHeader>

              <div className="grid flex-1 gap-5 overflow-y-auto px-5 py-4 sm:px-6 lg:grid-cols-[minmax(0,0.95fr)_minmax(18rem,1.05fr)]">
                <FieldGroup>
                  <AuthFormField
                    label="Address line 1"
                    htmlFor="new-site-address-line-1"
                    invalid={false}
                  >
                    <Input
                      id="new-site-address-line-1"
                      value={values.siteAddressLine1}
                      onChange={(event) =>
                        setValues((current) => ({
                          ...current,
                          siteAddressLine1: event.target.value,
                        }))
                      }
                    />
                  </AuthFormField>

                  <AuthFormField
                    label="Address line 2"
                    htmlFor="new-site-address-line-2"
                    invalid={false}
                  >
                    <Input
                      id="new-site-address-line-2"
                      value={values.siteAddressLine2}
                      onChange={(event) =>
                        setValues((current) => ({
                          ...current,
                          siteAddressLine2: event.target.value,
                        }))
                      }
                    />
                  </AuthFormField>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <AuthFormField
                      label="Town"
                      htmlFor="new-site-town"
                      invalid={false}
                    >
                      <Input
                        id="new-site-town"
                        value={values.siteTown}
                        onChange={(event) =>
                          setValues((current) => ({
                            ...current,
                            siteTown: event.target.value,
                          }))
                        }
                      />
                    </AuthFormField>

                    <AuthFormField
                      label="County"
                      htmlFor="new-site-county"
                      invalid={false}
                    >
                      <Input
                        id="new-site-county"
                        value={values.siteCounty}
                        onChange={(event) =>
                          setValues((current) => ({
                            ...current,
                            siteCounty: event.target.value,
                          }))
                        }
                      />
                    </AuthFormField>
                  </div>

                  <AuthFormField
                    label="Eircode"
                    htmlFor="new-site-eircode"
                    invalid={false}
                  >
                    <Input
                      id="new-site-eircode"
                      value={values.siteEircode}
                      onChange={(event) =>
                        setValues((current) => ({
                          ...current,
                          siteEircode: event.target.value,
                        }))
                      }
                    />
                  </AuthFormField>

                  <AuthFormField
                    label="Access notes"
                    htmlFor="new-site-access-notes"
                    invalid={false}
                  >
                    <Textarea
                      id="new-site-access-notes"
                      rows={3}
                      value={values.siteAccessNotes}
                      onChange={(event) =>
                        setValues((current) => ({
                          ...current,
                          siteAccessNotes: event.target.value,
                        }))
                      }
                    />
                  </AuthFormField>
                </FieldGroup>

                <div className="flex flex-col gap-3 border-t pt-4 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex max-w-[32rem] flex-col gap-1">
                      <p className="font-medium">Site pin</p>
                    </div>
                    {parsedSiteCoordinates ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          setValues((current) => ({
                            ...current,
                            siteLatitude: "",
                            siteLongitude: "",
                          }))
                        }
                      >
                        Clear pin
                      </Button>
                    ) : null}
                  </div>

                  <JobsSitePinPicker
                    latitude={parsedSiteCoordinates?.latitude}
                    longitude={parsedSiteCoordinates?.longitude}
                    onChange={(next) =>
                      setValues((current) => ({
                        ...current,
                        siteLatitude: formatCoordinate(next.latitude),
                        siteLongitude: formatCoordinate(next.longitude),
                      }))
                    }
                  />

                  <div className="grid gap-4 sm:grid-cols-2">
                    <AuthFormField
                      label="Latitude"
                      htmlFor="new-site-latitude"
                      invalid={Boolean(fieldErrors.siteLatitude)}
                      errorText={fieldErrors.siteLatitude}
                    >
                      <Input
                        id="new-site-latitude"
                        inputMode="decimal"
                        value={values.siteLatitude}
                        aria-invalid={
                          Boolean(fieldErrors.siteLatitude) || undefined
                        }
                        onChange={(event) =>
                          setValues((current) => ({
                            ...current,
                            siteLatitude: event.target.value,
                          }))
                        }
                      />
                    </AuthFormField>

                    <AuthFormField
                      label="Longitude"
                      htmlFor="new-site-longitude"
                      invalid={Boolean(fieldErrors.siteLongitude)}
                      errorText={fieldErrors.siteLongitude}
                    >
                      <Input
                        id="new-site-longitude"
                        inputMode="decimal"
                        value={values.siteLongitude}
                        aria-invalid={
                          Boolean(fieldErrors.siteLongitude) || undefined
                        }
                        onChange={(event) =>
                          setValues((current) => ({
                            ...current,
                            siteLongitude: event.target.value,
                          }))
                        }
                      />
                    </AuthFormField>
                  </div>
                </div>
              </div>

              <DrawerFooter className="flex-row justify-end border-t px-5 py-4 sm:px-6">
                <Button
                  type="button"
                  onClick={() => setLocationDrawerOpen(false)}
                >
                  Done
                </Button>
              </DrawerFooter>
            </DrawerContent>
          </ResponsiveNestedDrawer>
        </DrawerContent>
      </ResponsiveNestedDrawer>
    </ResponsiveCreateOverlay>
  );
}

function LinearMetadataSelect({
  emptyText,
  errorText,
  groups,
  icon,
  id,
  label,
  onOpenChange,
  onValueChange,
  open,
  placeholder,
  searchPlaceholder,
  showGroupHeadings,
  triggerRef,
  value,
}: {
  readonly emptyText: string;
  readonly errorText?: string;
  readonly groups: readonly CommandSelectGroup[];
  readonly icon: React.ComponentProps<typeof HugeiconsIcon>["icon"];
  readonly id: string;
  readonly label: string;
  readonly onOpenChange?: (open: boolean) => void;
  readonly onValueChange: (value: string) => void;
  readonly open?: boolean;
  readonly placeholder: string;
  readonly searchPlaceholder?: string;
  readonly showGroupHeadings?: boolean;
  readonly triggerRef?: React.Ref<HTMLButtonElement>;
  readonly value: string;
}) {
  const selectedOption =
    groups
      .flatMap((group) => group.options)
      .find((option) => option.value === value) ?? null;
  const triggerIcon = selectedOption?.icon ?? icon;

  return (
    <div>
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <CommandSelect
        id={id}
        value={value}
        placeholder={placeholder}
        emptyText={emptyText}
        groups={groups}
        ariaLabel={label}
        ariaInvalid={errorText ? true : undefined}
        className="h-9 w-auto justify-start gap-1.5 rounded-full bg-background px-3 shadow-xs"
        open={open}
        prefix={<HugeiconsIcon icon={triggerIcon} strokeWidth={2} />}
        searchPlaceholder={searchPlaceholder}
        showGroupHeadings={showGroupHeadings}
        triggerRef={triggerRef}
        onOpenChange={onOpenChange}
        onValueChange={onValueChange}
      />
    </div>
  );
}

function LinearContactSelect({
  contactName,
  errorText,
  groups,
  id,
  onOpenChange,
  onCreateContact,
  onValueChange,
  open: controlledOpen,
  triggerRef,
  value,
}: {
  readonly contactName: string;
  readonly errorText?: string;
  readonly groups: readonly CommandSelectGroup[];
  readonly id: string;
  readonly onOpenChange?: (open: boolean) => void;
  readonly onCreateContact: (contactName: string) => void;
  readonly onValueChange: (value: string) => void;
  readonly open?: boolean;
  readonly triggerRef?: React.Ref<HTMLButtonElement>;
  readonly value: string;
}) {
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const open = controlledOpen ?? uncontrolledOpen;
  const selectedOption =
    groups
      .flatMap((group) => group.options)
      .find((option) => option.value === value) ?? null;
  const createdContactName =
    value === INLINE_CREATE_VALUE ? contactName.trim() : "";
  const triggerLabel = createdContactName || selectedOption?.label || "Contact";
  const createContactName = query.trim();
  const visibleGroups = groups.filter((group) => group.options.length > 0);
  const setOpen = React.useCallback(
    (nextOpen: boolean) => {
      if (controlledOpen === undefined) {
        setUncontrolledOpen(nextOpen);
      }

      onOpenChange?.(nextOpen);
    },
    [controlledOpen, onOpenChange]
  );

  return (
    <div>
      <label htmlFor={id} className="sr-only">
        Contact
      </label>
      <Popover
        open={open}
        onOpenChange={(nextOpen) => {
          setOpen(nextOpen);
          setQuery(nextOpen ? createdContactName : "");
        }}
      >
        <PopoverTrigger
          ref={triggerRef}
          type="button"
          id={id}
          aria-label="Contact"
          aria-invalid={errorText ? true : undefined}
          className={cn(
            buttonVariants({ variant: "outline" }),
            "h-9 w-auto justify-start gap-1.5 rounded-full bg-background px-3 shadow-xs"
          )}
        >
          <HugeiconsIcon
            icon={UserIcon}
            strokeWidth={2}
            data-icon="inline-start"
          />
          <span>{triggerLabel}</span>
          <HugeiconsIcon
            icon={ArrowDown01Icon}
            strokeWidth={2}
            data-icon="inline-end"
            className="text-muted-foreground"
          />
        </PopoverTrigger>
        <PopoverContent
          className="w-[var(--anchor-width)] min-w-72 p-0"
          align="start"
        >
          <Command>
            <CommandInput
              value={query}
              onValueChange={setQuery}
              placeholder="Contact"
            />
            <CommandList>
              <CommandEmpty>
                {createContactName
                  ? "No matching contacts."
                  : "Type a contact name to create one."}
              </CommandEmpty>
              {createContactName ? (
                <CommandGroup>
                  <CommandItem
                    aria-label={`Create new contact: "${createContactName}"`}
                    value={`Create new contact ${createContactName}`}
                    className="[&>svg:last-child]:hidden"
                    onSelect={() => {
                      onCreateContact(createContactName);
                      setOpen(false);
                      setQuery("");
                    }}
                  >
                    <span aria-hidden="true" className="text-lg leading-none">
                      +
                    </span>
                    <span>
                      Create new contact:{" "}
                      <span className="text-muted-foreground">
                        &quot;{createContactName}&quot;
                      </span>
                    </span>
                  </CommandItem>
                </CommandGroup>
              ) : null}
              {createContactName && visibleGroups.length > 0 ? (
                <CommandSeparator />
              ) : null}
              {visibleGroups.map((group, groupIndex) => (
                <React.Fragment key={group.label}>
                  <CommandGroup heading={group.label}>
                    {group.options.map((option) => (
                      <CommandItem
                        key={option.value}
                        value={option.label}
                        data-checked={
                          option.value === selectedOption?.value
                            ? "true"
                            : undefined
                        }
                        onSelect={() => {
                          onValueChange(option.value);
                          setOpen(false);
                          setQuery("");
                        }}
                      >
                        {option.icon ? (
                          <HugeiconsIcon
                            icon={option.icon}
                            strokeWidth={2}
                            className="text-muted-foreground"
                          />
                        ) : null}
                        <span className="truncate">{option.label}</span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                  {groupIndex < visibleGroups.length - 1 ? (
                    <CommandSeparator />
                  ) : null}
                </React.Fragment>
              ))}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}

function ResponsiveCreateOverlay({
  children,
  onOpenChange,
  open,
}: {
  readonly children: React.ReactNode;
  readonly onOpenChange: (open: boolean) => void;
  readonly open: boolean;
}) {
  return (
    <ResponsiveDrawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-[92vh] w-full p-2 data-[vaul-drawer-direction=right]:right-0 data-[vaul-drawer-direction=right]:sm:top-1/2 data-[vaul-drawer-direction=right]:sm:right-auto data-[vaul-drawer-direction=right]:sm:bottom-auto data-[vaul-drawer-direction=right]:sm:left-1/2 data-[vaul-drawer-direction=right]:sm:h-auto data-[vaul-drawer-direction=right]:sm:max-h-[calc(100vh-6rem)] data-[vaul-drawer-direction=right]:sm:max-w-[min(56rem,calc(100vw-6rem))] data-[vaul-drawer-direction=right]:sm:-translate-x-1/2 data-[vaul-drawer-direction=right]:sm:-translate-y-1/2 data-[vaul-drawer-direction=right]:sm:animate-none!">
        <DrawerHeader className="border-b px-5 py-4 text-left md:px-6 md:py-5">
          <DrawerTitle>New job</DrawerTitle>
          <DrawerDescription>
            Capture the work, then add assignment and location context.
          </DrawerDescription>
        </DrawerHeader>
        {children}
      </DrawerContent>
    </ResponsiveDrawer>
  );
}

function buildSiteSelectionGroups(sites: readonly JobSiteOption[]) {
  const hasExistingSites = sites.length > 0;

  return [
    {
      label: "Quick actions",
      options: [
        ...(hasExistingSites
          ? [
              {
                label: "No site yet",
                value: NONE_VALUE,
              },
            ]
          : []),
        {
          label: "Create a new site",
          value: INLINE_CREATE_VALUE,
        },
      ],
    },
    {
      label: "Existing sites",
      options: sites.map((site) => ({
        label: site.name,
        value: site.id,
      })),
    },
  ] satisfies readonly CommandSelectGroup[];
}

function buildPrioritySelectionGroups() {
  return [
    {
      label: "Priority",
      options: PRIORITY_OPTIONS.map((priority) => ({
        icon: priority.icon,
        label: priority.label,
        value: priority.value,
      })),
    },
  ] satisfies readonly CommandSelectGroup[];
}

function buildSiteRegionSelectionGroups(
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

function buildContactSelectionGroups(
  contactGroups: ReturnType<typeof deriveContactsForSite>
) {
  const hasExistingContacts =
    contactGroups.linked.length > 0 || contactGroups.others.length > 0;
  const groups: CommandSelectGroup[] = [];

  if (hasExistingContacts) {
    groups.push({
      label: "Quick actions",
      options: [
        {
          label: "No contact yet",
          value: NONE_VALUE,
        },
      ],
    });
  }

  if (contactGroups.linked.length > 0) {
    groups.push({
      label: "Linked to the selected site",
      options: contactGroups.linked.map((contact) => ({
        label: contact.name,
        value: contact.id,
      })),
    });
  }

  if (contactGroups.others.length > 0) {
    groups.push({
      label: "Other contacts",
      options: contactGroups.others.map((contact) => ({
        label: contact.name,
        value: contact.id,
      })),
    });
  }

  return groups;
}

function validate(values: JobsCreateFormState): JobsCreateFieldErrors {
  const siteCoordinateErrors = validateSiteCoordinates(values);

  return {
    contactName:
      values.contactSelection === INLINE_CREATE_VALUE &&
      values.contactName.trim().length === 0
        ? "Add the contact name or pick an existing contact."
        : undefined,
    siteLatitude: siteCoordinateErrors.siteLatitude,
    siteLongitude: siteCoordinateErrors.siteLongitude,
    siteName:
      values.siteSelection === INLINE_CREATE_VALUE &&
      values.siteName.trim().length === 0
        ? "Add the site name or pick an existing site."
        : undefined,
    title:
      values.title.trim().length === 0
        ? "Give the job a clear title before you create it."
        : undefined,
  };
}

function hasInlineSiteDraft(values: JobsCreateFormState) {
  return values.siteName.trim().length > 0;
}

function hasFieldErrors(errors: JobsCreateFieldErrors) {
  return Object.values(errors).some((value) => value !== undefined);
}

function buildCreateJobInput(
  values: JobsCreateFormState,
  selectionIds: JobsCreateSelectionIds
): CreateJobInput {
  const siteCoordinates = resolveSiteCoordinateDraft(values);

  return {
    contact: resolveCreateJobContactInput(values, selectionIds),
    priority: values.priority === "none" ? undefined : values.priority,
    site: resolveCreateJobSiteInput(values, selectionIds, siteCoordinates),
    title: values.title.trim(),
  };
}

function resolveCreateJobContactInput(
  values: JobsCreateFormState,
  selectionIds: JobsCreateSelectionIds
): CreateJobInput["contact"] {
  if (values.contactSelection === NONE_VALUE) {
    return undefined;
  }

  if (values.contactSelection === INLINE_CREATE_VALUE) {
    return {
      kind: "create",
      input: {
        name: values.contactName.trim(),
      },
    };
  }

  return {
    kind: "existing",
    contactId: selectionIds.contactId as ContactIdType,
  };
}

function resolveCreateJobSiteInput(
  values: JobsCreateFormState,
  selectionIds: JobsCreateSelectionIds,
  siteCoordinates: ReturnType<typeof resolveSiteCoordinateDraft>
): CreateJobInput["site"] {
  if (values.siteSelection === NONE_VALUE) {
    return undefined;
  }

  if (values.siteSelection === INLINE_CREATE_VALUE) {
    return {
      kind: "create",
      input: {
        accessNotes: toOptionalTrimmedString(values.siteAccessNotes),
        addressLine1: toOptionalTrimmedString(values.siteAddressLine1),
        addressLine2: toOptionalTrimmedString(values.siteAddressLine2),
        county: toOptionalTrimmedString(values.siteCounty),
        eircode: toOptionalTrimmedString(values.siteEircode),
        latitude: siteCoordinates?.latitude,
        longitude: siteCoordinates?.longitude,
        name: values.siteName.trim(),
        regionId:
          values.siteRegionSelection === NONE_VALUE
            ? undefined
            : (values.siteRegionSelection as RegionIdType),
        town: toOptionalTrimmedString(values.siteTown),
      },
    };
  }

  return {
    kind: "existing",
    siteId: selectionIds.siteId as SiteIdType,
  };
}

interface JobsCreateSelectionIds {
  readonly contactId?: ContactIdType;
  readonly siteId?: SiteIdType;
}

function resolveCreateSelectionIds(
  values: JobsCreateFormState,
  options: {
    readonly contacts: readonly JobContactOption[];
    readonly sites: readonly JobSiteOption[];
  }
): JobsCreateSelectionIds {
  return {
    contactId:
      values.contactSelection === NONE_VALUE ||
      values.contactSelection === INLINE_CREATE_VALUE
        ? undefined
        : resolveSelectedOptionId(options.contacts, values.contactSelection),
    siteId:
      values.siteSelection === NONE_VALUE ||
      values.siteSelection === INLINE_CREATE_VALUE
        ? undefined
        : resolveSelectedOptionId(options.sites, values.siteSelection),
  };
}

function resolveSelectedOptionId<Id extends string>(
  options: readonly { readonly id: Id }[],
  value: string
): Id | undefined {
  return options.find((option) => option.id === value)?.id;
}

function resolveSiteCoordinateDraft(values: JobsCreateFormState) {
  const latitude = parseCoordinate(values.siteLatitude);
  const longitude = parseCoordinate(values.siteLongitude);

  if (latitude === undefined || longitude === undefined) {
    return;
  }

  return { latitude, longitude };
}

function validateSiteCoordinates(values: JobsCreateFormState) {
  if (values.siteSelection !== INLINE_CREATE_VALUE) {
    return {
      siteLatitude: undefined,
      siteLongitude: undefined,
    };
  }

  const latitudeValue = values.siteLatitude.trim();
  const longitudeValue = values.siteLongitude.trim();

  if (latitudeValue.length === 0 && longitudeValue.length === 0) {
    return {
      siteLatitude: undefined,
      siteLongitude: undefined,
    };
  }

  if (latitudeValue.length === 0 || longitudeValue.length === 0) {
    return {
      siteLatitude:
        latitudeValue.length === 0
          ? "Add both latitude and longitude or leave both empty."
          : undefined,
      siteLongitude:
        longitudeValue.length === 0
          ? "Add both latitude and longitude or leave both empty."
          : undefined,
    };
  }

  const latitude = Number(latitudeValue);
  const longitude = Number(longitudeValue);

  return {
    siteLatitude:
      !Number.isFinite(latitude) || latitude < -90 || latitude > 90
        ? "Latitude must be between -90 and 90."
        : undefined,
    siteLongitude:
      !Number.isFinite(longitude) || longitude < -180 || longitude > 180
        ? "Longitude must be between -180 and 180."
        : undefined,
  };
}

function parseCoordinate(value: string) {
  const trimmed = value.trim();

  if (trimmed.length === 0) {
    return;
  }

  const parsed = Number(trimmed);

  return Number.isFinite(parsed) ? parsed : undefined;
}

function formatCoordinate(value: number) {
  return value.toFixed(6).replace(/\.?0+$/, "");
}

function toOptionalTrimmedString(value: string) {
  const trimmed = value.trim();

  return trimmed.length === 0 ? undefined : trimmed;
}
