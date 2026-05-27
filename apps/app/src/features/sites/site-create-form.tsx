"use client";
import type {
  CreateSiteInput,
  GooglePlaceIdType,
  GooglePlacesSessionTokenType,
  SiteCountry,
  SiteLocationAutocompleteInput,
  SiteLocationInput,
  SiteLocationSuggestion,
  SiteOption,
  UpdateSiteInput,
} from "@ceird/sites-core";
import {
  CheckmarkCircle02Icon,
  Location01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Effect, Exit } from "effect";
import * as React from "react";

import { FieldGroup } from "#/components/ui/field";
import { Input } from "#/components/ui/input";
import { Textarea } from "#/components/ui/textarea";
import { runBrowserAppApiRequest } from "#/features/api/app-api-client";
import { AuthFormField } from "#/features/auth/auth-form-field";
import { cn } from "#/lib/utils";

const DEFAULT_SITE_COUNTRY = "IE" satisfies SiteCountry;
const LOCATION_AUTOCOMPLETE_DEBOUNCE_MS = 250;
const LOCATION_AUTOCOMPLETE_MIN_LENGTH = 3;

export interface SiteCreateLocationSelection {
  readonly displayText: string;
  readonly placeId: GooglePlaceIdType;
  readonly rawInput: string;
  readonly secondaryText?: string;
  readonly sessionToken: GooglePlacesSessionTokenType;
}

export interface SiteCreateDraft {
  readonly accessNotes: string;
  readonly country: SiteCountry;
  readonly locationInput: string;
  readonly locationSelection: SiteCreateLocationSelection | null;
  readonly locationSessionToken: GooglePlacesSessionTokenType;
  readonly name: string;
}

export interface SiteCreateFieldErrors {
  readonly location?: string;
  readonly name?: string;
}

type SiteCreateDraftPatch = Partial<SiteCreateDraft>;

interface SiteCreateFieldSectionProps {
  readonly draft: SiteCreateDraft;
  readonly errors: SiteCreateFieldErrors;
  readonly idPrefix: string;
  readonly onDraftPatch: (patch: SiteCreateDraftPatch) => void;
}

export function createDefaultSiteCreateDraft(): SiteCreateDraft {
  return {
    accessNotes: "",
    country: DEFAULT_SITE_COUNTRY,
    locationInput: "",
    locationSelection: null,
    locationSessionToken: createGooglePlacesSessionToken(),
    name: "",
  };
}

export const defaultSiteCreateDraft: SiteCreateDraft =
  createDefaultSiteCreateDraft();

export function createSiteCreateDraftFromSite(
  site: SiteOption
): SiteCreateDraft {
  const baseDraft = createDefaultSiteCreateDraft();
  const locationInput =
    site.displayLocation ||
    site.formattedAddress ||
    site.rawLocationInput ||
    "";
  const googleLocationSelection =
    site.googlePlaceId === undefined || locationInput.length === 0
      ? null
      : {
          displayText: locationInput,
          placeId: site.googlePlaceId,
          rawInput: site.rawLocationInput ?? locationInput,
          sessionToken: baseDraft.locationSessionToken,
          ...(site.formattedAddress === undefined
            ? {}
            : { secondaryText: site.formattedAddress }),
        };

  return {
    accessNotes: site.accessNotes ?? "",
    country: site.country ?? baseDraft.country,
    locationInput,
    locationSelection: googleLocationSelection,
    locationSessionToken: baseDraft.locationSessionToken,
    name: site.name,
  };
}

export function siteCreateDraftLocationEqualsSite(
  draft: SiteCreateDraft,
  site: SiteOption
) {
  const siteDraft = createSiteCreateDraftFromSite(site);

  return (
    toOptionalTrimmedString(draft.locationInput) ===
      toOptionalTrimmedString(siteDraft.locationInput) &&
    draft.country === siteDraft.country &&
    locationSelectionsEqual(
      draft.locationSelection,
      siteDraft.locationSelection
    )
  );
}

export function validateSiteCreateDraft(
  values: SiteCreateDraft,
  options: {
    readonly nameRequiredMessage?: string;
  } = {}
): SiteCreateFieldErrors {
  return {
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
  values: SiteCreateDraft,
  options: { readonly includeLocation?: boolean } = {}
): CreateSiteInput {
  const accessNotes = toOptionalTrimmedString(values.accessNotes);
  const name = values.name.trim();
  const location = buildLocationInputFromDraft(values, options);

  return {
    name,
    ...(accessNotes === undefined ? {} : { accessNotes }),
    ...(location === undefined || location === null ? {} : { location }),
  };
}

export function buildUpdateSiteInputFromDraft(
  values: SiteCreateDraft,
  options: {
    readonly clearEmptyLocation?: boolean;
    readonly includeLocation?: boolean;
  } = {}
): UpdateSiteInput {
  const accessNotes = toOptionalTrimmedString(values.accessNotes);
  const name = values.name.trim();
  const location = buildLocationInputFromDraft(values, options);

  return {
    name,
    ...(accessNotes === undefined ? {} : { accessNotes }),
    ...(location === undefined ? {} : { location }),
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
          placeholder="Search an address, Eircode, town, or landmark"
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

export function SiteAddressFields({
  className,
  draft,
  errors,
  idPrefix,
  onDraftPatch,
  placeholder,
}: SiteCreateFieldSectionProps & {
  readonly className?: string;
  readonly placeholder?: string;
}) {
  return (
    <FieldGroup className={className}>
      <SiteLocationSearchField
        draft={draft}
        errors={errors}
        idPrefix={idPrefix}
        placeholder={placeholder}
        onDraftPatch={onDraftPatch}
      />
    </FieldGroup>
  );
}

function SiteLocationSearchField({
  draft,
  errors,
  idPrefix,
  onDraftPatch,
  placeholder,
}: SiteCreateFieldSectionProps & {
  readonly placeholder?: string;
}) {
  const trimmedInput = draft.locationInput.trim();
  const selected =
    draft.locationSelection !== null &&
    draft.locationSelection.displayText.trim() === trimmedInput;
  const { searchFailed, suggestions, waiting } = useSiteLocationAutocomplete({
    country: draft.country,
    enabled: !selected,
    input: draft.locationInput,
    sessionToken: draft.locationSessionToken,
  });
  const listboxId = `${idPrefix}-location-suggestions`;
  const [dismissedSuggestionInput, setDismissedSuggestionInput] =
    React.useState<string | null>(null);
  const visibleSuggestions =
    dismissedSuggestionInput === trimmedInput ? [] : suggestions;
  const [activeSuggestionIndex, setActiveSuggestionIndex] = React.useState(-1);
  const activeSuggestion =
    activeSuggestionIndex >= 0
      ? visibleSuggestions[activeSuggestionIndex]
      : undefined;

  React.useEffect(() => {
    setActiveSuggestionIndex(visibleSuggestions.length > 0 ? 0 : -1);
  }, [visibleSuggestions.length, trimmedInput]);

  function selectSuggestion(suggestion: SiteLocationSuggestion) {
    onDraftPatch({
      locationInput: suggestion.displayText,
      locationSelection: {
        displayText: suggestion.displayText,
        placeId: suggestion.placeId,
        rawInput: draft.locationInput,
        sessionToken: draft.locationSessionToken,
        ...(suggestion.secondaryText === undefined
          ? {}
          : { secondaryText: suggestion.secondaryText }),
      },
    });
    setActiveSuggestionIndex(-1);
    setDismissedSuggestionInput(null);
  }

  return (
    <AuthFormField
      label="Location"
      htmlFor={`${idPrefix}-location`}
      errorText={errors.location}
    >
      <div className="flex flex-col gap-2">
        <div className="relative">
          <Input
            id={`${idPrefix}-location`}
            value={draft.locationInput}
            role="combobox"
            aria-activedescendant={
              activeSuggestion === undefined
                ? undefined
                : `${listboxId}-${activeSuggestionIndex}`
            }
            aria-autocomplete="list"
            aria-controls={listboxId}
            aria-expanded={visibleSuggestions.length > 0}
            aria-invalid={Boolean(errors.location) || undefined}
            autoComplete="street-address"
            placeholder={placeholder}
            onChange={(event) => {
              setDismissedSuggestionInput(null);
              onDraftPatch({
                locationInput: event.target.value,
                locationSelection: null,
              });
            }}
            onKeyDown={(event) => {
              if (visibleSuggestions.length === 0) {
                return;
              }

              if (event.key === "ArrowDown") {
                event.preventDefault();
                setActiveSuggestionIndex((current) =>
                  current >= visibleSuggestions.length - 1 ? 0 : current + 1
                );
              }

              if (event.key === "ArrowUp") {
                event.preventDefault();
                setActiveSuggestionIndex((current) =>
                  current <= 0 ? visibleSuggestions.length - 1 : current - 1
                );
              }

              if (event.key === "Enter" && activeSuggestion !== undefined) {
                event.preventDefault();
                selectSuggestion(activeSuggestion);
              }

              if (event.key === "Escape") {
                event.preventDefault();
                setDismissedSuggestionInput(trimmedInput);
                setActiveSuggestionIndex(-1);
              }
            }}
          />
          {visibleSuggestions.length > 0 ? (
            <div
              id={listboxId}
              role="listbox"
              className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
            >
              {visibleSuggestions.map((suggestion, index) => (
                <button
                  key={suggestion.placeId}
                  id={`${listboxId}-${index}`}
                  type="button"
                  role="option"
                  aria-selected={index === activeSuggestionIndex}
                  className={cn(
                    "flex w-full items-start gap-2 rounded-sm px-2.5 py-2 text-left text-sm outline-hidden transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:text-accent-foreground",
                    index === activeSuggestionIndex &&
                      "bg-accent text-accent-foreground"
                  )}
                  onMouseEnter={() => setActiveSuggestionIndex(index)}
                  onClick={() => selectSuggestion(suggestion)}
                >
                  <HugeiconsIcon
                    icon={Location01Icon}
                    strokeWidth={2}
                    className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                  />
                  <span className="min-w-0">
                    <span className="block truncate font-medium">
                      {suggestion.displayText}
                    </span>
                    {suggestion.secondaryText ? (
                      <span className="block truncate text-xs text-muted-foreground">
                        {suggestion.secondaryText}
                      </span>
                    ) : null}
                  </span>
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <SiteLocationStatus
          inputLength={trimmedInput.length}
          searchFailed={searchFailed}
          selected={selected}
          waiting={waiting}
        />
      </div>
    </AuthFormField>
  );
}

function SiteLocationStatus({
  inputLength,
  searchFailed,
  selected,
  waiting,
}: {
  readonly inputLength: number;
  readonly searchFailed: boolean;
  readonly selected: boolean;
  readonly waiting: boolean;
}) {
  if (selected) {
    return (
      <p
        role="status"
        aria-live="polite"
        className="flex items-center gap-1.5 text-xs font-medium text-emerald-700"
      >
        <HugeiconsIcon
          icon={CheckmarkCircle02Icon}
          strokeWidth={2}
          className="size-3.5"
        />
        Google location
      </p>
    );
  }

  if (waiting) {
    return (
      <p
        role="status"
        aria-live="polite"
        className="text-xs text-muted-foreground"
      >
        Searching…
      </p>
    );
  }

  if (searchFailed && inputLength >= LOCATION_AUTOCOMPLETE_MIN_LENGTH) {
    return (
      <p role="status" aria-live="polite" className="text-xs text-amber-700">
        Location lookup unavailable. Save as unverified location.
      </p>
    );
  }

  return (
    <p
      role="status"
      aria-live="polite"
      className={cn(
        "text-xs",
        inputLength === 0
          ? "text-muted-foreground"
          : "font-medium text-amber-700"
      )}
    >
      {inputLength === 0 ? "No location" : "Unverified location"}
    </p>
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

function useSiteLocationAutocomplete(
  input: SiteLocationAutocompleteInput & {
    readonly enabled: boolean;
  }
) {
  const trimmedInput = input.input.trim();
  const [state, dispatch] = React.useReducer(
    siteLocationAutocompleteReducer,
    INITIAL_SITE_LOCATION_AUTOCOMPLETE_STATE
  );

  React.useEffect(() => {
    if (
      !input.enabled ||
      trimmedInput.length < LOCATION_AUTOCOMPLETE_MIN_LENGTH
    ) {
      dispatch({ type: "reset" });
      return;
    }

    let active = true;
    dispatch({ type: "start" });

    const timeout = window.setTimeout(() => {
      void runAutocompleteRequest();
    }, LOCATION_AUTOCOMPLETE_DEBOUNCE_MS);

    async function runAutocompleteRequest() {
      if (!active) {
        return;
      }

      const exit = await Effect.runPromiseExit(
        autocompleteBrowserSiteLocation({
          country: input.country,
          input: trimmedInput,
          sessionToken: input.sessionToken,
        })
      );

      if (Exit.isSuccess(exit)) {
        if (active) {
          dispatch({ suggestions: exit.value.suggestions, type: "success" });
        }
        return;
      }

      if (active) {
        dispatch({ type: "failure" });
      }
    }

    return () => {
      active = false;
      window.clearTimeout(timeout);
    };
  }, [input.country, input.enabled, input.sessionToken, trimmedInput]);

  return state;
}

interface SiteLocationAutocompleteState {
  readonly searchFailed: boolean;
  readonly suggestions: readonly SiteLocationSuggestion[];
  readonly waiting: boolean;
}

type SiteLocationAutocompleteAction =
  | { readonly type: "failure" }
  | { readonly type: "reset" }
  | {
      readonly suggestions: readonly SiteLocationSuggestion[];
      readonly type: "success";
    }
  | { readonly type: "start" };

const INITIAL_SITE_LOCATION_AUTOCOMPLETE_STATE: SiteLocationAutocompleteState =
  {
    searchFailed: false,
    suggestions: [],
    waiting: false,
  };

function siteLocationAutocompleteReducer(
  state: SiteLocationAutocompleteState,
  action: SiteLocationAutocompleteAction
): SiteLocationAutocompleteState {
  switch (action.type) {
    case "failure": {
      return {
        searchFailed: true,
        suggestions: [],
        waiting: false,
      };
    }
    case "reset": {
      return INITIAL_SITE_LOCATION_AUTOCOMPLETE_STATE;
    }
    case "start": {
      return {
        ...state,
        searchFailed: false,
        waiting: true,
      };
    }
    case "success": {
      return {
        searchFailed: false,
        suggestions: action.suggestions,
        waiting: false,
      };
    }
    default: {
      const exhaustiveAction: never = action;

      return exhaustiveAction;
    }
  }
}

function autocompleteBrowserSiteLocation(input: SiteLocationAutocompleteInput) {
  return runBrowserAppApiRequest(
    "SitesBrowser.autocompleteSiteLocation",
    (client) =>
      client.sites.autocompleteSiteLocation({
        payload: input,
      })
  );
}

function buildLocationInputFromDraft(
  values: SiteCreateDraft,
  options: {
    readonly clearEmptyLocation?: boolean;
    readonly includeLocation?: boolean;
  }
): SiteLocationInput | null | undefined {
  if (options.includeLocation === false) {
    return undefined;
  }

  const rawInput = toOptionalTrimmedString(values.locationInput);

  if (rawInput === undefined) {
    return options.clearEmptyLocation === true ? null : undefined;
  }

  const selection = values.locationSelection;

  if (selection !== null && selection.displayText.trim() === rawInput) {
    const selectedRawInput =
      toOptionalTrimmedString(selection.rawInput) ?? rawInput;

    return {
      displayText: selection.displayText,
      kind: "google_place",
      placeId: selection.placeId,
      rawInput: selectedRawInput,
      sessionToken: selection.sessionToken,
      ...(selection.secondaryText === undefined
        ? {}
        : { secondaryText: selection.secondaryText }),
    };
  }

  return {
    country: values.country,
    kind: "manual",
    rawInput,
  };
}

function createGooglePlacesSessionToken(): GooglePlacesSessionTokenType {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID() as GooglePlacesSessionTokenType;
  }

  return "00000000-0000-4000-8000-000000000000" as GooglePlacesSessionTokenType;
}

function locationSelectionsEqual(
  left: SiteCreateLocationSelection | null,
  right: SiteCreateLocationSelection | null
) {
  if (left === null || right === null) {
    return left === right;
  }

  return (
    left.displayText === right.displayText &&
    left.placeId === right.placeId &&
    left.rawInput === right.rawInput &&
    left.secondaryText === right.secondaryText
  );
}
