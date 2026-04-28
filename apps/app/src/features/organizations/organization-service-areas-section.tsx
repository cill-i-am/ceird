"use client";

import { useAtomSet, useAtomValue } from "@effect-atom/atom-react";
import type { ServiceArea } from "@task-tracker/jobs-core";
import { Exit } from "effect";
import * as React from "react";

import { AppUtilityPanel } from "#/components/app-utility-panel";
import { Button } from "#/components/ui/button";
import { FieldError, FieldGroup } from "#/components/ui/field";
import { Input } from "#/components/ui/input";
import { Textarea } from "#/components/ui/textarea";
import { useRegisterCommandActions } from "#/features/command-bar/command-bar";
import type { CommandAction } from "#/features/command-bar/command-bar";
import { ShortcutHint } from "#/hotkeys/hotkey-display";
import { HOTKEYS } from "#/hotkeys/hotkey-registry";

import { OrganizationAsyncResultError } from "./organization-async-result-error";
import {
  createServiceAreaMutationAtom,
  listServiceAreasAtom,
  organizationServiceAreasStateAtom,
  updateServiceAreaMutationAtomFamily,
} from "./organization-configuration-state";

interface ServiceAreaFormValues {
  readonly name: string;
  readonly description: string;
}

export function OrganizationServiceAreasSection() {
  const serviceAreas = useAtomValue(organizationServiceAreasStateAtom).items;
  const listResult = useAtomValue(listServiceAreasAtom);
  const createResult = useAtomValue(createServiceAreaMutationAtom);
  const loadServiceAreas = useAtomSet(listServiceAreasAtom, {
    mode: "promiseExit",
  });
  const createServiceArea = useAtomSet(createServiceAreaMutationAtom, {
    mode: "promiseExit",
  });
  const [values, setValues] = React.useState<ServiceAreaFormValues>({
    description: "",
    name: "",
  });
  const [nameError, setNameError] = React.useState<string | null>(null);
  const createFormRef = React.useRef<HTMLFormElement | null>(null);
  const newNameInputRef = React.useRef<HTMLInputElement | null>(null);
  const nameId = React.useId();
  const descriptionId = React.useId();

  React.useEffect(() => {
    void loadServiceAreas();
  }, [loadServiceAreas]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (createResult.waiting) {
      return;
    }

    const payload = buildCreateServiceAreaPayload(values);

    if (!payload) {
      setNameError("Add a service area name.");
      return;
    }

    setNameError(null);
    const exit = await createServiceArea(payload);

    if (Exit.isSuccess(exit)) {
      setValues({ description: "", name: "" });
    }
  }

  const commandActions = React.useMemo<readonly CommandAction[]>(
    () => [
      {
        disabled: createResult.waiting,
        group: "Current page",
        id: "service-area-create",
        run: () => {
          if (values.name.trim()) {
            createFormRef.current?.requestSubmit();
            return;
          }

          newNameInputRef.current?.focus();
        },
        scope: "route",
        title: values.name.trim()
          ? "Add service area"
          : "Focus new service area",
      },
    ],
    [createResult.waiting, values.name]
  );
  useRegisterCommandActions(commandActions);

  return (
    <AppUtilityPanel
      title="Service areas"
      description="Maintain the named areas used for sites, filtering, and team planning."
      className="rounded-none border-x-0 border-t border-b bg-transparent p-0 pt-5 shadow-none supports-[backdrop-filter]:bg-transparent sm:p-0 sm:pt-5"
    >
      <form
        ref={createFormRef}
        className="grid gap-3 lg:grid-cols-[minmax(12rem,0.8fr)_minmax(14rem,1fr)_auto]"
        method="post"
        noValidate
        onSubmit={handleSubmit}
      >
        <label
          className="flex min-w-0 flex-col gap-1.5 text-sm font-medium"
          htmlFor={nameId}
        >
          New service area name
          <Input
            ref={newNameInputRef}
            id={nameId}
            value={values.name}
            aria-invalid={Boolean(nameError) || undefined}
            onChange={(event) => {
              setNameError(null);
              setValues((current) => ({
                ...current,
                name: event.target.value,
              }));
            }}
          />
        </label>
        <label
          className="flex min-w-0 flex-col gap-1.5 text-sm font-medium"
          htmlFor={descriptionId}
        >
          New service area description
          <Textarea
            id={descriptionId}
            className="min-h-9 py-2"
            value={values.description}
            onChange={(event) =>
              setValues((current) => ({
                ...current,
                description: event.target.value,
              }))
            }
          />
        </label>
        <div className="flex items-end">
          <Button
            type="submit"
            className="w-full lg:w-auto"
            loading={createResult.waiting}
          >
            Add service area
            <span aria-hidden="true">
              <ShortcutHint
                className="ml-1"
                hotkey={HOTKEYS.settingsSubmit.hotkey}
                label="Add service area"
              />
            </span>
          </Button>
        </div>
      </form>

      {nameError ? <FieldError>{nameError}</FieldError> : null}

      <OrganizationAsyncResultError result={listResult} />
      <OrganizationAsyncResultError result={createResult} />

      <ServiceAreasList
        serviceAreas={serviceAreas}
        waiting={listResult.waiting}
      />
    </AppUtilityPanel>
  );
}

function ServiceAreasList({
  serviceAreas,
  waiting,
}: {
  readonly serviceAreas: readonly ServiceArea[];
  readonly waiting: boolean;
}) {
  if (serviceAreas.length > 0) {
    return (
      <ul className="flex flex-col divide-y divide-border/60 border-y border-border/60">
        {serviceAreas.map((serviceArea) => (
          <li key={serviceArea.id} className="py-3">
            <ServiceAreaRow serviceArea={serviceArea} />
          </li>
        ))}
      </ul>
    );
  }

  if (waiting) {
    return (
      <p className="text-sm text-muted-foreground">Loading service areas...</p>
    );
  }

  return (
    <p className="text-sm text-muted-foreground">
      No service areas have been added yet.
    </p>
  );
}

function ServiceAreaRow({
  serviceArea,
}: {
  readonly serviceArea: ServiceArea;
}) {
  const updateResult = useAtomValue(
    updateServiceAreaMutationAtomFamily(serviceArea.id)
  );
  const updateServiceArea = useAtomSet(
    updateServiceAreaMutationAtomFamily(serviceArea.id),
    { mode: "promiseExit" }
  );
  const [isEditing, setIsEditing] = React.useState(false);
  const [values, setValues] = React.useState<ServiceAreaFormValues>(() => ({
    description: serviceArea.description ?? "",
    name: serviceArea.name,
  }));
  const [nameError, setNameError] = React.useState<string | null>(null);
  const editNameInputRef = React.useRef<HTMLInputElement | null>(null);
  const editFormRef = React.useRef<HTMLFormElement | null>(null);
  const nameId = React.useId();
  const descriptionId = React.useId();

  React.useEffect(() => {
    if (!isEditing) {
      setValues({
        description: serviceArea.description ?? "",
        name: serviceArea.name,
      });
      setNameError(null);
    }
  }, [isEditing, serviceArea.description, serviceArea.name]);

  React.useEffect(() => {
    if (isEditing) {
      editNameInputRef.current?.focus();
    }
  }, [isEditing]);

  async function handleSave() {
    if (updateResult.waiting) {
      return;
    }

    const payload = buildUpdateServiceAreaPayload(values);

    if (!payload) {
      setNameError("Add a service area name.");
      return;
    }

    setNameError(null);
    const exit = await updateServiceArea(payload);

    if (Exit.isSuccess(exit)) {
      setIsEditing(false);
    }
  }

  const commandActions = React.useMemo<readonly CommandAction[]>(
    () => [
      {
        disabled: updateResult.waiting,
        group: "Current page",
        id: `service-area-${serviceArea.id}-${isEditing ? "save" : "edit"}`,
        run: () => {
          if (isEditing) {
            editFormRef.current?.requestSubmit();
            return;
          }

          setIsEditing(true);
        },
        scope: "route",
        title: isEditing
          ? `Save service area: ${serviceArea.name}`
          : `Edit service area: ${serviceArea.name}`,
      },
    ],
    [isEditing, serviceArea.id, serviceArea.name, updateResult.waiting]
  );
  useRegisterCommandActions(commandActions);

  return (
    <article
      aria-label={`Service area ${serviceArea.name}`}
      className="flex flex-col gap-3"
    >
      {isEditing ? (
        <form
          ref={editFormRef}
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            void handleSave();
          }}
        >
          <FieldGroup className="gap-3">
            <div className="grid gap-3 lg:grid-cols-[minmax(12rem,0.8fr)_minmax(14rem,1fr)_auto]">
              <label
                className="flex min-w-0 flex-col gap-1.5 text-sm font-medium"
                htmlFor={nameId}
              >
                Area name for {serviceArea.name}
                <Input
                  ref={editNameInputRef}
                  id={nameId}
                  value={values.name}
                  aria-invalid={Boolean(nameError) || undefined}
                  onChange={(event) => {
                    setNameError(null);
                    setValues((current) => ({
                      ...current,
                      name: event.target.value,
                    }));
                  }}
                />
              </label>
              <label
                className="flex min-w-0 flex-col gap-1.5 text-sm font-medium"
                htmlFor={descriptionId}
              >
                Description for {serviceArea.name}
                <Textarea
                  id={descriptionId}
                  className="min-h-9 py-2"
                  value={values.description}
                  onChange={(event) =>
                    setValues((current) => ({
                      ...current,
                      description: event.target.value,
                    }))
                  }
                />
              </label>
              <div className="flex items-end gap-2">
                <Button type="submit" size="sm" loading={updateResult.waiting}>
                  Save {serviceArea.name}
                  <span aria-hidden="true">
                    <ShortcutHint
                      className="ml-1"
                      hotkey={HOTKEYS.settingsSubmit.hotkey}
                      label={`Save ${serviceArea.name}`}
                    />
                  </span>
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={updateResult.waiting}
                  onClick={() => setIsEditing(false)}
                >
                  Cancel
                </Button>
              </div>
            </div>
            {nameError ? <FieldError>{nameError}</FieldError> : null}
            <OrganizationAsyncResultError result={updateResult} />
          </FieldGroup>
        </form>
      ) : (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h3 className="text-sm font-medium text-foreground">
              {serviceArea.name}
            </h3>
            {serviceArea.description ? (
              <p className="text-sm/6 text-muted-foreground">
                {serviceArea.description}
              </p>
            ) : null}
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => setIsEditing(true)}
          >
            Edit {serviceArea.name}
          </Button>
        </div>
      )}
    </article>
  );
}

function buildCreateServiceAreaPayload(values: ServiceAreaFormValues) {
  const name = values.name.trim();

  if (!name) {
    return null;
  }

  const description = values.description.trim();

  return {
    ...(description ? { description } : {}),
    name,
  };
}

function buildUpdateServiceAreaPayload(values: ServiceAreaFormValues) {
  const name = values.name.trim();

  if (!name) {
    return null;
  }

  const description = values.description.trim();

  return {
    description: description || null,
    name,
  };
}
