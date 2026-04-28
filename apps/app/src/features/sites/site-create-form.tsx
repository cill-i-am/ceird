"use client";

import type {
  CreateSiteInput,
  ServiceAreaOption,
  SiteCountry,
} from "@task-tracker/jobs-core";

import { CommandSelect } from "#/components/ui/command-select";
import type { CommandSelectGroup } from "#/components/ui/command-select";
import { FieldGroup } from "#/components/ui/field";
import { Input } from "#/components/ui/input";
import { Textarea } from "#/components/ui/textarea";
import { AuthFormField } from "#/features/auth/auth-form-field";

export const SITE_CREATE_NONE_VALUE = "__none__";
export const DEFAULT_SITE_COUNTRY = "IE" satisfies SiteCountry;

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
        <AuthFormField
          label="Site name"
          htmlFor={`${idPrefix}-name`}
          invalid={Boolean(errors.name)}
          errorText={errors.name}
        >
          <Input
            id={`${idPrefix}-name`}
            value={draft.name}
            aria-invalid={Boolean(errors.name) || undefined}
            onChange={(event) => updateDraft({ name: event.target.value })}
          />
        </AuthFormField>

        <AuthFormField
          label="Service area"
          htmlFor={`${idPrefix}-service-area`}
          invalid={Boolean(errors.serviceAreaSelection)}
          errorText={errors.serviceAreaSelection}
        >
          <CommandSelect
            id={`${idPrefix}-service-area`}
            value={draft.serviceAreaSelection}
            placeholder="Pick service area"
            emptyText="No service areas found."
            groups={serviceAreaGroups}
            ariaInvalid={errors.serviceAreaSelection ? true : undefined}
            onValueChange={
              onServiceAreaSelectionChange ??
              ((nextValue) => updateDraft({ serviceAreaSelection: nextValue }))
            }
          />
        </AuthFormField>
      </FieldGroup>

      <FieldGroup>
        <AuthFormField
          label="Address line 1"
          htmlFor={`${idPrefix}-address-line-1`}
          invalid={Boolean(errors.addressLine1)}
          errorText={errors.addressLine1}
        >
          <Input
            id={`${idPrefix}-address-line-1`}
            value={draft.addressLine1}
            aria-invalid={Boolean(errors.addressLine1) || undefined}
            onChange={(event) =>
              updateDraft({ addressLine1: event.target.value })
            }
          />
        </AuthFormField>

        <AuthFormField
          label="Address line 2"
          htmlFor={`${idPrefix}-address-line-2`}
          invalid={false}
        >
          <Input
            id={`${idPrefix}-address-line-2`}
            value={draft.addressLine2}
            onChange={(event) =>
              updateDraft({ addressLine2: event.target.value })
            }
          />
        </AuthFormField>

        <div className="grid gap-4 sm:grid-cols-2">
          <AuthFormField
            label="Town"
            htmlFor={`${idPrefix}-town`}
            invalid={false}
          >
            <Input
              id={`${idPrefix}-town`}
              value={draft.town}
              onChange={(event) => updateDraft({ town: event.target.value })}
            />
          </AuthFormField>

          <AuthFormField
            label="County"
            htmlFor={`${idPrefix}-county`}
            invalid={Boolean(errors.county)}
            errorText={errors.county}
          >
            <Input
              id={`${idPrefix}-county`}
              value={draft.county}
              aria-invalid={Boolean(errors.county) || undefined}
              onChange={(event) => updateDraft({ county: event.target.value })}
            />
          </AuthFormField>
        </div>

        <AuthFormField
          label="Eircode"
          htmlFor={`${idPrefix}-eircode`}
          invalid={Boolean(errors.eircode)}
          errorText={errors.eircode}
        >
          <Input
            id={`${idPrefix}-eircode`}
            value={draft.eircode}
            aria-invalid={Boolean(errors.eircode) || undefined}
            onChange={(event) => updateDraft({ eircode: event.target.value })}
          />
        </AuthFormField>

        <AuthFormField
          label="Access notes"
          htmlFor={`${idPrefix}-access-notes`}
          invalid={false}
        >
          <Textarea
            id={`${idPrefix}-access-notes`}
            rows={3}
            value={draft.accessNotes}
            onChange={(event) =>
              updateDraft({ accessNotes: event.target.value })
            }
          />
        </AuthFormField>
      </FieldGroup>
    </>
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
