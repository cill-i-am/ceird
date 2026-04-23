"use client";

import { Result, useAtomSet, useAtomValue } from "@effect-atom/atom-react";
import {
  Add01Icon,
  ArrowDown01Icon,
  ArrowRight01Icon,
  Briefcase01Icon,
  Location01Icon,
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
import { Button } from "#/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "#/components/ui/collapsible";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "#/components/ui/command";
import { FieldGroup } from "#/components/ui/field";
import { Input } from "#/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "#/components/ui/popover";
import { Select } from "#/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "#/components/ui/sheet";
import { Textarea } from "#/components/ui/textarea";
import { AuthFormField } from "#/features/auth/auth-form-field";
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
  readonly label: string;
  readonly value: JobPriority;
}[] = [
  { label: "No priority", value: "none" },
  { label: "Low", value: "low" },
  { label: "Medium", value: "medium" },
  { label: "High", value: "high" },
  { label: "Urgent", value: "urgent" },
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

interface JobsComboboxOption {
  readonly label: string;
  readonly value: string;
}

interface JobsComboboxGroup {
  readonly label: string;
  readonly options: readonly JobsComboboxOption[];
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
  const [siteDetailsOpen, setSiteDetailsOpen] = React.useState(false);

  const selectedSiteId =
    values.siteSelection === NONE_VALUE ||
    values.siteSelection === INLINE_CREATE_VALUE
      ? undefined
      : resolveSelectedOptionId(options.sites, values.siteSelection);
  const contactGroups = deriveContactsForSite(options.contacts, selectedSiteId);
  const siteSelectionGroups = buildSiteSelectionGroups(options.sites);
  const contactSelectionGroups = buildContactSelectionGroups(contactGroups);

  React.useEffect(() => {
    if (values.siteSelection !== INLINE_CREATE_VALUE) {
      setSiteDetailsOpen(false);
    }
  }, [values.siteSelection]);

  React.useEffect(() => {
    if (fieldErrors.siteLatitude || fieldErrors.siteLongitude) {
      setSiteDetailsOpen(true);
    }
  }, [fieldErrors.siteLatitude, fieldErrors.siteLongitude]);
  const parsedSiteCoordinates = resolveSiteCoordinateDraft(values);

  function closeSheet() {
    React.startTransition(() => {
      navigate({ to: "/jobs" });
    });
  }

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
    <Sheet
      open
      onOpenChange={(open) => {
        if (!open) {
          closeSheet();
        }
      }}
    >
      <SheetContent side="right" className="w-full sm:max-w-xl">
        <SheetHeader className="gap-3 border-b">
          <Badge variant="secondary" className="w-fit rounded-full px-3 py-1">
            New job
          </Badge>
          <div className="flex flex-col gap-1.5">
            <SheetTitle>Capture the work while it is still fresh.</SheetTitle>
            <SheetDescription>
              Keep intake tight now. Title, urgency, site, and the right contact
              are enough to get the queue moving.
            </SheetDescription>
          </div>
        </SheetHeader>

        <form
          className="flex min-h-0 flex-1 flex-col"
          noValidate
          onSubmit={handleSubmit}
        >
          <div className="flex flex-1 flex-col gap-6 overflow-y-auto p-6">
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
                descriptionText="Use the clearest short job title the team would recognise on a busy day."
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

              <AuthFormField
                label="Priority"
                htmlFor="job-priority"
                invalid={false}
                descriptionText="If it can wait, leave it at no priority and keep the queue honest."
              >
                <Select
                  id="job-priority"
                  value={values.priority}
                  onChange={(event) =>
                    setValues((current) => ({
                      ...current,
                      priority: event.target.value as JobPriority,
                    }))
                  }
                >
                  {PRIORITY_OPTIONS.map((priority) => (
                    <option key={priority.value} value={priority.value}>
                      {priority.label}
                    </option>
                  ))}
                </Select>
              </AuthFormField>
            </FieldGroup>

            <FieldGroup>
              <AuthFormField
                label="Site"
                htmlFor="job-site"
                invalid={Boolean(fieldErrors.siteName)}
                descriptionText="Pick an existing site or create it inline without leaving intake."
                errorText={fieldErrors.siteName}
              >
                <SelectionCombobox
                  id="job-site"
                  value={values.siteSelection}
                  placeholder="Search sites"
                  emptyText="No sites found."
                  groups={siteSelectionGroups}
                  aria-invalid={Boolean(fieldErrors.siteName) || undefined}
                  onValueChange={(nextValue) =>
                    setValues((current) => ({
                      ...current,
                      siteSelection: nextValue,
                    }))
                  }
                />
              </AuthFormField>

              {values.siteSelection === INLINE_CREATE_VALUE ? (
                <div className="rounded-3xl border bg-muted/20 p-4">
                  <div className="mb-4 flex items-center gap-2">
                    <HugeiconsIcon icon={Location01Icon} strokeWidth={2} />
                    <p className="font-medium">New site details</p>
                  </div>
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
                        aria-invalid={
                          Boolean(fieldErrors.siteName) || undefined
                        }
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
                      descriptionText="Optional in v1, but useful when the site already belongs to a service patch."
                    >
                      <Select
                        id="new-site-region"
                        value={values.siteRegionSelection}
                        onChange={(event) =>
                          setValues((current) => ({
                            ...current,
                            siteRegionSelection: event.target.value,
                          }))
                        }
                      >
                        <option value={NONE_VALUE}>No region yet</option>
                        {options.regions.map((region) => (
                          <option key={region.id} value={region.id}>
                            {region.name}
                          </option>
                        ))}
                      </Select>
                    </AuthFormField>

                    <Collapsible
                      open={siteDetailsOpen}
                      onOpenChange={setSiteDetailsOpen}
                    >
                      <div className="rounded-2xl border bg-background/80">
                        <div className="flex flex-wrap items-start justify-between gap-3 px-4 py-4">
                          <div className="flex max-w-[32rem] flex-col gap-1">
                            <p className="font-medium">Add location details</p>
                            <p className="text-sm text-muted-foreground">
                              Address, access notes, and a pin can wait until
                              you have them, but they make dispatch and mapping
                              much better straight away.
                            </p>
                          </div>
                          <CollapsibleTrigger className="inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors hover:bg-muted">
                            <span>
                              {siteDetailsOpen ? "Hide details" : "Add details"}
                            </span>
                            <HugeiconsIcon
                              icon={ArrowRight01Icon}
                              strokeWidth={2}
                              className={cn(
                                "transition-transform",
                                siteDetailsOpen ? "rotate-90" : "rotate-0"
                              )}
                            />
                          </CollapsibleTrigger>
                        </div>

                        <CollapsibleContent className="border-t px-4 py-4">
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
                              descriptionText="Anything the crew should know before they arrive."
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

                            <div className="flex flex-col gap-4 rounded-2xl border bg-muted/10 p-4">
                              <div className="flex flex-wrap items-start justify-between gap-3">
                                <div className="flex max-w-[32rem] flex-col gap-1">
                                  <p className="font-medium">Site pin</p>
                                  <p className="text-sm text-muted-foreground">
                                    Optional, but worth doing. A pin makes the
                                    coverage map and Google Maps handoff work
                                    straight away.
                                  </p>
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
                                    siteLatitude: formatCoordinate(
                                      next.latitude
                                    ),
                                    siteLongitude: formatCoordinate(
                                      next.longitude
                                    ),
                                  }))
                                }
                              />

                              <FieldGroup>
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
                                      Boolean(fieldErrors.siteLatitude) ||
                                      undefined
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
                                      Boolean(fieldErrors.siteLongitude) ||
                                      undefined
                                    }
                                    onChange={(event) =>
                                      setValues((current) => ({
                                        ...current,
                                        siteLongitude: event.target.value,
                                      }))
                                    }
                                  />
                                </AuthFormField>
                              </FieldGroup>
                            </div>
                          </FieldGroup>
                        </CollapsibleContent>
                      </div>
                    </Collapsible>
                  </FieldGroup>
                </div>
              ) : null}
            </FieldGroup>

            <FieldGroup>
              <AuthFormField
                label="Contact"
                htmlFor="job-contact"
                invalid={Boolean(fieldErrors.contactName)}
                descriptionText="Use an existing contact when the site already has one, or add a new contact inline."
                errorText={fieldErrors.contactName}
              >
                <SelectionCombobox
                  id="job-contact"
                  value={values.contactSelection}
                  placeholder="Search contacts"
                  emptyText="No contacts found."
                  groups={contactSelectionGroups}
                  aria-invalid={Boolean(fieldErrors.contactName) || undefined}
                  onValueChange={(nextValue) =>
                    setValues((current) => ({
                      ...current,
                      contactSelection: nextValue,
                    }))
                  }
                />
              </AuthFormField>

              {values.contactSelection === INLINE_CREATE_VALUE ? (
                <div className="rounded-3xl border bg-muted/20 p-4">
                  <div className="mb-4 flex items-center gap-2">
                    <HugeiconsIcon icon={Add01Icon} strokeWidth={2} />
                    <p className="font-medium">New contact details</p>
                  </div>
                  <FieldGroup>
                    <AuthFormField
                      label="Contact name"
                      htmlFor="new-contact-name"
                      invalid={Boolean(fieldErrors.contactName)}
                      errorText={fieldErrors.contactName}
                    >
                      <Input
                        id="new-contact-name"
                        value={values.contactName}
                        aria-invalid={
                          Boolean(fieldErrors.contactName) || undefined
                        }
                        onChange={(event) =>
                          setValues((current) => ({
                            ...current,
                            contactName: event.target.value,
                          }))
                        }
                      />
                    </AuthFormField>
                  </FieldGroup>
                </div>
              ) : null}
            </FieldGroup>
          </div>

          <SheetFooter className="border-t">
            <Button type="button" variant="ghost" onClick={closeSheet}>
              Cancel
            </Button>
            <Button type="submit" disabled={createResult.waiting}>
              <HugeiconsIcon
                icon={Add01Icon}
                strokeWidth={2}
                data-icon="inline-start"
              />
              {createResult.waiting ? "Creating..." : "Create job"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}

function SelectionCombobox({
  ariaInvalid,
  emptyText,
  groups,
  id,
  onValueChange,
  placeholder,
  value,
}: {
  readonly ariaInvalid?: true | undefined;
  readonly emptyText: string;
  readonly groups: readonly JobsComboboxGroup[];
  readonly id: string;
  readonly onValueChange: (value: string) => void;
  readonly placeholder: string;
  readonly value: string;
}) {
  const [open, setOpen] = React.useState(false);
  const selectedOption =
    groups
      .flatMap((group) => group.options)
      .find((option) => option.value === value) ?? null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="outline"
            className="w-full justify-between rounded-4xl font-normal"
          />
        }
        id={id}
        aria-invalid={ariaInvalid}
      >
        <span
          className={cn(
            "truncate",
            selectedOption ? "text-foreground" : "text-muted-foreground"
          )}
        >
          {selectedOption?.label ?? placeholder}
        </span>
        <HugeiconsIcon
          icon={ArrowDown01Icon}
          strokeWidth={2}
          data-icon="inline-end"
          className="text-muted-foreground"
        />
      </PopoverTrigger>
      <PopoverContent className="w-[var(--anchor-width)] p-0" align="start">
        <Command>
          <CommandInput placeholder={placeholder} />
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            {groups.map((group, groupIndex) => (
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
                      }}
                    >
                      {option.label}
                    </CommandItem>
                  ))}
                </CommandGroup>
                {groupIndex < groups.length - 1 ? <CommandSeparator /> : null}
              </React.Fragment>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function buildSiteSelectionGroups(sites: readonly JobSiteOption[]) {
  return [
    {
      label: "Quick actions",
      options: [
        {
          label: "No site yet",
          value: NONE_VALUE,
        },
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
  ] satisfies readonly JobsComboboxGroup[];
}

function buildContactSelectionGroups(
  contactGroups: ReturnType<typeof deriveContactsForSite>
) {
  const groups: JobsComboboxGroup[] = [
    {
      label: "Quick actions",
      options: [
        {
          label: "No contact yet",
          value: NONE_VALUE,
        },
        {
          label: "Create a new contact",
          value: INLINE_CREATE_VALUE,
        },
      ],
    },
  ];

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
