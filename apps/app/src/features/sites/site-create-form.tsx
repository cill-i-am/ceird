"use client";
import type {
  CreateSiteInput,
  ServiceAreaOption,
  SiteCountry,
} from "@ceird/sites-core";

import {
  CommandSelect,
  ResponsiveCommandSelect,
} from "#/components/ui/command-select";
import type {
  CommandSelectGroup,
  CommandSelectProps,
} from "#/components/ui/command-select";
import { FieldGroup } from "#/components/ui/field";
import { Input } from "#/components/ui/input";
import { Textarea } from "#/components/ui/textarea";
import { AuthFormField } from "#/features/auth/auth-form-field";

export const SITE_CREATE_NONE_VALUE = "__none__";
const DEFAULT_SITE_COUNTRY = "IE" satisfies SiteCountry;

export interface SiteCreateDraft {
  readonly accessNotes: string;
  readonly addressLine1: string;
  readonly addressLine2: string;
  readonly county: string;
  readonly country: typeof DEFAULT_SITE_COUNTRY;
  readonly eircode: string;
  readonly name: string;
  readonly serviceAreaSelection: string;
  readonly town: string;
}

export interface SiteCreateFieldErrors {
  readonly addressLine1?: string;
  readonly county?: string;
  readonly eircode?: string;
  readonly name?: string;
  readonly serviceAreaSelection?: string;
}

type SiteCreateDraftPatch = Partial<SiteCreateDraft>;

interface SiteCreateFieldSectionProps {
  readonly draft: SiteCreateDraft;
  readonly errors: SiteCreateFieldErrors;
  readonly idPrefix: string;
  readonly onDraftPatch: (patch: SiteCreateDraftPatch) => void;
}

export const defaultSiteCreateDraft: SiteCreateDraft = {
  accessNotes: "",
  addressLine1: "",
  addressLine2: "",
  county: "",
  country: DEFAULT_SITE_COUNTRY,
  eircode: "",
  name: "",
  serviceAreaSelection: SITE_CREATE_NONE_VALUE,
  town: "",
};

export function buildSiteServiceAreaSelectionGroups(
  serviceAreas: readonly { readonly id: string; readonly name: string }[]
) {
  return [
    {
      label: "Service area",
      options: [
        { label: "No service area yet", value: SITE_CREATE_NONE_VALUE },
        ...serviceAreas.map((serviceArea) => ({
          label: serviceArea.name,
          value: serviceArea.id,
        })),
      ],
    },
  ] satisfies readonly CommandSelectGroup[];
}

export function validateSiteCreateDraft(
  values: SiteCreateDraft,
  serviceAreas: readonly ServiceAreaOption[],
  options: {
    readonly nameRequiredMessage?: string;
  } = {}
): SiteCreateFieldErrors {
  return {
    addressLine1:
      values.addressLine1.trim().length === 0
        ? "Add address line 1."
        : undefined,
    county: values.county.trim().length === 0 ? "Add county." : undefined,
    eircode: values.eircode.trim().length === 0 ? "Add Eircode." : undefined,
    name:
      values.name.trim().length === 0
        ? (options.nameRequiredMessage ?? "Add a site name before creating it.")
        : undefined,
    serviceAreaSelection:
      values.serviceAreaSelection !== SITE_CREATE_NONE_VALUE &&
      findSelectedServiceArea(values, serviceAreas) === undefined
        ? "Pick an available service area, or choose no service area."
        : undefined,
  };
}

export function hasSiteCreateFieldErrors(errors: SiteCreateFieldErrors) {
  return Object.values(errors).some((value) => value !== undefined);
}

export function buildCreateSiteInputFromDraft(
  values: SiteCreateDraft,
  serviceAreas: readonly ServiceAreaOption[]
): CreateSiteInput {
  const selectedServiceArea = findSelectedServiceArea(values, serviceAreas);

  return {
    accessNotes: toOptionalTrimmedString(values.accessNotes),
    addressLine1: values.addressLine1.trim(),
    addressLine2: toOptionalTrimmedString(values.addressLine2),
    county: values.county.trim(),
    country: values.country,
    eircode: values.eircode.trim(),
    name: values.name.trim(),
    serviceAreaId: selectedServiceArea?.id,
    town: toOptionalTrimmedString(values.town),
  };
}

export function toOptionalTrimmedString(value: string) {
  const trimmed = value.trim();

  return trimmed.length === 0 ? undefined : trimmed;
}

interface SiteCreateFieldsProps {
  readonly draft: SiteCreateDraft;
  readonly errors: SiteCreateFieldErrors;
  readonly idPrefix: string;
  readonly onDraftChange: (draft: SiteCreateDraft) => void;
  readonly onServiceAreaSelectionChange?: (nextValue: string) => void;
  readonly serviceAreaGroups: readonly CommandSelectGroup[];
}

export function SiteCreateFields({
  draft,
  errors,
  idPrefix,
  onDraftChange,
  onServiceAreaSelectionChange,
  serviceAreaGroups,
}: SiteCreateFieldsProps) {
  const updateDraft = (patch: Partial<SiteCreateDraft>) => {
    onDraftChange({
      ...draft,
      ...patch,
    });
  };

  return (
    <>
      <FieldGroup>
        <SiteNameField
          draft={draft}
          errors={errors}
          idPrefix={idPrefix}
          onDraftPatch={updateDraft}
        />
        <SiteServiceAreaField
          draft={draft}
          errors={errors}
          idPrefix={idPrefix}
          serviceAreaGroups={serviceAreaGroups}
          onDraftPatch={updateDraft}
          onServiceAreaSelectionChange={onServiceAreaSelectionChange}
        />
      </FieldGroup>

      <SiteAddressFields
        draft={draft}
        errors={errors}
        idPrefix={idPrefix}
        onDraftPatch={updateDraft}
      />

      <FieldGroup>
        <SiteAccessNotesField
          draft={draft}
          idPrefix={idPrefix}
          onDraftPatch={updateDraft}
        />
      </FieldGroup>
    </>
  );
}

export function SiteNameField({
  draft,
  errors,
  idPrefix,
  onDraftPatch,
}: SiteCreateFieldSectionProps) {
  return (
    <AuthFormField
      label="Site name"
      htmlFor={`${idPrefix}-name`}
      errorText={errors.name}
    >
      <Input
        id={`${idPrefix}-name`}
        value={draft.name}
        aria-invalid={Boolean(errors.name) || undefined}
        onChange={(event) => onDraftPatch({ name: event.target.value })}
      />
    </AuthFormField>
  );
}

interface SiteServiceAreaFieldProps extends SiteCreateFieldSectionProps {
  readonly onServiceAreaSelectionChange?: (nextValue: string) => void;
  readonly serviceAreaGroups: readonly CommandSelectGroup[];
}

export function SiteServiceAreaField({
  draft,
  errors,
  idPrefix,
  onDraftPatch,
  onServiceAreaSelectionChange,
  serviceAreaGroups,
}: SiteServiceAreaFieldProps) {
  const selectProps = buildSiteServiceAreaSelectProps({
    draft,
    errors,
    idPrefix,
    onDraftPatch,
    onServiceAreaSelectionChange,
    serviceAreaGroups,
  });

  return (
    <SiteServiceAreaFieldFrame
      idPrefix={idPrefix}
      errorText={errors.serviceAreaSelection}
    >
      <CommandSelect {...selectProps} />
    </SiteServiceAreaFieldFrame>
  );
}

export function SiteNestedServiceAreaField({
  draft,
  errors,
  idPrefix,
  onDraftPatch,
  onServiceAreaSelectionChange,
  serviceAreaGroups,
}: SiteServiceAreaFieldProps) {
  const selectProps = buildSiteServiceAreaSelectProps({
    draft,
    errors,
    idPrefix,
    onDraftPatch,
    onServiceAreaSelectionChange,
    serviceAreaGroups,
  });

  return (
    <SiteServiceAreaFieldFrame
      idPrefix={idPrefix}
      errorText={errors.serviceAreaSelection}
    >
      <ResponsiveCommandSelect
        {...selectProps}
        drawerTitle="Choose service area"
        nestedDrawer
      />
    </SiteServiceAreaFieldFrame>
  );
}

function SiteServiceAreaFieldFrame({
  children,
  errorText,
  idPrefix,
}: {
  readonly children: React.ReactNode;
  readonly errorText: string | undefined;
  readonly idPrefix: string;
}) {
  return (
    <AuthFormField
      label="Service area"
      htmlFor={`${idPrefix}-service-area`}
      errorText={errorText}
    >
      {children}
    </AuthFormField>
  );
}

function buildSiteServiceAreaSelectProps({
  draft,
  errors,
  idPrefix,
  onDraftPatch,
  onServiceAreaSelectionChange,
  serviceAreaGroups,
}: SiteServiceAreaFieldProps): CommandSelectProps {
  return {
    ariaInvalid: errors.serviceAreaSelection ? true : undefined,
    emptyText: "No service areas found.",
    groups: serviceAreaGroups,
    id: `${idPrefix}-service-area`,
    onValueChange:
      onServiceAreaSelectionChange ??
      ((nextValue) => onDraftPatch({ serviceAreaSelection: nextValue })),
    placeholder: "Pick service area",
    value: draft.serviceAreaSelection,
  };
}

export function SiteAddressFields({
  draft,
  errors,
  idPrefix,
  onDraftPatch,
}: SiteCreateFieldSectionProps) {
  return (
    <FieldGroup>
      <AuthFormField
        label="Address line 1"
        htmlFor={`${idPrefix}-address-line-1`}
        errorText={errors.addressLine1}
      >
        <Input
          id={`${idPrefix}-address-line-1`}
          value={draft.addressLine1}
          aria-invalid={Boolean(errors.addressLine1) || undefined}
          onChange={(event) =>
            onDraftPatch({ addressLine1: event.target.value })
          }
        />
      </AuthFormField>

      <AuthFormField
        label="Address line 2"
        htmlFor={`${idPrefix}-address-line-2`}
      >
        <Input
          id={`${idPrefix}-address-line-2`}
          value={draft.addressLine2}
          onChange={(event) =>
            onDraftPatch({ addressLine2: event.target.value })
          }
        />
      </AuthFormField>

      <div className="grid gap-4 sm:grid-cols-2">
        <AuthFormField label="Town" htmlFor={`${idPrefix}-town`}>
          <Input
            id={`${idPrefix}-town`}
            value={draft.town}
            onChange={(event) => onDraftPatch({ town: event.target.value })}
          />
        </AuthFormField>

        <AuthFormField
          label="County"
          htmlFor={`${idPrefix}-county`}
          errorText={errors.county}
        >
          <Input
            id={`${idPrefix}-county`}
            value={draft.county}
            aria-invalid={Boolean(errors.county) || undefined}
            onChange={(event) => onDraftPatch({ county: event.target.value })}
          />
        </AuthFormField>
      </div>

      <AuthFormField
        label="Eircode"
        htmlFor={`${idPrefix}-eircode`}
        errorText={errors.eircode}
      >
        <Input
          id={`${idPrefix}-eircode`}
          value={draft.eircode}
          aria-invalid={Boolean(errors.eircode) || undefined}
          onChange={(event) => onDraftPatch({ eircode: event.target.value })}
        />
      </AuthFormField>
    </FieldGroup>
  );
}

export function SiteAccessNotesField({
  draft,
  idPrefix,
  label = "Access notes",
  onDraftPatch,
  rows = 3,
}: Omit<SiteCreateFieldSectionProps, "errors"> & {
  readonly label?: string;
  readonly rows?: number;
}) {
  return (
    <AuthFormField label={label} htmlFor={`${idPrefix}-access-notes`}>
      <Textarea
        id={`${idPrefix}-access-notes`}
        rows={rows}
        value={draft.accessNotes}
        onChange={(event) => onDraftPatch({ accessNotes: event.target.value })}
      />
    </AuthFormField>
  );
}

function findSelectedServiceArea(
  values: SiteCreateDraft,
  serviceAreas: readonly ServiceAreaOption[]
) {
  if (values.serviceAreaSelection === SITE_CREATE_NONE_VALUE) {
    return;
  }

  return serviceAreas.find(
    (serviceArea) => serviceArea.id === values.serviceAreaSelection
  );
}
