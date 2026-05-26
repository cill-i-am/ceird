"use client";
import type { CreateSiteInput, SiteCountry } from "@ceird/sites-core";

import { FieldGroup } from "#/components/ui/field";
import { Input } from "#/components/ui/input";
import { Textarea } from "#/components/ui/textarea";
import { AuthFormField } from "#/features/auth/auth-form-field";

const DEFAULT_SITE_COUNTRY = "IE" satisfies SiteCountry;

export interface SiteCreateDraft {
  readonly accessNotes: string;
  readonly addressLine1: string;
  readonly addressLine2: string;
  readonly county: string;
  readonly country: SiteCountry;
  readonly eircode: string;
  readonly name: string;
  readonly town: string;
}

export interface SiteCreateFieldErrors {
  readonly addressLine1?: string;
  readonly county?: string;
  readonly eircode?: string;
  readonly name?: string;
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
  town: "",
};

export function validateSiteCreateDraft(
  values: SiteCreateDraft,
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
    eircode:
      values.country === "IE" && values.eircode.trim().length === 0
        ? "Add Eircode."
        : undefined,
    name:
      values.name.trim().length === 0
        ? (options.nameRequiredMessage ?? "Add a site name before creating it.")
        : undefined,
  };
}

export function hasSiteCreateFieldErrors(errors: SiteCreateFieldErrors) {
  return Object.values(errors).some((value) => value !== undefined);
}

export function buildCreateSiteInputFromDraft(
  values: SiteCreateDraft
): CreateSiteInput {
  const accessNotes = toOptionalTrimmedString(values.accessNotes);
  const addressLine2 = toOptionalTrimmedString(values.addressLine2);
  const eircode = toOptionalTrimmedString(values.eircode);
  const town = toOptionalTrimmedString(values.town);

  return {
    addressLine1: values.addressLine1.trim(),
    county: values.county.trim(),
    country: values.country,
    name: values.name.trim(),
    ...(accessNotes === undefined ? {} : { accessNotes }),
    ...(addressLine2 === undefined ? {} : { addressLine2 }),
    ...(eircode === undefined ? {} : { eircode }),
    ...(town === undefined ? {} : { town }),
  };
}

export function toOptionalTrimmedString(value: string) {
  const trimmed = value.trim();

  return trimmed.length === 0 ? undefined : trimmed;
}

interface SiteCreateDrawerFieldsProps {
  readonly draft: SiteCreateDraft;
  readonly errors: SiteCreateFieldErrors;
  readonly idPrefix: string;
  readonly onDraftChange: (draft: SiteCreateDraft) => void;
}

export function SiteCreateDrawerFields({
  draft,
  errors,
  idPrefix,
  onDraftChange,
}: SiteCreateDrawerFieldsProps) {
  const updateDraft = (patch: Partial<SiteCreateDraft>) => {
    onDraftChange({
      ...draft,
      ...patch,
    });
  };

  return (
    <div className="flex flex-col">
      <SiteCreateSection title="Basics">
        <FieldGroup className="gap-3">
          <SiteNameField
            draft={draft}
            errors={errors}
            idPrefix={idPrefix}
            placeholder="e.g. Riverside Apartments"
            onDraftPatch={updateDraft}
          />
        </FieldGroup>
      </SiteCreateSection>

      <SiteCreateSection title="Location">
        <SiteAddressFields
          className="gap-3"
          draft={draft}
          errors={errors}
          idPrefix={idPrefix}
          placeholders={{
            addressLine1: "e.g. 42 North Road",
            addressLine2: "Building, floor, unit",
            county: "Dublin",
            eircode: "D01 F5P2",
            town: "Dublin",
          }}
          onDraftPatch={updateDraft}
        />
      </SiteCreateSection>

      <SiteCreateSection title="Access">
        <FieldGroup className="gap-3">
          <SiteAccessNotesField
            draft={draft}
            idPrefix={idPrefix}
            label="Notes"
            placeholder="e.g. Gate code, arrival notes, safety context."
            rows={3}
            onDraftPatch={updateDraft}
          />
        </FieldGroup>
      </SiteCreateSection>
    </div>
  );
}

function SiteCreateSection({
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

function SiteNameField({
  draft,
  errors,
  idPrefix,
  onDraftPatch,
  placeholder,
}: SiteCreateFieldSectionProps & {
  readonly placeholder?: string;
}) {
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
        placeholder={placeholder}
        onChange={(event) => onDraftPatch({ name: event.target.value })}
      />
    </AuthFormField>
  );
}

interface SiteAddressFieldPlaceholders {
  readonly addressLine1?: string;
  readonly addressLine2?: string;
  readonly county?: string;
  readonly eircode?: string;
  readonly town?: string;
}

export function SiteAddressFields({
  className,
  draft,
  errors,
  idPrefix,
  onDraftPatch,
  placeholders,
}: SiteCreateFieldSectionProps & {
  readonly className?: string;
  readonly placeholders?: SiteAddressFieldPlaceholders;
}) {
  return (
    <FieldGroup className={className}>
      <AuthFormField
        label="Address line 1"
        htmlFor={`${idPrefix}-address-line-1`}
        errorText={errors.addressLine1}
      >
        <Input
          id={`${idPrefix}-address-line-1`}
          value={draft.addressLine1}
          aria-invalid={Boolean(errors.addressLine1) || undefined}
          placeholder={placeholders?.addressLine1}
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
          placeholder={placeholders?.addressLine2}
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
            placeholder={placeholders?.town}
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
            placeholder={placeholders?.county}
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
          placeholder={placeholders?.eircode}
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
  placeholder,
  rows = 3,
}: Omit<SiteCreateFieldSectionProps, "errors"> & {
  readonly label?: string;
  readonly placeholder?: string;
  readonly rows?: number;
}) {
  return (
    <AuthFormField label={label} htmlFor={`${idPrefix}-access-notes`}>
      <Textarea
        id={`${idPrefix}-access-notes`}
        rows={rows}
        value={draft.accessNotes}
        placeholder={placeholder}
        onChange={(event) => onDraftPatch({ accessNotes: event.target.value })}
      />
    </AuthFormField>
  );
}
