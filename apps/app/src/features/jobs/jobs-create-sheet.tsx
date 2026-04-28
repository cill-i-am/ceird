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
  ContactEmailSchema,
  ContactNameSchema,
  ContactNotesSchema,
  CONTACT_NOT_FOUND_ERROR_TAG,
  JobExternalReferenceSchema,
  SITE_GEOCODING_FAILED_ERROR_TAG,
  SITE_NOT_FOUND_ERROR_TAG,
} from "@task-tracker/jobs-core";
import type {
  ContactIdType,
  CreateJobInput,
  JobPriority,
  JobContactOption,
  JobRegionOption,
  JobSiteOption,
  SiteIdType,
} from "@task-tracker/jobs-core";
import { Cause, Exit, ParseResult } from "effect";
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
import { Textarea } from "#/components/ui/textarea";
import { AuthFormField } from "#/features/auth/auth-form-field";
import {
  SiteCreateFields,
  buildCreateSiteInputFromDraft,
  buildSiteRegionSelectionGroups,
  defaultSiteCreateDraft,
  hasSiteCreateFieldErrors,
  toOptionalTrimmedString,
  validateSiteCreateDraft,
} from "#/features/sites/site-create-form";
import type {
  SiteCreateDraft,
  SiteCreateFieldErrors,
} from "#/features/sites/site-create-form";
import { cn } from "#/lib/utils";

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
  readonly shortcut: string;
  readonly value: JobPriority;
}[] = [
  { icon: MinusSignIcon, label: "None", shortcut: "0", value: "none" },
  { icon: AlertSquareIcon, label: "Urgent", shortcut: "1", value: "urgent" },
  {
    icon: SignalFull02Icon,
    label: "High",
    shortcut: "2",
    value: "high",
  },
  {
    icon: SignalMedium02Icon,
    label: "Medium",
    shortcut: "3",
    value: "medium",
  },
  {
    icon: SignalLow02Icon,
    label: "Low",
    shortcut: "4",
    value: "low",
  },
];

interface JobsCreateFormState {
  readonly contactEmail: string;
  readonly contactName: string;
  readonly contactNotes: string;
  readonly contactPhone: string;
  readonly contactSelection: string;
  readonly externalReference: string;
  readonly priority: JobPriority;
  readonly siteDraft: SiteCreateDraft;
  readonly siteSelection: string;
  readonly title: string;
}

interface JobsCreateFieldErrors {
  readonly contactEmail?: string;
  readonly contactName?: string;
  readonly contactNotes?: string;
  readonly externalReference?: string;
  readonly site?: SiteCreateFieldErrors;
  readonly siteSelection?: string;
  readonly title?: string;
}

const decodeContactEmail = ParseResult.decodeUnknownSync(ContactEmailSchema);
const decodeContactName = ParseResult.decodeUnknownSync(ContactNameSchema);
const decodeContactNotes = ParseResult.decodeUnknownSync(ContactNotesSchema);
const decodeJobExternalReference = ParseResult.decodeUnknownSync(
  JobExternalReferenceSchema
);

const defaultFormState: JobsCreateFormState = {
  contactEmail: "",
  contactName: "",
  contactNotes: "",
  contactPhone: "",
  contactSelection: NONE_VALUE,
  externalReference: "",
  priority: "none",
  siteDraft: defaultSiteCreateDraft,
  siteSelection: NONE_VALUE,
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
  const [overlayOpen, setOverlayOpen] = React.useState(true);
  const [siteDrawerOpen, setSiteDrawerOpen] = React.useState(false);
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
    }
  }, [values.siteSelection]);

  React.useEffect(() => {
    if (
      values.siteSelection === INLINE_CREATE_VALUE &&
      fieldErrors.site &&
      hasSiteCreateFieldErrors(fieldErrors.site)
    ) {
      setSiteDrawerOpen(true);
    }
  }, [fieldErrors.site, values.siteSelection]);

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

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const nextErrors = validate(values, options.regions);
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
        siteSelection: "That site is no longer available. Pick another one.",
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

    const payload = buildCreateJobInput(values, selectionIds, options.regions);
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
        siteSelection: "That site is no longer available. Pick another one.",
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

    if (
      failure._tag === "Some" &&
      failure.value._tag === SITE_GEOCODING_FAILED_ERROR_TAG
    ) {
      setFieldErrors((current) => ({
        ...current,
        site: {
          ...current.site,
          eircode: failure.value.message,
        },
      }));
      setSiteDrawerOpen(true);
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
        className="flex min-h-0 flex-1 flex-col"
        method="post"
        noValidate
        onSubmit={handleSubmit}
      >
        <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-5 py-4 sm:px-6">
          {Result.builder(createResult)
            .onError((error) =>
              isHandledCreateJobError(error) ? null : (
                <Alert variant="destructive">
                  <HugeiconsIcon icon={Briefcase01Icon} strokeWidth={2} />
                  <AlertTitle>We couldn&apos;t create that job.</AlertTitle>
                  <AlertDescription>{error.message}</AlertDescription>
                </Alert>
              )
            )
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

          <FieldGroup>
            <AuthFormField
              label="External reference"
              htmlFor="job-external-reference"
              invalid={Boolean(fieldErrors.externalReference)}
              errorText={fieldErrors.externalReference}
            >
              <Input
                id="job-external-reference"
                value={values.externalReference}
                aria-invalid={
                  Boolean(fieldErrors.externalReference) || undefined
                }
                onChange={(event) =>
                  setValues((current) => ({
                    ...current,
                    externalReference: event.target.value,
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
                placeholder="Priority"
                emptyText="No priorities found."
                groups={prioritySelectionGroups}
                icon={Flag01Icon}
                searchPlaceholder="Set priority to..."
                showGroupHeadings={false}
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
                placeholder="Site"
                emptyText="No sites found."
                groups={siteSelectionGroups}
                icon={Location01Icon}
                errorText={fieldErrors.siteSelection}
                onValueChange={(nextValue) => {
                  setValues((current) => ({
                    ...current,
                    siteSelection: nextValue,
                  }));

                  if (nextValue === INLINE_CREATE_VALUE) {
                    setFieldErrors(clearSiteSelectionFieldError);
                    setSiteDrawerOpen(true);
                    return;
                  }

                  setFieldErrors(clearInlineSiteFieldErrors);
                }}
              />
              <LinearContactSelect
                id="job-contact"
                value={values.contactSelection}
                contactName={values.contactName}
                groups={contactSelectionGroups}
                errorText={fieldErrors.contactName}
                onValueChange={(nextValue) =>
                  setValues((current) => ({
                    ...current,
                    contactEmail: "",
                    contactName: "",
                    contactNotes: "",
                    contactPhone: "",
                    contactSelection: nextValue,
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
            {fieldErrors.siteSelection ? (
              <p className="text-sm text-destructive">
                {fieldErrors.siteSelection}
              </p>
            ) : null}
            {fieldErrors.contactName ? (
              <p className="text-sm text-destructive">
                {fieldErrors.contactName}
              </p>
            ) : null}
          </div>

          {values.contactSelection === INLINE_CREATE_VALUE ? (
            <FieldGroup>
              <AuthFormField
                label="Contact email"
                htmlFor="job-contact-email"
                invalid={Boolean(fieldErrors.contactEmail)}
                errorText={fieldErrors.contactEmail}
              >
                <Input
                  id="job-contact-email"
                  type="email"
                  value={values.contactEmail}
                  aria-invalid={Boolean(fieldErrors.contactEmail) || undefined}
                  onChange={(event) =>
                    setValues((current) => ({
                      ...current,
                      contactEmail: event.target.value,
                    }))
                  }
                />
              </AuthFormField>
              <AuthFormField
                label="Contact phone"
                htmlFor="job-contact-phone"
                invalid={false}
              >
                <Input
                  id="job-contact-phone"
                  value={values.contactPhone}
                  onChange={(event) =>
                    setValues((current) => ({
                      ...current,
                      contactPhone: event.target.value,
                    }))
                  }
                />
              </AuthFormField>
              <AuthFormField
                label="Contact notes"
                htmlFor="job-contact-notes"
                invalid={Boolean(fieldErrors.contactNotes)}
                errorText={fieldErrors.contactNotes}
              >
                <Textarea
                  id="job-contact-notes"
                  value={values.contactNotes}
                  aria-invalid={Boolean(fieldErrors.contactNotes) || undefined}
                  onChange={(event) =>
                    setValues((current) => ({
                      ...current,
                      contactNotes: event.target.value,
                    }))
                  }
                />
              </AuthFormField>
            </FieldGroup>
          ) : null}

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
                      {values.siteDraft.name.trim()}
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
                Create job
              </>
            )}
          </Button>
        </DrawerFooter>
      </form>

      <ResponsiveNestedDrawer
        open={siteDrawerOpen}
        onOpenChange={setSiteDrawerOpen}
      >
        <DrawerContent className="max-h-[92vh] w-full p-2 data-[vaul-drawer-direction=right]:inset-y-0 data-[vaul-drawer-direction=right]:right-0 data-[vaul-drawer-direction=right]:h-full data-[vaul-drawer-direction=right]:max-h-none data-[vaul-drawer-direction=right]:sm:max-w-2xl">
          <DrawerHeader className="border-b px-5 py-4 text-left md:px-6">
            <Badge variant="secondary" className="w-fit rounded-full px-3 py-1">
              Site
            </Badge>
            <DrawerTitle>New site</DrawerTitle>
            <DrawerDescription>
              Capture the place once. The address will be geocoded when the job
              is created.
            </DrawerDescription>
          </DrawerHeader>

          <div className="flex flex-1 flex-col gap-5 overflow-y-auto px-5 py-4 sm:px-6">
            <SiteCreateFields
              draft={values.siteDraft}
              errors={fieldErrors.site ?? {}}
              idPrefix="new-site"
              regionGroups={siteRegionSelectionGroups}
              onDraftChange={(siteDraft) =>
                setValues((current) => ({
                  ...current,
                  siteDraft,
                }))
              }
              onRegionSelectionChange={(nextValue) => {
                setFieldErrors((current) => ({
                  ...current,
                  site: {
                    ...current.site,
                    regionSelection: undefined,
                  },
                }));
                setValues((current) => ({
                  ...current,
                  siteDraft: {
                    ...current.siteDraft,
                    regionSelection: nextValue,
                  },
                }));
              }}
            />
          </div>

          <DrawerFooter className="flex-row justify-end border-t px-5 py-4 sm:px-6">
            <Button type="button" onClick={() => setSiteDrawerOpen(false)}>
              Done
            </Button>
          </DrawerFooter>
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
  onValueChange,
  placeholder,
  searchPlaceholder,
  showGroupHeadings,
  value,
}: {
  readonly emptyText: string;
  readonly errorText?: string;
  readonly groups: readonly CommandSelectGroup[];
  readonly icon: React.ComponentProps<typeof HugeiconsIcon>["icon"];
  readonly id: string;
  readonly label: string;
  readonly onValueChange: (value: string) => void;
  readonly placeholder: string;
  readonly searchPlaceholder?: string;
  readonly showGroupHeadings?: boolean;
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
        prefix={<HugeiconsIcon icon={triggerIcon} strokeWidth={2} />}
        searchPlaceholder={searchPlaceholder}
        showGroupHeadings={showGroupHeadings}
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
  onCreateContact,
  onValueChange,
  value,
}: {
  readonly contactName: string;
  readonly errorText?: string;
  readonly groups: readonly CommandSelectGroup[];
  readonly id: string;
  readonly onCreateContact: (contactName: string) => void;
  readonly onValueChange: (value: string) => void;
  readonly value: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const selectedOption =
    groups
      .flatMap((group) => group.options)
      .find((option) => option.value === value) ?? null;
  const createdContactName =
    value === INLINE_CREATE_VALUE ? contactName.trim() : "";
  const triggerLabel = createdContactName || selectedOption?.label || "Contact";
  const createContactName = query.trim();
  const visibleGroups = groups.filter((group) => group.options.length > 0);

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
        shortcut: priority.shortcut,
        value: priority.value,
      })),
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

function validate(
  values: JobsCreateFormState,
  regions: readonly JobRegionOption[]
): JobsCreateFieldErrors {
  const validateInlineSite = values.siteSelection === INLINE_CREATE_VALUE;
  const validateInlineContact = values.contactSelection === INLINE_CREATE_VALUE;
  const siteErrors = validateInlineSite
    ? validateSiteCreateDraft(values.siteDraft, regions, {
        nameRequiredMessage: "Add the site name or pick an existing site.",
      })
    : undefined;

  return {
    contactEmail: validateInlineContact
      ? validateOptionalBoundaryField(
          values.contactEmail,
          decodeContactEmail,
          "Enter a valid email address."
        )
      : undefined,
    contactName:
      validateInlineContact &&
      !isValidBoundaryValue(values.contactName, decodeContactName)
        ? "Add the contact name or pick an existing contact."
        : undefined,
    contactNotes: validateInlineContact
      ? validateOptionalBoundaryField(
          values.contactNotes,
          decodeContactNotes,
          "Use 2,000 characters or fewer."
        )
      : undefined,
    externalReference: validateOptionalBoundaryField(
      values.externalReference,
      decodeJobExternalReference,
      "Use 120 characters or fewer."
    ),
    site:
      siteErrors && hasSiteCreateFieldErrors(siteErrors)
        ? siteErrors
        : undefined,
    title:
      values.title.trim().length === 0
        ? "Give the job a clear title before you create it."
        : undefined,
  };
}

function hasInlineSiteDraft(values: JobsCreateFormState) {
  return values.siteDraft.name.trim().length > 0;
}

function hasFieldErrors(errors: JobsCreateFieldErrors) {
  return (
    errors.contactEmail !== undefined ||
    errors.contactName !== undefined ||
    errors.contactNotes !== undefined ||
    errors.externalReference !== undefined ||
    errors.siteSelection !== undefined ||
    errors.title !== undefined ||
    (errors.site !== undefined && hasSiteCreateFieldErrors(errors.site))
  );
}

function validateOptionalBoundaryField(
  value: string,
  decode: (value: unknown) => unknown,
  errorText: string
) {
  const trimmedValue = toOptionalTrimmedString(value);

  return trimmedValue === undefined ||
    isValidBoundaryValue(trimmedValue, decode)
    ? undefined
    : errorText;
}

function isValidBoundaryValue(
  value: unknown,
  decode: (value: unknown) => unknown
) {
  try {
    decode(value);
    return true;
  } catch {
    return false;
  }
}

function clearInlineSiteFieldErrors(
  current: JobsCreateFieldErrors
): JobsCreateFieldErrors {
  return {
    ...current,
    site: undefined,
    siteSelection: undefined,
  };
}

function clearSiteSelectionFieldError(
  current: JobsCreateFieldErrors
): JobsCreateFieldErrors {
  return {
    ...current,
    siteSelection: undefined,
  };
}

function isHandledCreateJobError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "_tag" in error &&
    (error._tag === SITE_NOT_FOUND_ERROR_TAG ||
      error._tag === CONTACT_NOT_FOUND_ERROR_TAG ||
      error._tag === SITE_GEOCODING_FAILED_ERROR_TAG)
  );
}

function buildCreateJobInput(
  values: JobsCreateFormState,
  selectionIds: JobsCreateSelectionIds,
  regions: readonly JobRegionOption[]
): CreateJobInput {
  return {
    contact: resolveCreateJobContactInput(values, selectionIds),
    externalReference: toOptionalTrimmedString(values.externalReference),
    priority: values.priority === "none" ? undefined : values.priority,
    site: resolveCreateJobSiteInput(values, selectionIds, regions),
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
    const email = toOptionalTrimmedString(values.contactEmail);
    const phone = toOptionalTrimmedString(values.contactPhone);
    const notes = toOptionalTrimmedString(values.contactNotes);

    return {
      kind: "create",
      input: {
        name: values.contactName.trim(),
        ...(email === undefined ? {} : { email }),
        ...(phone === undefined ? {} : { phone }),
        ...(notes === undefined ? {} : { notes }),
      },
    };
  }

  return {
    kind: "existing",
    contactId: expectDefined(
      selectionIds.contactId,
      "Expected contactId for existing contact selection."
    ),
  };
}

function resolveCreateJobSiteInput(
  values: JobsCreateFormState,
  selectionIds: JobsCreateSelectionIds,
  regions: readonly JobRegionOption[]
): CreateJobInput["site"] {
  if (values.siteSelection === NONE_VALUE) {
    return undefined;
  }

  if (values.siteSelection === INLINE_CREATE_VALUE) {
    return {
      kind: "create",
      input: buildCreateSiteInputFromDraft(values.siteDraft, regions),
    };
  }

  return {
    kind: "existing",
    siteId: expectDefined(
      selectionIds.siteId,
      "Expected siteId for existing site selection."
    ),
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

function expectDefined<Value>(
  value: Value | undefined,
  message: string
): Value {
  if (value === undefined) {
    throw new Error(message);
  }

  return value;
}
