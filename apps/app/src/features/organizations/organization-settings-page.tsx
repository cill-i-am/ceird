/* oxlint-disable unicorn/no-array-sort */
import { RegistryProvider } from "@effect-atom/atom-react";
import { useForm } from "@tanstack/react-form";
import { useRouter } from "@tanstack/react-router";
import type {
  CreateJobLabelInput,
  JobLabel,
  JobLabelIdType,
  UpdateJobLabelInput,
} from "@task-tracker/jobs-core";
import {
  JobLabelNameSchema,
  normalizeJobLabelName,
} from "@task-tracker/jobs-core";
import { Effect, Schema } from "effect";
import { Archive, Check, Pencil, Plus, X } from "lucide-react";
import * as React from "react";

import { AppPageHeader } from "#/components/app-page-header";
import { AppUtilityPanel } from "#/components/app-utility-panel";
import { Button } from "#/components/ui/button";
import { FieldError, FieldGroup } from "#/components/ui/field";
import { Input } from "#/components/ui/input";
import {
  getErrorText,
  getFormErrorText,
} from "#/features/auth/auth-form-errors";
import { AuthFormField } from "#/features/auth/auth-form-field";
import { runBrowserJobsRequest } from "#/features/jobs/jobs-client";
import { useIsHydrated } from "#/hooks/use-is-hydrated";
import { useAppHotkey } from "#/hotkeys/use-app-hotkey";
import { authClient } from "#/lib/auth-client";
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
const decodeJobLabelName = Schema.decodeUnknownSync(JobLabelNameSchema);

export function OrganizationSettingsPage({
  jobLabels = [],
  organization,
}: {
  readonly jobLabels?: readonly JobLabel[];
  readonly organization: OrganizationSummary;
}) {
  const router = useRouter();
  const isHydrated = useIsHydrated();
  const [successMessage, setSuccessMessage] = React.useState<string | null>(
    null
  );
  const [savedOrganizationName, setSavedOrganizationName] = React.useState(
    organization.name
  );
  const [labels, setLabels] = React.useState(() => sortJobLabels(jobLabels));
  const [newLabelName, setNewLabelName] = React.useState("");
  const [editingLabelId, setEditingLabelId] =
    React.useState<JobLabelIdType | null>(null);
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
  const jobLabelsKey = React.useMemo(
    () => getJobLabelsKey(jobLabels),
    [jobLabels]
  );
  const previousJobLabelsKeyRef = React.useRef(jobLabelsKey);

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

      if (input.name === savedOrganizationName) {
        formApi.reset({
          name: savedOrganizationName,
        });
        return;
      }

      let result;

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

      formApi.reset({
        name: result.data.name,
      });
      setSavedOrganizationName(result.data.name);
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

  React.useEffect(() => {
    const previousOrganization = previousOrganizationRef.current;
    const isNewOrganization = previousOrganization.id !== organization.id;
    const isSameOrganizationRemoteNameChange =
      previousOrganization.id === organization.id &&
      previousOrganization.name !== organization.name;
    const labelsChanged = previousJobLabelsKeyRef.current !== jobLabelsKey;

    previousOrganizationRef.current = {
      id: organization.id,
      name: organization.name,
    };
    previousJobLabelsKeyRef.current = jobLabelsKey;

    if (labelsChanged || isNewOrganization) {
      setLabels(sortJobLabels(jobLabels));
      setEditingLabelId(null);
      setEditingLabelName("");
      setLabelError(null);
      setLabelErrorTarget(null);
      setLabelStatus(null);
    }

    if (!isNewOrganization && !isSameOrganizationRemoteNameChange) {
      return;
    }

    setSavedOrganizationName(organization.name);

    if (isNewOrganization) {
      setSuccessMessage(null);
    }

    if (isNewOrganization || form.state.isDefaultValue) {
      form.reset({
        name: organization.name,
      });
    }
  }, [form, jobLabels, jobLabelsKey, organization.id, organization.name]);

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

  async function handleCreateLabel(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
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

    try {
      const label = await createBrowserJobLabel({ name: decodedName.name });

      setLabels((current) => upsertJobLabel(current, label));
      setNewLabelName("");
      setLabelStatus("Label created.");
      await refreshRouteData();
    } catch {
      setLabelError(SAVE_LABEL_FAILURE_MESSAGE);
      setLabelErrorTarget("create");
    } finally {
      setPendingLabelAction(null);
    }
  }

  async function handleUpdateLabel(labelId: JobLabelIdType) {
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

    try {
      const label = await updateBrowserJobLabel(labelId, {
        name: decodedName.name,
      });

      setLabels((current) => upsertJobLabel(current, label));
      setEditingLabelId(null);
      setEditingLabelName("");
      setLabelStatus("Label updated.");
      await refreshRouteData();
    } catch {
      setLabelError(SAVE_LABEL_FAILURE_MESSAGE);
      setLabelErrorTarget("edit");
    } finally {
      setPendingLabelAction(null);
    }
  }

  async function handleArchiveLabel(labelId: JobLabelIdType) {
    setLabelError(null);
    setLabelErrorTarget(null);
    setLabelStatus(null);
    setPendingLabelAction("archive");

    try {
      await archiveBrowserJobLabel(labelId);
      setLabels((current) => current.filter((label) => label.id !== labelId));
      setLabelStatus("Label archived.");

      if (editingLabelId === labelId) {
        setEditingLabelId(null);
        setEditingLabelName("");
      }

      await refreshRouteData();
    } catch {
      setLabelError(ARCHIVE_LABEL_FAILURE_MESSAGE);
      setLabelErrorTarget("general");
    } finally {
      setPendingLabelAction(null);
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
        className="flex flex-1 flex-col gap-6 p-4 sm:p-6 lg:p-8"
      >
        <AppPageHeader
          eyebrow="Organization"
          title="Organization settings"
          description="Keep the workspace identity current for everyone on the team."
        />

        <div className="grid max-w-5xl gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(18rem,0.42fr)]">
          <AppUtilityPanel
            title="General"
            description="Update the name your team sees across Task Tracker."
            className="rounded-none border-x-0 border-t border-b bg-transparent p-0 pt-5 shadow-none supports-[backdrop-filter]:bg-transparent sm:p-0 sm:pt-5"
          >
            <form
              ref={formRef}
              className="flex max-w-xl flex-col gap-5"
              method="post"
              noValidate
              onSubmit={(event) => {
                event.preventDefault();
                event.stopPropagation();
                void form.handleSubmit();
              }}
            >
              <FieldGroup>
                <form.Field name="name">
                  {(field) => {
                    const errorText = getErrorText(field.state.meta.errors);

                    return (
                      <AuthFormField
                        label="Organization name"
                        htmlFor="organization-name"
                        invalid={Boolean(errorText)}
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
                    className="w-full sm:w-auto"
                    loading={isSubmitting}
                    disabled={isDefaultValue || !isHydrated}
                  >
                    {isSubmitting ? "Saving..." : "Save changes"}
                  </Button>
                )}
              </form.Subscribe>
            </form>
          </AppUtilityPanel>

          <AppUtilityPanel
            title="Identity"
            description="These values are used when Task Tracker identifies this workspace."
          >
            <dl className="flex flex-col gap-4">
              <div className="flex flex-col gap-1 border-t border-border/60 pt-4 first:border-t-0 first:pt-0">
                <dt className="text-xs font-medium text-muted-foreground uppercase">
                  Slug
                </dt>
                <dd className="font-mono text-sm break-all text-foreground">
                  {organization.slug}
                </dd>
              </div>
              <div className="flex flex-col gap-1 border-t border-border/60 pt-4">
                <dt className="text-xs font-medium text-muted-foreground uppercase">
                  Access
                </dt>
                <dd className="text-sm/6 text-muted-foreground">
                  Admins and owners can edit organization settings.
                </dd>
              </div>
            </dl>
          </AppUtilityPanel>
        </div>

        <div className="grid max-w-5xl gap-6">
          <AppUtilityPanel
            title="Job labels"
            description="Manage the labels used to sort and filter work across jobs."
            className="rounded-none border-x-0 border-t border-b bg-transparent p-0 pt-5 shadow-none supports-[backdrop-filter]:bg-transparent sm:p-0 sm:pt-5"
          >
            <div className="flex max-w-3xl flex-col gap-5">
              <form
                className="flex flex-col gap-3 sm:flex-row sm:items-end"
                onSubmit={(event) => {
                  void handleCreateLabel(event);
                }}
              >
                <AuthFormField
                  label="New label name"
                  htmlFor="new-job-label-name"
                  invalid={isCreateLabelError}
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
                  className="w-full sm:w-auto"
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
                    No job labels yet.
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
                              <div className="flex gap-2">
                                <IconButton
                                  label={`Edit ${label.name}`}
                                  disabled={pendingLabelAction !== null}
                                  onClick={() => {
                                    setEditingLabelId(label.id);
                                    setEditingLabelName(label.name);
                                    setLabelError(null);
                                    setLabelErrorTarget(null);
                                    setLabelStatus(null);
                                  }}
                                >
                                  <Pencil aria-hidden="true" />
                                </IconButton>
                                <IconButton
                                  label={`Archive ${label.name}`}
                                  disabled={pendingLabelAction !== null}
                                  onClick={() => {
                                    void handleArchiveLabel(label.id);
                                  }}
                                >
                                  <Archive aria-hidden="true" />
                                </IconButton>
                              </div>
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

          <OrganizationServiceAreasSection />
          <OrganizationRateCardSection />
        </div>
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

function createBrowserJobLabel(input: CreateJobLabelInput): Promise<JobLabel> {
  return Effect.runPromise(
    runBrowserJobsRequest("JobsBrowser.createJobLabel", (client) =>
      client.jobs.createJobLabel({
        payload: input,
      })
    )
  );
}

function updateBrowserJobLabel(
  labelId: JobLabelIdType,
  input: UpdateJobLabelInput
): Promise<JobLabel> {
  return Effect.runPromise(
    runBrowserJobsRequest("JobsBrowser.updateJobLabel", (client) =>
      client.jobs.updateJobLabel({
        path: { labelId },
        payload: input,
      })
    )
  );
}

function archiveBrowserJobLabel(labelId: JobLabelIdType): Promise<JobLabel> {
  return Effect.runPromise(
    runBrowserJobsRequest("JobsBrowser.archiveJobLabel", (client) =>
      client.jobs.deleteJobLabel({
        path: { labelId },
      })
    )
  );
}

function validateLabelName(
  input: string
):
  | { readonly kind: "empty" }
  | { readonly kind: "invalid" }
  | { readonly kind: "valid"; readonly name: CreateJobLabelInput["name"] } {
  if (input.trim().length === 0) {
    return { kind: "empty" };
  }

  try {
    return {
      kind: "valid",
      name: decodeJobLabelName(input),
    };
  } catch {
    return { kind: "invalid" };
  }
}

function hasDuplicateLabelName(
  labels: readonly JobLabel[],
  name: string,
  ignoredLabelId?: JobLabelIdType
) {
  const normalizedName = normalizeJobLabelName(name);

  return labels.some(
    (label) =>
      label.id !== ignoredLabelId &&
      normalizeJobLabelName(label.name) === normalizedName
  );
}

function upsertJobLabel(labels: readonly JobLabel[], label: JobLabel) {
  return sortJobLabels([
    label,
    ...labels.filter((currentLabel) => currentLabel.id !== label.id),
  ]);
}

function sortJobLabels(labels: readonly JobLabel[]) {
  return [...labels].sort(compareJobLabels);
}

function compareJobLabels(left: JobLabel, right: JobLabel) {
  const nameOrder = left.name.localeCompare(right.name);

  return nameOrder === 0 ? left.id.localeCompare(right.id) : nameOrder;
}

function getJobLabelsKey(labels: readonly JobLabel[]) {
  return labels.map((label) => `${label.id}:${label.name}`).join("|");
}
