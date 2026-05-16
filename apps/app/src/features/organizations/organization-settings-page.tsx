import { normalizeLabelName } from "@ceird/labels-core";
import type { Label, LabelIdType } from "@ceird/labels-core";
import { RegistryProvider } from "@effect-atom/atom-react";
import { useForm } from "@tanstack/react-form";
import { useRouter } from "@tanstack/react-router";
import { Effect, Schema } from "effect";
import { Archive, Check, MoreHorizontal, Pencil, Plus, X } from "lucide-react";
import * as React from "react";

import { AppPageHeader } from "#/components/app-page-header";
import { AppUtilityPanel } from "#/components/app-utility-panel";
import { Button } from "#/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "#/components/ui/dropdown-menu";
import { FieldError, FieldGroup } from "#/components/ui/field";
import { Input } from "#/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "#/components/ui/tabs";
import {
  getErrorText,
  getFormErrorText,
} from "#/features/auth/auth-form-errors";
import { AuthFormField } from "#/features/auth/auth-form-field";
import { validateLabelName } from "#/features/labels/label-name-validation";
import {
  archiveBrowserLabel,
  createBrowserLabel,
  getOrganizationLabelsKey,
  removeOrganizationLabel,
  sortOrganizationLabels,
  updateBrowserLabel,
  upsertOrganizationLabel,
} from "#/features/labels/labels-state";
import { useIsHydrated } from "#/hooks/use-is-hydrated";
import { useAppHotkey } from "#/hotkeys/use-app-hotkey";
import { authClient } from "#/lib/auth-client";
import { submitClientForm } from "#/lib/client-form-submit";
import { beginMutationFeedback } from "#/lib/mutation-feedback";
import { cn } from "#/lib/utils";

import type { OrganizationSummary } from "./organization-access";
import { OrganizationRateCardSection } from "./organization-rate-card-section";
import {
  decodeUpdateOrganizationInput,
  organizationSettingsSchema,
} from "./organization-schemas";
import { OrganizationServiceAreasSection } from "./organization-service-areas-section";

const UPDATE_ORGANIZATION_FAILURE_MESSAGE =
  "We couldn't update the organization. Please try again.";
const SAVE_LABEL_FAILURE_MESSAGE =
  "We couldn't save the label. Please try again.";
const ARCHIVE_LABEL_FAILURE_MESSAGE =
  "We couldn't archive the label. Please try again.";
const EMPTY_LABEL_NAME_MESSAGE = "Type a label name before creating it.";
const DUPLICATE_LABEL_NAME_MESSAGE = "A label with that name already exists.";
const INVALID_LABEL_NAME_MESSAGE =
  "Keep label names between 1 and 48 characters.";
const EMPTY_ORGANIZATION_LABELS: readonly Label[] = [];

// Organization settings owns the general form plus label, service area, and rate-card panels.
// react-doctor-disable-next-line
export function OrganizationSettingsPage({
  organizationLabels = EMPTY_ORGANIZATION_LABELS,
  organization,
}: {
  readonly organizationLabels?: readonly Label[];
  readonly organization: OrganizationSummary;
  // Label editing state and the organization form are intentionally independent.
  // react-doctor-disable-next-line
}) {
  const router = useRouter();
  const isHydrated = useIsHydrated();
  const [successMessage, setSuccessMessage] = React.useState<string | null>(
    null
  );
  const savedOrganizationNameRef = React.useRef(organization.name);
  const [labels, setLabels] = React.useState(() =>
    sortOrganizationLabels(organizationLabels)
  );
  const [newLabelName, setNewLabelName] = React.useState("");
  const [editingLabelId, setEditingLabelId] =
    React.useState<LabelIdType | null>(null);
  const [editingLabelName, setEditingLabelName] = React.useState("");
  const [labelError, setLabelError] = React.useState<string | null>(null);
  const [labelErrorTarget, setLabelErrorTarget] = React.useState<
    "create" | "edit" | "general" | null
  >(null);
  const [labelStatus, setLabelStatus] = React.useState<string | null>(null);
  const [pendingLabelAction, setPendingLabelAction] = React.useState<
    "archive" | "create" | "update" | null
  >(null);
  const settingsRootRef = React.useRef<HTMLDivElement | null>(null);
  const formRef = React.useRef<HTMLFormElement | null>(null);
  const previousOrganizationRef = React.useRef({
    id: organization.id,
    name: organization.name,
  });
  const latestOrganizationIdRef = React.useRef(organization.id);
  latestOrganizationIdRef.current = organization.id;
  const organizationLabelsKey = React.useMemo(
    () => getOrganizationLabelsKey(organizationLabels),
    [organizationLabels]
  );
  const previousLabelsKeyRef = React.useRef(organizationLabelsKey);

  const form = useForm({
    defaultValues: {
      name: organization.name,
    },
    validators: {
      onSubmit: Schema.standardSchemaV1(organizationSettingsSchema),
    },
    onSubmit: async ({ formApi, value }) => {
      formApi.setErrorMap({
        onSubmit: undefined,
      });
      setSuccessMessage(null);

      const input = decodeUpdateOrganizationInput(value);

      if (input.name === savedOrganizationNameRef.current) {
        formApi.reset({
          name: savedOrganizationNameRef.current,
        });
        return;
      }

      let result;
      const actionOrganizationId = organization.id;
      const mutationFeedback = beginMutationFeedback();

      try {
        result = await authClient.organization.update({
          data: {
            name: input.name,
          },
          organizationId: organization.id,
        });
      } catch {
        formApi.setErrorMap({
          onSubmit: {
            form: UPDATE_ORGANIZATION_FAILURE_MESSAGE,
            fields: {},
          },
        });
        return;
      }

      if (result.error || !result.data) {
        formApi.setErrorMap({
          onSubmit: {
            form: UPDATE_ORGANIZATION_FAILURE_MESSAGE,
            fields: {},
          },
        });
        return;
      }

      await mutationFeedback.waitForSuccess();

      if (latestOrganizationIdRef.current !== actionOrganizationId) {
        return;
      }

      formApi.reset({
        name: result.data.name,
      });
      savedOrganizationNameRef.current = result.data.name;
      setSuccessMessage("Organization updated.");

      try {
        await router.invalidate();
      } catch {
        setSuccessMessage(
          "Organization updated. Refresh the page if the old name still appears elsewhere."
        );
      }
    },
  });

  // Refresh local label and form state when the active organization data changes.
  // react-doctor-disable-next-line
  React.useEffect(() => {
    const previousOrganization = previousOrganizationRef.current;
    const isNewOrganization = previousOrganization.id !== organization.id;
    const isSameOrganizationRemoteNameChange =
      previousOrganization.id === organization.id &&
      previousOrganization.name !== organization.name;
    const labelsChanged =
      previousLabelsKeyRef.current !== organizationLabelsKey;

    previousOrganizationRef.current = {
      id: organization.id,
      name: organization.name,
    };
    previousLabelsKeyRef.current = organizationLabelsKey;

    if (labelsChanged || isNewOrganization) {
      setLabels(sortOrganizationLabels(organizationLabels));
      setEditingLabelId(null);
      setEditingLabelName("");
      setLabelError(null);
      setLabelErrorTarget(null);
      setLabelStatus(null);
    }

    if (!isNewOrganization && !isSameOrganizationRemoteNameChange) {
      return;
    }

    savedOrganizationNameRef.current = organization.name;

    if (isNewOrganization) {
      setSuccessMessage(null);
    }

    if (isNewOrganization || form.state.isDefaultValue) {
      form.reset({
        name: organization.name,
      });
    }
  }, [
    form,
    organizationLabels,
    organizationLabelsKey,
    organization.id,
    organization.name,
  ]);

  useAppHotkey(
    "settingsSubmit",
    () => {
      const { activeElement } = document;
      const focusedForm =
        activeElement instanceof Element ? activeElement.closest("form") : null;
      const focusIsInsideGeneralForm =
        activeElement instanceof Node &&
        Boolean(formRef.current?.contains(activeElement));
      const focusIsInsideSettings =
        activeElement instanceof Node &&
        Boolean(settingsRootRef.current?.contains(activeElement));

      if (!focusIsInsideSettings) {
        return;
      }

      if (!focusIsInsideGeneralForm) {
        focusedForm?.requestSubmit();
        return;
      }

      if (form.state.isSubmitting || form.state.isDefaultValue) {
        return;
      }

      formRef.current?.requestSubmit();
    },
    { enabled: isHydrated }
  );

  async function refreshRouteData() {
    try {
      await router.invalidate();
    } catch {
      setLabelStatus("Label saved. Refresh the page if labels look stale.");
    }
  }

  async function handleCreateLabel() {
    const decodedName = validateLabelName(newLabelName);

    setLabelError(null);
    setLabelErrorTarget(null);
    setLabelStatus(null);

    if (decodedName.kind === "empty") {
      setLabelError(EMPTY_LABEL_NAME_MESSAGE);
      setLabelErrorTarget("create");
      return;
    }

    if (decodedName.kind === "invalid") {
      setLabelError(INVALID_LABEL_NAME_MESSAGE);
      setLabelErrorTarget("create");
      return;
    }

    if (hasDuplicateLabelName(labels, decodedName.name)) {
      setLabelError(DUPLICATE_LABEL_NAME_MESSAGE);
      setLabelErrorTarget("create");
      return;
    }

    setPendingLabelAction("create");
    const actionOrganizationId = organization.id;

    try {
      const mutationFeedback = beginMutationFeedback();
      const label = await Effect.runPromise(
        createBrowserLabel({ name: decodedName.name })
      );

      await mutationFeedback.waitForSuccess();

      if (latestOrganizationIdRef.current !== actionOrganizationId) {
        return;
      }

      setLabels((current) => upsertOrganizationLabel(current, label));
      setNewLabelName("");
      setLabelStatus("Label created.");
      await refreshRouteData();
    } catch {
      if (latestOrganizationIdRef.current === actionOrganizationId) {
        setLabelError(SAVE_LABEL_FAILURE_MESSAGE);
        setLabelErrorTarget("create");
      }
    } finally {
      if (latestOrganizationIdRef.current === actionOrganizationId) {
        setPendingLabelAction(null);
      }
    }
  }

  async function handleUpdateLabel(labelId: LabelIdType) {
    const decodedName = validateLabelName(editingLabelName);

    setLabelError(null);
    setLabelErrorTarget(null);
    setLabelStatus(null);

    if (decodedName.kind !== "valid") {
      setLabelError(
        decodedName.kind === "empty"
          ? "Type a label name before saving it."
          : INVALID_LABEL_NAME_MESSAGE
      );
      setLabelErrorTarget("edit");
      return;
    }

    if (hasDuplicateLabelName(labels, decodedName.name, labelId)) {
      setLabelError(DUPLICATE_LABEL_NAME_MESSAGE);
      setLabelErrorTarget("edit");
      return;
    }

    const currentLabel = labels.find((label) => label.id === labelId);

    if (currentLabel?.name === decodedName.name) {
      setEditingLabelId(null);
      setEditingLabelName("");
      return;
    }

    setPendingLabelAction("update");
    const actionOrganizationId = organization.id;

    try {
      const mutationFeedback = beginMutationFeedback();
      const label = await Effect.runPromise(
        updateBrowserLabel(labelId, {
          name: decodedName.name,
        })
      );

      await mutationFeedback.waitForSuccess();

      if (latestOrganizationIdRef.current !== actionOrganizationId) {
        return;
      }

      setLabels((current) => upsertOrganizationLabel(current, label));
      setEditingLabelId(null);
      setEditingLabelName("");
      setLabelStatus("Label updated.");
      await refreshRouteData();
    } catch {
      if (latestOrganizationIdRef.current === actionOrganizationId) {
        setLabelError(SAVE_LABEL_FAILURE_MESSAGE);
        setLabelErrorTarget("edit");
      }
    } finally {
      if (latestOrganizationIdRef.current === actionOrganizationId) {
        setPendingLabelAction(null);
      }
    }
  }

  async function handleArchiveLabel(labelId: LabelIdType) {
    setLabelError(null);
    setLabelErrorTarget(null);
    setLabelStatus(null);
    setPendingLabelAction("archive");
    const actionOrganizationId = organization.id;

    try {
      const mutationFeedback = beginMutationFeedback();
      await Effect.runPromise(archiveBrowserLabel(labelId));
      await mutationFeedback.waitForSuccess();

      if (latestOrganizationIdRef.current !== actionOrganizationId) {
        return;
      }

      setLabels((current) => removeOrganizationLabel(current, labelId));
      setLabelStatus("Label archived.");

      if (editingLabelId === labelId) {
        setEditingLabelId(null);
        setEditingLabelName("");
      }

      await refreshRouteData();
    } catch {
      if (latestOrganizationIdRef.current === actionOrganizationId) {
        setLabelError(ARCHIVE_LABEL_FAILURE_MESSAGE);
        setLabelErrorTarget("general");
      }
    } finally {
      if (latestOrganizationIdRef.current === actionOrganizationId) {
        setPendingLabelAction(null);
      }
    }
  }

  const labelErrorId = labelError ? "job-label-settings-error" : undefined;
  const isCreateLabelError =
    labelErrorTarget === "create" && Boolean(labelError);
  const isEditLabelError = labelErrorTarget === "edit" && Boolean(labelError);

  return (
    <RegistryProvider key={organization.id}>
      <div
        ref={settingsRootRef}
        className="flex flex-1 flex-col gap-5 p-4 sm:gap-6 sm:p-6 lg:p-8"
      >
        <AppPageHeader
          title="Organization settings"
          className="border-b-0 pb-0"
        />

        <Tabs defaultValue="general" className="max-w-5xl gap-5">
          <div className="no-scrollbar overflow-x-auto border-b border-border/60">
            <TabsList
              aria-label="Organization settings sections"
              variant="line"
              className="h-10"
            >
              <TabsTrigger value="general">General</TabsTrigger>
              <TabsTrigger value="labels">Labels</TabsTrigger>
              <TabsTrigger value="service-areas">Service areas</TabsTrigger>
              <TabsTrigger value="rate-card">Rate card</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="general" keepMounted>
            <AppUtilityPanel id="organization-general" title="General">
              <form
                ref={formRef}
                className="flex max-w-xl flex-col gap-5"
                method="post"
                noValidate
                onSubmit={(event) => submitClientForm(event, form.handleSubmit)}
              >
                <FieldGroup>
                  <form.Field name="name">
                    {(field) => {
                      const errorText = getErrorText(field.state.meta.errors);

                      return (
                        <AuthFormField
                          label="Organization name"
                          htmlFor="organization-name"
                          errorText={errorText}
                        >
                          <Input
                            id="organization-name"
                            name={field.name}
                            autoComplete="organization"
                            value={field.state.value}
                            aria-invalid={Boolean(errorText) || undefined}
                            onBlur={field.handleBlur}
                            onChange={(event) => {
                              setSuccessMessage(null);
                              field.handleChange(event.target.value);
                            }}
                          />
                        </AuthFormField>
                      );
                    }}
                  </form.Field>
                </FieldGroup>

                <form.Subscribe selector={(state) => state.errorMap.onSubmit}>
                  {(error) =>
                    getFormErrorText(error) ? (
                      <FieldError>{getFormErrorText(error)}</FieldError>
                    ) : null
                  }
                </form.Subscribe>

                {successMessage ? (
                  <p role="status" className="text-sm text-muted-foreground">
                    {successMessage}
                  </p>
                ) : null}

                <form.Subscribe
                  selector={(state) => ({
                    isDefaultValue: state.isDefaultValue,
                    isSubmitting: state.isSubmitting,
                  })}
                >
                  {({ isDefaultValue, isSubmitting }) => (
                    <Button
                      type="submit"
                      size="lg"
                      className="self-start max-sm:w-full max-sm:self-stretch"
                      loading={isSubmitting}
                      disabled={isDefaultValue || !isHydrated}
                    >
                      {isSubmitting ? "Saving..." : "Save changes"}
                    </Button>
                  )}
                </form.Subscribe>
              </form>
            </AppUtilityPanel>
          </TabsContent>

          <TabsContent value="labels" keepMounted>
            <AppUtilityPanel id="organization-labels" title="Labels">
              <div className="flex max-w-3xl flex-col gap-5">
                <form
                  className="flex flex-col gap-3 sm:flex-row sm:items-end"
                  onSubmit={(event) =>
                    submitClientForm(event, handleCreateLabel)
                  }
                >
                  <AuthFormField
                    label="New label name"
                    htmlFor="new-job-label-name"
                    validationState={isCreateLabelError ? "invalid" : undefined}
                    errorText={undefined}
                  >
                    <Input
                      id="new-job-label-name"
                      value={newLabelName}
                      maxLength={48}
                      aria-describedby={
                        isCreateLabelError ? labelErrorId : undefined
                      }
                      aria-invalid={isCreateLabelError || undefined}
                      onChange={(event) => {
                        setNewLabelName(event.target.value);
                        setLabelError(null);
                        setLabelErrorTarget(null);
                        setLabelStatus(null);
                      }}
                    />
                  </AuthFormField>
                  <Button
                    type="submit"
                    size="lg"
                    className="max-sm:w-full"
                    loading={pendingLabelAction === "create"}
                    disabled={!isHydrated}
                  >
                    <Plus aria-hidden="true" />
                    Create label
                  </Button>
                </form>

                {labelError ? (
                  <FieldError id={labelErrorId}>{labelError}</FieldError>
                ) : null}
                {labelStatus ? (
                  <p role="status" className="text-sm text-muted-foreground">
                    {labelStatus}
                  </p>
                ) : null}

                <div className="overflow-hidden rounded-lg border border-border/60">
                  {labels.length === 0 ? (
                    <p className="px-4 py-6 text-sm text-muted-foreground">
                      No labels yet.
                    </p>
                  ) : (
                    <ul className="divide-y divide-border/60">
                      {labels.map((label) => {
                        const isEditing = editingLabelId === label.id;

                        return (
                          <li
                            key={label.id}
                            className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                          >
                            {isEditing ? (
                              <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center">
                                <label
                                  className="sr-only"
                                  htmlFor={`job-label-${label.id}`}
                                >
                                  Label name
                                </label>
                                <Input
                                  id={`job-label-${label.id}`}
                                  value={editingLabelName}
                                  maxLength={48}
                                  aria-describedby={
                                    isEditLabelError ? labelErrorId : undefined
                                  }
                                  aria-invalid={isEditLabelError || undefined}
                                  onChange={(event) => {
                                    setEditingLabelName(event.target.value);
                                    setLabelError(null);
                                    setLabelErrorTarget(null);
                                  }}
                                />
                                <div className="flex gap-2">
                                  <IconButton
                                    label="Save label changes"
                                    disabled={pendingLabelAction !== null}
                                    onClick={() => {
                                      void handleUpdateLabel(label.id);
                                    }}
                                  >
                                    <Check aria-hidden="true" />
                                  </IconButton>
                                  <IconButton
                                    label="Cancel label edit"
                                    disabled={pendingLabelAction !== null}
                                    onClick={() => {
                                      setEditingLabelId(null);
                                      setEditingLabelName("");
                                      setLabelError(null);
                                      setLabelErrorTarget(null);
                                    }}
                                  >
                                    <X aria-hidden="true" />
                                  </IconButton>
                                </div>
                              </div>
                            ) : (
                              <>
                                <span className="min-w-0 text-sm font-medium text-foreground">
                                  {label.name}
                                </span>
                                <DropdownMenu>
                                  <DropdownMenuTrigger
                                    render={
                                      <Button
                                        type="button"
                                        size="icon-sm"
                                        variant="outline"
                                        disabled={pendingLabelAction !== null}
                                        aria-label={`Label actions for ${label.name}`}
                                      />
                                    }
                                  >
                                    <MoreHorizontal aria-hidden="true" />
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent
                                    align="end"
                                    className="w-44"
                                  >
                                    <DropdownMenuGroup>
                                      <DropdownMenuItem
                                        onClick={() => {
                                          setEditingLabelId(label.id);
                                          setEditingLabelName(label.name);
                                          setLabelError(null);
                                          setLabelErrorTarget(null);
                                          setLabelStatus(null);
                                        }}
                                      >
                                        <Pencil
                                          aria-hidden="true"
                                          className="text-muted-foreground"
                                        />
                                        <span>Edit label</span>
                                      </DropdownMenuItem>
                                    </DropdownMenuGroup>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuGroup>
                                      <DropdownMenuItem
                                        variant="destructive"
                                        onClick={() => {
                                          void handleArchiveLabel(label.id);
                                        }}
                                      >
                                        <Archive
                                          aria-hidden="true"
                                          className="text-muted-foreground"
                                        />
                                        <span>Archive label</span>
                                      </DropdownMenuItem>
                                    </DropdownMenuGroup>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              </div>
            </AppUtilityPanel>
          </TabsContent>

          <TabsContent value="service-areas" keepMounted>
            <OrganizationServiceAreasSection />
          </TabsContent>

          <TabsContent value="rate-card" keepMounted>
            <OrganizationRateCardSection />
          </TabsContent>
        </Tabs>
      </div>
    </RegistryProvider>
  );
}

function IconButton({
  children,
  className,
  label,
  ...props
}: React.ComponentProps<typeof Button> & {
  readonly label: string;
}) {
  return (
    <Button
      type="button"
      size="icon-sm"
      variant="ghost"
      className={cn("text-muted-foreground hover:text-foreground", className)}
      aria-label={label}
      title={label}
      {...props}
    >
      {children}
    </Button>
  );
}

function hasDuplicateLabelName(
  labels: readonly Label[],
  name: string,
  ignoredLabelId?: LabelIdType
) {
  const normalizedName = normalizeLabelName(name);

  return labels.some(
    (label) =>
      label.id !== ignoredLabelId &&
      normalizeLabelName(label.name) === normalizedName
  );
}
