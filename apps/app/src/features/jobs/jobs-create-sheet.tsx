"use client";
import {
  CONTACT_NOT_FOUND_ERROR_TAG,
  ContactEmailSchema,
  ContactNameSchema,
  ContactNotesSchema,
} from "@ceird/jobs-core";
import type {
  ContactIdType,
  CreateJobInput,
  JobContactOption,
  JobPriority,
} from "@ceird/jobs-core";
import { SITE_NOT_FOUND_ERROR_TAG } from "@ceird/sites-core";
import type { SiteIdType, SiteOption } from "@ceird/sites-core";
import {
  Add01Icon,
  AlertSquareIcon,
  ArrowDown01Icon,
  Briefcase01Icon,
  Cancel01Icon,
  Flag01Icon,
  Location01Icon,
  MinusSignIcon,
  SignalFull02Icon,
  SignalLow02Icon,
  SignalMedium02Icon,
  UserIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Cause, Exit, Option, Schema } from "effect";
import * as React from "react";

import { Alert, AlertDescription, AlertTitle } from "#/components/ui/alert";
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
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DRAWER_CLOSE_FALLBACK_MS,
} from "#/components/ui/drawer";
import { FieldGroup } from "#/components/ui/field";
import { Input } from "#/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "#/components/ui/popover";
import { ResponsiveDrawer } from "#/components/ui/responsive-drawer";
import { Textarea } from "#/components/ui/textarea";
import { AuthFormField } from "#/features/auth/auth-form-field";
import { toOptionalTrimmedString } from "#/features/sites/site-create-form";
import { useWorkspaceSheetSiteCreated } from "#/features/workspace-sheets/workspace-sheet-events";
import { usePushWorkspaceSheet } from "#/features/workspace-sheets/workspace-sheet-navigation";
import { submitClientForm } from "#/lib/client-form-submit";
import { cn } from "#/lib/utils";

import {
  deriveContactsForSite,
  getJobsAsyncErrorMessage,
  isJobsAsyncFailure,
  useCreateJobMutation,
  useJobsOptions,
  useUpsertJobOptionSite,
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
  readonly priority: JobPriority;
  readonly siteSelection: string;
  readonly title: string;
}

interface JobsCreateFieldErrors {
  readonly contactEmail?: string;
  readonly contactName?: string;
  readonly contactNotes?: string;
  readonly siteSelection?: string;
  readonly title?: string;
}

const decodeContactEmail = Schema.decodeUnknownSync(ContactEmailSchema);
const decodeContactName = Schema.decodeUnknownSync(ContactNameSchema);
const decodeContactNotes = Schema.decodeUnknownSync(ContactNotesSchema);

function createDefaultJobsFormState(
  initialSiteId?: SiteIdType
): JobsCreateFormState {
  return {
    contactEmail: "",
    contactName: "",
    contactNotes: "",
    contactPhone: "",
    contactSelection: NONE_VALUE,
    priority: "none",
    siteSelection: initialSiteId ?? NONE_VALUE,
    title: "",
  };
}

// The create sheet keeps one local draft so validation and inline site/contact creation stay atomic.
// react-doctor-disable-next-line
export function JobsCreateSheet({
  active = true,
  initialSiteId,
  onClose,
}: {
  readonly active?: boolean;
  readonly initialSiteId?: SiteIdType;
  readonly onClose?: () => void;
} = {}) {
  const pushWorkspaceSheet = usePushWorkspaceSheet();
  const options = useJobsOptions();
  const upsertJobOptionSite = useUpsertJobOptionSite();
  const [createResult, createJob] = useCreateJobMutation();
  const [fieldErrors, setFieldErrors] = React.useState<JobsCreateFieldErrors>(
    {}
  );
  const [values, setValues] = React.useState<JobsCreateFormState>(() =>
    createDefaultJobsFormState(initialSiteId)
  );
  const [overlayOpen, setOverlayOpen] = React.useState(true);
  const sheetInstanceId = React.useId();
  const navigateAfterCloseRef = React.useRef(false);
  const resetAfterCloseRef = React.useRef(false);
  const closeNavigationTimeoutRef = React.useRef<ReturnType<
    typeof setTimeout
  > | null>(null);

  const selectedSiteId =
    values.siteSelection === NONE_VALUE ||
    values.siteSelection === INLINE_CREATE_VALUE
      ? undefined
      : resolveSelectedOptionId(options.sites, values.siteSelection);
  const contactGroups = deriveContactsForSite(options.contacts, selectedSiteId);
  const prioritySelectionGroups = buildPrioritySelectionGroups();
  const siteSelectionGroups = buildSiteSelectionGroups(options.sites);
  const contactSelectionGroups = buildContactSelectionGroups(contactGroups);

  useWorkspaceSheetSiteCreated(
    sheetInstanceId,
    React.useCallback(
      (site) => {
        upsertJobOptionSite(site);
        setValues((current) => ({
          ...current,
          siteSelection: site.id,
        }));
        setFieldErrors(clearSiteSelectionFieldError);
      },
      [upsertJobOptionSite]
    )
  );

  React.useEffect(
    () => () => {
      if (closeNavigationTimeoutRef.current) {
        clearTimeout(closeNavigationTimeoutRef.current);
      }
    },
    []
  );

  function finishClosedSheet() {
    if (closeNavigationTimeoutRef.current) {
      clearTimeout(closeNavigationTimeoutRef.current);
      closeNavigationTimeoutRef.current = null;
    }

    if (resetAfterCloseRef.current) {
      setValues(createDefaultJobsFormState());
      resetAfterCloseRef.current = false;
    }

    if (navigateAfterCloseRef.current) {
      navigateAfterCloseRef.current = false;
      onClose?.();
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
      DRAWER_CLOSE_FALLBACK_MS
    );
  }

  async function handleSubmit() {
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

    const payload = buildCreateJobInput(values, selectionIds);
    const exit = await createJob(payload);

    if (Exit.isSuccess(exit)) {
      setFieldErrors({});
      resetAfterCloseRef.current = true;
      closeSheet();
      return;
    }

    const failure = Cause.findErrorOption(exit.cause);

    if (
      Option.isSome(failure) &&
      failure.value._tag === SITE_NOT_FOUND_ERROR_TAG
    ) {
      setFieldErrors((current) => ({
        ...current,
        siteSelection: "That site is no longer available. Pick another one.",
      }));
    }

    if (
      Option.isSome(failure) &&
      failure.value._tag === CONTACT_NOT_FOUND_ERROR_TAG
    ) {
      setFieldErrors((current) => ({
        ...current,
        contactName:
          "That contact is no longer available. Pick another one or create a new contact.",
      }));
    }
  }

  if (!active) {
    return null;
  }

  return (
    <ResponsiveCreateOverlay
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
      <form
        className="flex min-h-0 flex-1 flex-col"
        method="post"
        noValidate
        onSubmit={(event) => submitClientForm(event, handleSubmit)}
      >
        <div className="flex flex-1 flex-col overflow-y-auto px-5 py-2 sm:px-6">
          {isJobsAsyncFailure(createResult) &&
          !isHandledCreateJobError(createResult.error) ? (
            <Alert variant="destructive">
              <HugeiconsIcon icon={Briefcase01Icon} strokeWidth={2} />
              <AlertTitle>We couldn&apos;t create that job.</AlertTitle>
              <AlertDescription>
                {getJobsAsyncErrorMessage(createResult.error)}
              </AlertDescription>
            </Alert>
          ) : null}

          <CreateFormSection title="Job details">
            <FieldGroup className="gap-3">
              <AuthFormField
                label="Title"
                htmlFor="job-title"
                errorText={fieldErrors.title}
              >
                <Input
                  id="job-title"
                  value={values.title}
                  placeholder="e.g. Boiler relay and pipework replacement"
                  aria-invalid={Boolean(fieldErrors.title) || undefined}
                  onChange={(event) =>
                    setValues((current) => ({
                      ...current,
                      title: event.target.value,
                    }))
                  }
                />
              </AuthFormField>

              <AuthFormField label="Priority" htmlFor="job-priority">
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
              </AuthFormField>
            </FieldGroup>
          </CreateFormSection>

          <CreateFormSection title="Location">
            <FieldGroup className="gap-3">
              <AuthFormField
                label="Site"
                htmlFor="job-site"
                errorText={fieldErrors.siteSelection}
              >
                <LinearMetadataSelect
                  id="job-site"
                  label="Site"
                  value={values.siteSelection}
                  placeholder="Select site"
                  emptyText="No sites found."
                  groups={siteSelectionGroups}
                  icon={Location01Icon}
                  errorText={fieldErrors.siteSelection}
                  onValueChange={(nextValue) => {
                    if (nextValue === INLINE_CREATE_VALUE) {
                      setFieldErrors(clearSiteSelectionFieldError);
                      pushWorkspaceSheet({
                        kind: "site.create",
                        targetSheetId: sheetInstanceId,
                      });
                      return;
                    }

                    setValues((current) => ({
                      ...current,
                      siteSelection: nextValue,
                    }));
                    setFieldErrors(clearSiteSelectionFieldError);
                  }}
                />
              </AuthFormField>
            </FieldGroup>
          </CreateFormSection>

          <CreateFormSection title="Contact / customer">
            <FieldGroup className="gap-3">
              <AuthFormField
                label="Contact"
                htmlFor="job-contact"
                errorText={fieldErrors.contactName}
              >
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
              </AuthFormField>

              {values.contactSelection === INLINE_CREATE_VALUE ? (
                <>
                  <AuthFormField
                    label="Contact email"
                    htmlFor="job-contact-email"
                    errorText={fieldErrors.contactEmail}
                  >
                    <Input
                      id="job-contact-email"
                      type="email"
                      value={values.contactEmail}
                      placeholder="name@company.ie"
                      aria-invalid={
                        Boolean(fieldErrors.contactEmail) || undefined
                      }
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
                  >
                    <Input
                      id="job-contact-phone"
                      value={values.contactPhone}
                      placeholder="+353 1 555 0123"
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
                    errorText={fieldErrors.contactNotes}
                  >
                    <Textarea
                      id="job-contact-notes"
                      value={values.contactNotes}
                      aria-invalid={
                        Boolean(fieldErrors.contactNotes) || undefined
                      }
                      onChange={(event) =>
                        setValues((current) => ({
                          ...current,
                          contactNotes: event.target.value,
                        }))
                      }
                    />
                  </AuthFormField>
                </>
              ) : null}
            </FieldGroup>
          </CreateFormSection>
        </div>

        <DrawerFooter className="shrink-0 flex-col-reverse gap-2 border-t px-5 py-3 sm:flex-row sm:justify-end sm:px-6">
          <Button
            type="button"
            variant="outline"
            disabled={createResult.waiting}
            onClick={closeSheet}
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
    <div className="w-full">
      <CommandSelect
        id={id}
        value={value}
        placeholder={placeholder}
        emptyText={emptyText}
        groups={groups}
        ariaLabel={label}
        ariaInvalid={errorText ? true : undefined}
        prefix={<HugeiconsIcon icon={triggerIcon} strokeWidth={2} />}
        searchPlaceholder={searchPlaceholder}
        showGroupHeadings={showGroupHeadings}
        onValueChange={onValueChange}
      />
    </div>
  );
}

function CreateFormSection({
  children,
  title,
}: {
  readonly children: React.ReactNode;
  readonly title: string;
}) {
  return (
    <section className="border-b py-3 first:pt-0 last:border-b-0 last:pb-0">
      <div className="mb-2.5">
        <h3 className="text-sm font-medium text-foreground">{title}</h3>
      </div>
      {children}
    </section>
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
    <div className="w-full">
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
            buttonVariants({ variant: "field" }),
            "w-full font-normal"
          )}
        >
          <span className="flex min-w-0 items-center gap-1.5">
            <HugeiconsIcon
              icon={UserIcon}
              strokeWidth={2}
              data-icon="inline-start"
            />
            <span className="truncate">{triggerLabel}</span>
          </span>
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
  onAnimationEnd,
  onOpenChange,
  open,
}: {
  readonly children: React.ReactNode;
  readonly onAnimationEnd: (open: boolean) => void;
  readonly onOpenChange: (open: boolean) => void;
  readonly open: boolean;
}) {
  return (
    <ResponsiveDrawer
      open={open}
      onOpenChange={onOpenChange}
      onAnimationEnd={onAnimationEnd}
    >
      <DrawerContent className="route-drawer-content route-side-drawer-content flex max-h-[92vh] w-full flex-col overflow-hidden p-2 data-[vaul-drawer-direction=right]:inset-y-0 data-[vaul-drawer-direction=right]:right-0 data-[vaul-drawer-direction=right]:h-full data-[vaul-drawer-direction=right]:max-h-none data-[vaul-drawer-direction=right]:sm:max-w-lg">
        <DrawerHeader className="shrink-0 border-b px-5 py-4 text-left md:px-6">
          <div className="flex min-w-0 items-start justify-between gap-4">
            <div className="min-w-0">
              <DrawerTitle>New job</DrawerTitle>
              <DrawerDescription className="sr-only">
                Add a job title, priority, site, and contact.
              </DrawerDescription>
            </div>
            <DrawerClose asChild>
              <Button
                type="button"
                size="icon-lg"
                variant="ghost"
                aria-label="Close new job"
              >
                <HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} />
              </Button>
            </DrawerClose>
          </div>
        </DrawerHeader>
        {children}
      </DrawerContent>
    </ResponsiveDrawer>
  );
}

function buildSiteSelectionGroups(sites: readonly SiteOption[]) {
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

function validate(values: JobsCreateFormState): JobsCreateFieldErrors {
  const validateInlineContact = values.contactSelection === INLINE_CREATE_VALUE;

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
    title:
      values.title.trim().length === 0
        ? "Give the job a clear title before you create it."
        : undefined,
  };
}

function hasFieldErrors(errors: JobsCreateFieldErrors) {
  return (
    errors.contactEmail !== undefined ||
    errors.contactName !== undefined ||
    errors.contactNotes !== undefined ||
    errors.siteSelection !== undefined ||
    errors.title !== undefined
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
      error._tag === CONTACT_NOT_FOUND_ERROR_TAG)
  );
}

function buildCreateJobInput(
  values: JobsCreateFormState,
  selectionIds: JobsCreateSelectionIds
): CreateJobInput {
  return {
    contact: resolveCreateJobContactInput(values, selectionIds),
    priority: values.priority === "none" ? undefined : values.priority,
    site: resolveCreateJobSiteInput(values, selectionIds),
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
  selectionIds: JobsCreateSelectionIds
): CreateJobInput["site"] {
  if (values.siteSelection === NONE_VALUE) {
    return undefined;
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
    readonly sites: readonly SiteOption[];
  }
): JobsCreateSelectionIds {
  return {
    contactId:
      values.contactSelection === NONE_VALUE ||
      values.contactSelection === INLINE_CREATE_VALUE
        ? undefined
        : resolveSelectedOptionId(options.contacts, values.contactSelection),
    siteId:
      values.siteSelection === NONE_VALUE
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
