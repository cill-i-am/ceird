"use client";

import { isAdministrativeOrganizationRole } from "@ceird/identity-core";
import type {
  OrganizationRole,
  OrganizationSummary,
} from "@ceird/identity-core";
import type {
  CreateLabelInput,
  Label,
  LabelColor,
  LabelIdType,
  LabelWriteResponse,
  UpdateLabelInput,
} from "@ceird/labels-core";
import {
  CreateLabelInputSchema,
  DEFAULT_LABEL_COLOR,
  UpdateLabelInputSchema,
  normalizeLabelDescription,
  normalizeLabelName,
} from "@ceird/labels-core";
import { Effect, Schema } from "effect";
import {
  Archive,
  ArrowRight,
  Check,
  CheckCircle2,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  RadioTower,
  Search,
  ShieldAlert,
  Slash,
  X,
} from "lucide-react";
import * as React from "react";

import { AppPageHeader } from "#/components/app-page-header";
import { AppUtilityPanel } from "#/components/app-utility-panel";
import { Button, buttonVariants } from "#/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "#/components/ui/dropdown-menu";
import { Input } from "#/components/ui/input";
import { Textarea } from "#/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "#/components/ui/tooltip";
import type {
  DataPlaneCollectionHealth,
  DataPlaneCollectionHealthSnapshot,
} from "#/data-plane/collection-health";
import { useHydratedCollectionItems } from "#/data-plane/hydrated-collection";
import type { DataPlaneMutationJournal } from "#/data-plane/mutation-journal";
import { LabelColorPicker } from "#/features/labels/label-color-picker";
import { validateLabelName } from "#/features/labels/label-name-validation";
import { searchSettingsLabels } from "#/features/labels/labels-search";
import {
  archiveBrowserLabelWithConfirmation,
  createBrowserLabelWithConfirmation,
  updateBrowserLabelWithConfirmation,
} from "#/features/labels/labels-state";
import { ShortcutHint } from "#/hotkeys/hotkey-display";
import { HOTKEYS } from "#/hotkeys/hotkey-registry";
import { useAppHotkey } from "#/hotkeys/use-app-hotkey";
import { cn } from "#/lib/utils";

type LabelsSettingsShellState =
  | "connecting"
  | "empty"
  | "permission-aware"
  | "ready"
  | "unavailable";

interface LabelsCollectionLike {
  readonly status: string;
  entries: () => Iterable<[string | number, Label]>;
  subscribeChanges: (callback: () => void) => {
    requestSnapshot?: (options?: { readonly optimizedOnly?: boolean }) => void;
    unsubscribe: () => void;
  };
}

export interface OrganizationLabelsSettingsPageProps {
  readonly archiveLabelWithConfirmation?:
    | ((labelId: LabelIdType) => Promise<LabelWriteResponse>)
    | undefined;
  readonly collectionState?:
    | {
        readonly collection: LabelsCollectionLike | null;
        readonly health: DataPlaneCollectionHealth;
      }
    | undefined;
  readonly createLabelWithConfirmation?:
    | ((input: CreateLabelInput) => Promise<LabelWriteResponse>)
    | undefined;
  readonly mutationJournal?: DataPlaneMutationJournal | undefined;
  readonly organization: OrganizationSummary;
  readonly organizationRole?: OrganizationRole | undefined;
  readonly state?: LabelsSettingsShellState | undefined;
  readonly updateLabelWithConfirmation?:
    | ((
        labelId: LabelIdType,
        input: UpdateLabelInput
      ) => Promise<LabelWriteResponse>)
    | undefined;
}

type LabelMutationKind = "archive" | "create" | "rename";

interface PendingLabelMutation {
  readonly id: string;
  readonly kind: LabelMutationKind;
  readonly labelId?: Label["id"] | undefined;
}

interface LabelMutationStatus {
  readonly kind: "error";
  readonly message: string;
}

interface LabelCommandReflection {
  readonly archivedIds: ReadonlySet<Label["id"]>;
  readonly upserts: ReadonlyMap<Label["id"], Label>;
}

const LABEL_COMMAND_COLLECTIONS = ["labels"] as const;
const EMPTY_LABEL_NAME_MESSAGE = "Type a label name before saving it.";
const INVALID_LABEL_NAME_MESSAGE =
  "Label names must be between 1 and 48 characters.";
const DUPLICATE_LABEL_NAME_MESSAGE = "A label with that name already exists.";
const INVALID_LABEL_DESCRIPTION_MESSAGE =
  "Descriptions must be 280 characters or fewer.";

const decodeCreateLabelInput = Schema.decodeUnknownSync(CreateLabelInputSchema);
const decodeUpdateLabelInput = Schema.decodeUnknownSync(UpdateLabelInputSchema);

export function OrganizationLabelsSettingsPage({
  archiveLabelWithConfirmation = archiveDefaultLabelWithConfirmation,
  collectionState,
  createLabelWithConfirmation = createDefaultLabelWithConfirmation,
  mutationJournal,
  organization,
  organizationRole,
  state,
  updateLabelWithConfirmation = updateDefaultLabelWithConfirmation,
}: OrganizationLabelsSettingsPageProps) {
  const canManageLabels =
    organizationRole !== undefined &&
    isAdministrativeOrganizationRole(organizationRole);
  const collection = canManageLabels
    ? (collectionState?.collection ?? null)
    : null;
  const syncedLabels = useHydratedCollectionItems<Label>(
    collection ?? null,
    []
  );
  const [commandReflection, setCommandReflection] =
    React.useState<LabelCommandReflection>(createEmptyLabelCommandReflection);
  const labels = React.useMemo(
    () => reflectLabelCommands(syncedLabels, commandReflection),
    [commandReflection, syncedLabels]
  );
  const hasCommandReflection =
    commandReflection.archivedIds.size > 0 ||
    commandReflection.upserts.size > 0;
  const reflectLabelUpsert = React.useCallback((label: Label) => {
    setCommandReflection((current) => upsertReflectedLabel(current, label));
  }, []);
  const reflectLabelArchive = React.useCallback((labelId: Label["id"]) => {
    setCommandReflection((current) => archiveReflectedLabel(current, labelId));
  }, []);
  const health = useCollectionHealthSnapshot(collectionState?.health);
  const shellState =
    state ??
    getLabelsSettingsState({
      canManageLabels,
      health,
      labelCount: labels.length,
    });
  const [searchQuery, setSearchQuery] = React.useState("");
  const searchInputRef = React.useRef<HTMLInputElement>(null);
  const createInputRef = React.useRef<HTMLInputElement>(null);
  const editInputRef = React.useRef<HTMLInputElement>(null);
  const visibleLabels = React.useMemo(
    () => searchSettingsLabels(labels, searchQuery),
    [labels, searchQuery]
  );
  const hasSearch = searchQuery.trim().length > 0;
  const canWriteLabels = canWriteSettingsLabels({
    canManageLabels,
    collectionIsAvailable: collection !== null,
    shellState,
  });
  const {
    cancelEditing,
    createName,
    createDescription,
    createColor,
    cancelArchiveConfirmation,
    confirmingArchiveLabelId,
    editingLabel,
    editingLabelId,
    editingName,
    editingColor,
    handleArchiveLabel,
    handleCreateLabel,
    handleRenameLabel,
    isMutating,
    mutationStatus,
    pendingMutation,
    requestArchiveConfirmation,
    setCreateName,
    setCreateDescription,
    setCreateColor,
    setEditingName,
    setEditingColor,
    startEditingLabel,
  } = useLabelsMutationController({
    canWriteLabels,
    archiveLabelWithConfirmation,
    collection,
    createLabelWithConfirmation,
    labels,
    mutationJournal,
    reflectLabelArchive,
    reflectLabelUpsert,
    updateLabelWithConfirmation,
  });

  useLabelsSettingsHotkeys({
    canManageLabels,
    canWriteLabels,
    cancelEditing,
    createInputRef,
    editInputRef,
    editingLabel,
    editingLabelId,
    requestArchiveConfirmation,
    handleCreateLabel,
    handleRenameLabel,
    isMutating,
    searchInputRef,
  });

  return (
    <main className="flex flex-1 flex-col gap-5 p-4 sm:gap-6 sm:p-6 lg:p-8">
      <AppPageHeader
        eyebrow={organization.name}
        title="Labels"
        description="Manage active organization label definitions from the realtime product data plane."
        className="border-b-0 pb-0"
        actions={
          <a className={buttonVariants()} href="/organization/settings">
            General settings
            <ArrowRight aria-hidden="true" />
          </a>
        }
      />

      <div className="flex max-w-5xl flex-col gap-5">
        <AppUtilityPanel
          id="organization-labels-realtime-list"
          title="Realtime labels"
          description="Active labels are read from the Electric-backed TanStack DB collection for this organization."
        >
          <div className="space-y-4">
            <LabelsHealthBanner health={health} state={shellState} />
            {canManageLabels ? (
              <CreateLabelForm
                canWriteLabels={canWriteLabels}
                createName={createName}
                createColor={createColor}
                createDescription={createDescription}
                disabled={isMutating}
                inputRef={createInputRef}
                onCreateColorChange={setCreateColor}
                onCreateDescriptionChange={setCreateDescription}
                onCreateNameChange={setCreateName}
                onSubmit={() => void handleCreateLabel()}
                pending={pendingMutation?.kind === "create"}
              />
            ) : null}
            {canManageLabels ? (
              <LabelsSearchField
                disabled={shellState === "unavailable"}
                inputRef={searchInputRef}
                resultCount={visibleLabels.length}
                searchQuery={searchQuery}
                totalCount={labels.length}
                onSearchQueryChange={setSearchQuery}
              />
            ) : null}
            <LabelsStateView
              confirmingArchiveLabelId={confirmingArchiveLabelId}
              hasSearch={hasSearch}
              editingLabelId={editingLabelId}
              editingName={editingName}
              editingColor={editingColor}
              labels={visibleLabels}
              hasCommandReflection={hasCommandReflection}
              pendingMutation={pendingMutation}
              searchQuery={searchQuery}
              state={shellState}
              onArchiveLabel={(label) => void handleArchiveLabel(label)}
              onCancelArchiveConfirmation={cancelArchiveConfirmation}
              onRequestArchiveConfirmation={requestArchiveConfirmation}
              onCancelEdit={cancelEditing}
              onEditingNameChange={setEditingName}
              onEditingColorChange={setEditingColor}
              onRenameLabel={(label) => void handleRenameLabel(label)}
              onStartEdit={startEditingLabel}
              editInputRef={editInputRef}
            />
            <LabelMutationStatusView status={mutationStatus} />
          </div>
        </AppUtilityPanel>
      </div>
    </main>
  );
}

function useLabelsSettingsHotkeys({
  canManageLabels,
  canWriteLabels,
  cancelEditing,
  createInputRef,
  editInputRef,
  editingLabel,
  editingLabelId,
  handleCreateLabel,
  handleRenameLabel,
  isMutating,
  requestArchiveConfirmation,
  searchInputRef,
}: {
  readonly canManageLabels: boolean;
  readonly canWriteLabels: boolean;
  readonly cancelEditing: () => void;
  readonly createInputRef: React.RefObject<HTMLInputElement | null>;
  readonly editInputRef: React.RefObject<HTMLInputElement | null>;
  readonly editingLabel: Label | null;
  readonly editingLabelId: Label["id"] | null;
  readonly handleCreateLabel: () => Promise<void>;
  readonly handleRenameLabel: (label: Label) => Promise<void>;
  readonly isMutating: boolean;
  readonly requestArchiveConfirmation: (label: Label) => void;
  readonly searchInputRef: React.RefObject<HTMLInputElement | null>;
}) {
  useAppHotkey(
    "labelsSettingsSearch",
    () => {
      searchInputRef.current?.focus();
    },
    { enabled: canManageLabels, ignoreInputs: true }
  );

  useAppHotkey(
    "labelsSettingsCreate",
    () => {
      createInputRef.current?.focus();
    },
    { enabled: canWriteLabels, ignoreInputs: true }
  );

  useAppHotkey(
    "labelsSettingsSubmit",
    () => {
      if (editingLabel !== null) {
        void handleRenameLabel(editingLabel);
        return;
      }

      void handleCreateLabel();
    },
    { enabled: canWriteLabels && !isMutating, ignoreInputs: false }
  );

  useAppHotkey(
    "labelsSettingsCancel",
    () => {
      cancelEditing();
    },
    { enabled: editingLabelId !== null && !isMutating, ignoreInputs: false }
  );

  useAppHotkey(
    "labelsSettingsArchive",
    () => {
      if (editingLabel !== null) {
        requestArchiveConfirmation(editingLabel);
      }
    },
    {
      enabled: canWriteLabels && editingLabel !== null && !isMutating,
      ignoreInputs: false,
    }
  );

  React.useEffect(() => {
    if (editingLabelId !== null) {
      editInputRef.current?.focus();
      editInputRef.current?.select();
    }
  }, [editInputRef, editingLabelId]);
}

function canWriteSettingsLabels({
  canManageLabels,
  collectionIsAvailable,
  shellState,
}: {
  readonly canManageLabels: boolean;
  readonly collectionIsAvailable: boolean;
  readonly shellState: LabelsSettingsShellState;
}) {
  return (
    canManageLabels &&
    collectionIsAvailable &&
    (shellState === "ready" || shellState === "empty")
  );
}

function useLabelsMutationController({
  archiveLabelWithConfirmation,
  canWriteLabels,
  collection,
  createLabelWithConfirmation,
  labels,
  mutationJournal,
  reflectLabelArchive,
  reflectLabelUpsert,
  updateLabelWithConfirmation,
}: {
  readonly archiveLabelWithConfirmation: (
    labelId: LabelIdType
  ) => Promise<LabelWriteResponse>;
  readonly canWriteLabels: boolean;
  readonly collection: LabelsCollectionLike | null;
  readonly createLabelWithConfirmation: (
    input: CreateLabelInput
  ) => Promise<LabelWriteResponse>;
  readonly labels: readonly Label[];
  readonly mutationJournal?: DataPlaneMutationJournal | undefined;
  readonly reflectLabelArchive: (labelId: Label["id"]) => void;
  readonly reflectLabelUpsert: (label: Label) => void;
  readonly updateLabelWithConfirmation: (
    labelId: LabelIdType,
    input: UpdateLabelInput
  ) => Promise<LabelWriteResponse>;
}) {
  const [createName, setCreateName] = React.useState("");
  const [createDescription, setCreateDescription] = React.useState("");
  const [createColor, setCreateColor] =
    React.useState<LabelColor>(DEFAULT_LABEL_COLOR);
  const [editingLabelId, setEditingLabelId] = React.useState<
    Label["id"] | null
  >(null);
  const [editingName, setEditingName] = React.useState("");
  const [editingColor, setEditingColor] =
    React.useState<LabelColor>(DEFAULT_LABEL_COLOR);
  const [pendingMutation, setPendingMutation] =
    React.useState<PendingLabelMutation | null>(null);
  const [mutationStatus, setMutationStatus] =
    React.useState<LabelMutationStatus | null>(null);
  const [confirmingArchiveLabelId, setConfirmingArchiveLabelId] =
    React.useState<Label["id"] | null>(null);
  const mutationInFlightRef = React.useRef(false);
  const editingLabel =
    editingLabelId === null
      ? null
      : (labels.find((label) => label.id === editingLabelId) ?? null);

  function cancelEditing() {
    setEditingLabelId(null);
    setEditingName("");
    setEditingColor(DEFAULT_LABEL_COLOR);
  }

  function cancelArchiveConfirmation() {
    setConfirmingArchiveLabelId(null);
  }

  function requestArchiveConfirmation(label: Label) {
    if (!canWriteLabels || mutationInFlightRef.current) {
      return;
    }

    setConfirmingArchiveLabelId(label.id);
    setMutationStatus(null);
  }

  async function handleCreateLabel() {
    if (!canWriteLabels || collection === null || mutationInFlightRef.current) {
      return;
    }

    const decodedName = validateSettingsLabelName(createName, labels);

    if (decodedName.kind === "error") {
      setMutationStatus({ kind: "error", message: decodedName.message });
      return;
    }

    const decodedDescription =
      validateSettingsLabelDescription(createDescription);

    if (decodedDescription.kind === "error") {
      setMutationStatus({
        kind: "error",
        message: decodedDescription.message,
      });
      return;
    }

    const operationId = `labels.create:${decodedName.name}`;
    const input = createLabelInput(
      decodedName.name,
      createColor,
      decodedDescription.description
    );

    setPendingMutation({
      id: operationId,
      kind: "create",
    });
    mutationInFlightRef.current = true;
    cancelArchiveConfirmation();
    setMutationStatus(null);

    try {
      const response = await persistLabelCommandMutation({
        commandName: "labels.create",
        input,
        journal: mutationJournal,
        operation: () => createLabelWithConfirmation(input),
      });

      reflectLabelUpsert(response.label);

      setCreateName("");
      setCreateDescription("");
      setCreateColor(DEFAULT_LABEL_COLOR);
      setMutationStatus(null);
    } catch (error) {
      setMutationStatus({
        kind: "error",
        message: getLabelMutationFailureMessage(error, "create"),
      });
    } finally {
      mutationInFlightRef.current = false;
      setPendingMutation((current) =>
        current?.id === operationId ? null : current
      );
    }
  }

  async function handleRenameLabel(label: Label) {
    if (!canWriteLabels || collection === null || mutationInFlightRef.current) {
      return;
    }

    const decodedName = validateSettingsLabelName(
      editingName,
      labels,
      label.id
    );

    if (decodedName.kind === "error") {
      setMutationStatus({ kind: "error", message: decodedName.message });
      return;
    }

    if (decodedName.name === label.name && editingColor === label.color) {
      cancelEditing();
      return;
    }

    const operationId = `labels.rename:${label.id}`;
    setPendingMutation({
      id: operationId,
      kind: "rename",
      labelId: label.id,
    });
    mutationInFlightRef.current = true;
    cancelArchiveConfirmation();
    setMutationStatus(null);

    try {
      const input = updateLabelInput(label, decodedName.name, editingColor);
      const response = await persistLabelCommandMutation({
        commandName: "labels.update",
        input: {
          labelId: label.id,
          ...input,
        },
        journal: mutationJournal,
        operation: () => updateLabelWithConfirmation(label.id, input),
      });

      reflectLabelUpsert(response.label);
      cancelEditing();
      setMutationStatus(null);
    } catch (error) {
      cancelEditing();
      setMutationStatus({
        kind: "error",
        message: getLabelMutationFailureMessage(error, "rename"),
      });
    } finally {
      mutationInFlightRef.current = false;
      setPendingMutation((current) =>
        current?.id === operationId ? null : current
      );
    }
  }

  async function handleArchiveLabel(label: Label) {
    if (
      !canWriteLabels ||
      collection === null ||
      mutationInFlightRef.current ||
      confirmingArchiveLabelId !== label.id
    ) {
      return;
    }

    const operationId = `labels.archive:${label.id}`;
    setPendingMutation({
      id: operationId,
      kind: "archive",
      labelId: label.id,
    });
    mutationInFlightRef.current = true;
    setMutationStatus(null);

    try {
      await persistLabelCommandMutation({
        commandName: "labels.archive",
        input: { labelId: label.id },
        journal: mutationJournal,
        operation: () => archiveLabelWithConfirmation(label.id),
      });

      reflectLabelArchive(label.id);

      if (editingLabelId === label.id) {
        cancelEditing();
      }

      cancelArchiveConfirmation();
      setMutationStatus(null);
    } catch (error) {
      setMutationStatus({
        kind: "error",
        message: getLabelMutationFailureMessage(error, "archive"),
      });
    } finally {
      mutationInFlightRef.current = false;
      setPendingMutation((current) =>
        current?.id === operationId ? null : current
      );
    }
  }

  function startEditingLabel(label: Label) {
    setEditingLabelId(label.id);
    setEditingName(label.name);
    setEditingColor(label.color);
    setMutationStatus(null);
  }

  return {
    cancelEditing,
    createName,
    createDescription,
    createColor,
    cancelArchiveConfirmation,
    confirmingArchiveLabelId,
    editingLabel,
    editingLabelId,
    editingName,
    editingColor,
    handleArchiveLabel,
    handleCreateLabel,
    handleRenameLabel,
    isMutating: pendingMutation !== null,
    mutationStatus,
    pendingMutation,
    requestArchiveConfirmation,
    setCreateName,
    setCreateDescription,
    setCreateColor,
    setEditingName,
    setEditingColor,
    startEditingLabel,
  } as const;
}

function CreateLabelForm({
  canWriteLabels,
  createColor,
  createDescription,
  createName,
  disabled,
  inputRef,
  onCreateColorChange,
  onCreateDescriptionChange,
  onCreateNameChange,
  onSubmit,
  pending,
}: {
  readonly canWriteLabels: boolean;
  readonly createColor: LabelColor;
  readonly createDescription: string;
  readonly createName: string;
  readonly disabled: boolean;
  readonly inputRef: React.RefObject<HTMLInputElement | null>;
  readonly onCreateColorChange: (color: LabelColor) => void;
  readonly onCreateDescriptionChange: (description: string) => void;
  readonly onCreateNameChange: (name: string) => void;
  readonly onSubmit: () => void;
  readonly pending: boolean;
}) {
  return (
    <form
      className="grid gap-3 rounded-lg border border-border/70 bg-background p-3"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-2 sm:grid-cols-[auto_minmax(0,1fr)_auto]">
        <LabelColorPicker
          disabled={!canWriteLabels || disabled}
          label="New label color"
          value={createColor}
          onChange={onCreateColorChange}
        />
        <div className="relative min-w-0">
          <label className="sr-only" htmlFor="organization-labels-create">
            New label name
          </label>
          <Input
            id="organization-labels-create"
            ref={inputRef}
            disabled={!canWriteLabels || disabled}
            placeholder="New label name"
            value={createName}
            onChange={(event) => onCreateNameChange(event.currentTarget.value)}
          />
          <span className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2">
            <ShortcutHint
              decorative
              hotkey={HOTKEYS.labelsSettingsCreate.hotkey}
              label={HOTKEYS.labelsSettingsCreate.label}
            />
          </span>
        </div>
        <Button
          type="submit"
          className="col-span-2 sm:col-span-1"
          disabled={!canWriteLabels || disabled}
        >
          {pending ? (
            <Loader2 className="animate-spin" aria-hidden="true" />
          ) : (
            <Plus aria-hidden="true" />
          )}
          Create
          <ShortcutHint
            decorative
            hotkey={HOTKEYS.labelsSettingsSubmit.hotkey}
            label={HOTKEYS.labelsSettingsSubmit.label}
          />
        </Button>
      </div>
      <label className="sr-only" htmlFor="organization-labels-description">
        New label description
      </label>
      <Textarea
        id="organization-labels-description"
        className="min-h-20 resize-none"
        disabled={!canWriteLabels || disabled}
        placeholder="Description (optional)"
        value={createDescription}
        onChange={(event) =>
          onCreateDescriptionChange(event.currentTarget.value)
        }
      />
    </form>
  );
}

function LabelsSearchField({
  disabled,
  inputRef,
  onSearchQueryChange,
  resultCount,
  searchQuery,
  totalCount,
}: {
  readonly disabled: boolean;
  readonly inputRef: React.RefObject<HTMLInputElement | null>;
  readonly onSearchQueryChange: (query: string) => void;
  readonly resultCount: number;
  readonly searchQuery: string;
  readonly totalCount: number;
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
      <div className="relative block min-w-0">
        <label className="sr-only" htmlFor="organization-labels-search">
          Search labels
        </label>
        <Search
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <Input
          id="organization-labels-search"
          ref={inputRef}
          className="pr-20 pl-9"
          disabled={disabled}
          placeholder="Search labels…"
          value={searchQuery}
          onChange={(event) => onSearchQueryChange(event.currentTarget.value)}
        />
        <span className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2">
          <ShortcutHint
            decorative
            hotkey={HOTKEYS.labelsSettingsSearch.hotkey}
            label={HOTKEYS.labelsSettingsSearch.label}
          />
        </span>
      </div>
      <p className="text-sm text-muted-foreground" aria-live="polite">
        {searchQuery.trim().length > 0
          ? `${resultCount} of ${totalCount} labels`
          : `${totalCount} active labels`}
      </p>
    </div>
  );
}

function LabelsHealthBanner({
  health,
  state,
}: {
  readonly health: DataPlaneCollectionHealthSnapshot | null;
  readonly state: LabelsSettingsShellState;
}) {
  const healthCopy = getHealthCopy({ health, state });

  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-start",
        state === "ready" || state === "empty"
          ? "border-emerald-200 bg-emerald-50 text-emerald-950 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-100"
          : "border-border/70 bg-muted/35"
      )}
    >
      <div
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-lg",
          state === "ready" || state === "empty"
            ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-100"
            : "bg-background text-muted-foreground"
        )}
      >
        {state === "ready" || state === "empty" ? (
          <CheckCircle2 aria-hidden="true" />
        ) : (
          <RadioTower aria-hidden="true" />
        )}
      </div>
      <div className="min-w-0 space-y-1">
        <h3 className="text-sm font-medium">{healthCopy.title}</h3>
        <p className="max-w-[72ch] text-sm/6 text-muted-foreground">
          {healthCopy.description}
        </p>
      </div>
    </div>
  );
}

function LabelsStateView({
  confirmingArchiveLabelId,
  editInputRef,
  editingLabelId,
  editingColor,
  editingName,
  hasSearch,
  hasCommandReflection,
  labels,
  onArchiveLabel,
  onCancelArchiveConfirmation,
  onCancelEdit,
  onEditingColorChange,
  onEditingNameChange,
  onRequestArchiveConfirmation,
  onRenameLabel,
  onStartEdit,
  pendingMutation,
  searchQuery,
  state,
}: {
  readonly confirmingArchiveLabelId: Label["id"] | null;
  readonly editInputRef: React.RefObject<HTMLInputElement | null>;
  readonly editingLabelId: Label["id"] | null;
  readonly editingColor: LabelColor;
  readonly editingName: string;
  readonly hasSearch: boolean;
  readonly hasCommandReflection: boolean;
  readonly labels: readonly Label[];
  readonly onArchiveLabel: (label: Label) => void;
  readonly onCancelArchiveConfirmation: () => void;
  readonly onCancelEdit: () => void;
  readonly onEditingColorChange: (color: LabelColor) => void;
  readonly onEditingNameChange: (name: string) => void;
  readonly onRequestArchiveConfirmation: (label: Label) => void;
  readonly onRenameLabel: (label: Label) => void;
  readonly onStartEdit: (label: Label) => void;
  readonly pendingMutation: PendingLabelMutation | null;
  readonly searchQuery: string;
  readonly state: LabelsSettingsShellState;
}) {
  if (labels.length === 0 && !hasSearch && hasCommandReflection) {
    return <LabelsEmptyNotice />;
  }

  switch (state) {
    case "connecting": {
      return <LabelsLoadingSkeleton />;
    }
    case "empty": {
      return <LabelsEmptyNotice />;
    }
    case "unavailable": {
      return (
        <ShellNotice
          icon={<RadioTower aria-hidden="true" />}
          title="Realtime labels unavailable"
          description="The Labels tab is waiting for the Electric labels collection. Check sync configuration or try again when realtime is reachable."
        />
      );
    }
    case "permission-aware": {
      return (
        <ShellNotice
          icon={<ShieldAlert aria-hidden="true" />}
          title="Admin label management"
          description="Owners and admins can manage organization labels from this realtime settings surface."
        />
      );
    }
    case "ready": {
      if (labels.length === 0) {
        if (!hasSearch) {
          return <LabelsEmptyNotice />;
        }

        return (
          <ShellNotice
            icon={<Slash aria-hidden="true" />}
            title="No matching labels"
            description={`No active labels match "${searchQuery.trim()}".`}
          />
        );
      }

      return (
        <div className="overflow-hidden rounded-lg border border-border/70">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 border-b border-border/70 bg-muted/40 px-4 py-2 text-xs font-medium text-muted-foreground">
            <span>Label</span>
            <span>Actions</span>
          </div>
          <ul className="divide-y divide-border/70">
            {labels.map((label) => (
              <LabelRow
                confirmingArchive={confirmingArchiveLabelId === label.id}
                editInputRef={editInputRef}
                editing={editingLabelId === label.id}
                editingColor={editingColor}
                editingName={editingName}
                key={label.id}
                label={label}
                pendingMutation={pendingMutation}
                onArchiveLabel={onArchiveLabel}
                onCancelArchiveConfirmation={onCancelArchiveConfirmation}
                onCancelEdit={onCancelEdit}
                onEditingColorChange={onEditingColorChange}
                onEditingNameChange={onEditingNameChange}
                onRenameLabel={onRenameLabel}
                onRequestArchiveConfirmation={onRequestArchiveConfirmation}
                onStartEdit={onStartEdit}
              />
            ))}
          </ul>
        </div>
      );
    }
    default: {
      state satisfies never;
      return null;
    }
  }
}

function LabelsEmptyNotice() {
  return (
    <ShellNotice
      icon={<CheckCircle2 aria-hidden="true" />}
      title="No labels yet"
      description="New labels created by admins will appear here after the Electric labels shape observes them."
    />
  );
}

function LabelRow({
  confirmingArchive,
  editInputRef,
  editing,
  editingColor,
  editingName,
  label,
  onArchiveLabel,
  onCancelArchiveConfirmation,
  onCancelEdit,
  onEditingColorChange,
  onEditingNameChange,
  onRenameLabel,
  onRequestArchiveConfirmation,
  onStartEdit,
  pendingMutation,
}: {
  readonly confirmingArchive: boolean;
  readonly editInputRef: React.RefObject<HTMLInputElement | null>;
  readonly editing: boolean;
  readonly editingColor: LabelColor;
  readonly editingName: string;
  readonly label: Label;
  readonly onArchiveLabel: (label: Label) => void;
  readonly onCancelArchiveConfirmation: () => void;
  readonly onCancelEdit: () => void;
  readonly onEditingColorChange: (color: LabelColor) => void;
  readonly onEditingNameChange: (name: string) => void;
  readonly onRenameLabel: (label: Label) => void;
  readonly onRequestArchiveConfirmation: (label: Label) => void;
  readonly onStartEdit: (label: Label) => void;
  readonly pendingMutation: PendingLabelMutation | null;
}) {
  const actionsDisabled = pendingMutation !== null;
  const archivePending =
    pendingMutation?.kind === "archive" && pendingMutation.labelId === label.id;
  const renamePending =
    pendingMutation?.kind === "rename" && pendingMutation.labelId === label.id;

  return (
    <li className="group/label-row grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 bg-background px-4 py-3">
      <div className="min-w-0">
        {editing ? (
          <div className="grid gap-2">
            <label className="sr-only" htmlFor={`label-edit-${label.id}`}>
              Rename {label.name}
            </label>
            <Input
              id={`label-edit-${label.id}`}
              ref={editInputRef}
              disabled={actionsDisabled}
              value={editingName}
              onChange={(event) =>
                onEditingNameChange(event.currentTarget.value)
              }
            />
            <LabelColorPicker
              disabled={actionsDisabled}
              label={`Color for ${label.name}`}
              value={editingColor}
              onChange={onEditingColorChange}
            />
            <p className="text-xs text-muted-foreground">
              <EditLabelShortcutHelp confirmingArchive={confirmingArchive} />
            </p>
          </div>
        ) : (
          <>
            <div className="flex min-w-0 items-center gap-2">
              <span
                className="size-3 shrink-0 rounded-full border border-black/15"
                style={{ backgroundColor: label.color }}
                aria-hidden="true"
              />
              <p className="truncate text-sm font-medium text-foreground">
                {label.name}
              </p>
            </div>
            {label.description ? (
              <p className="truncate text-xs text-muted-foreground">
                {label.description}
              </p>
            ) : null}
          </>
        )}
      </div>
      <LabelRowActions
        actionsDisabled={actionsDisabled}
        archivePending={archivePending}
        confirmingArchive={confirmingArchive}
        editing={editing}
        label={label}
        renamePending={renamePending}
        onArchiveLabel={onArchiveLabel}
        onCancelArchiveConfirmation={onCancelArchiveConfirmation}
        onCancelEdit={onCancelEdit}
        onRenameLabel={onRenameLabel}
        onRequestArchiveConfirmation={onRequestArchiveConfirmation}
        onStartEdit={onStartEdit}
      />
    </li>
  );
}

function LabelRowActions({
  actionsDisabled,
  archivePending,
  confirmingArchive,
  editing,
  label,
  renamePending,
  onArchiveLabel,
  onCancelArchiveConfirmation,
  onCancelEdit,
  onRenameLabel,
  onRequestArchiveConfirmation,
  onStartEdit,
}: {
  readonly actionsDisabled: boolean;
  readonly archivePending: boolean;
  readonly confirmingArchive: boolean;
  readonly editing: boolean;
  readonly label: Label;
  readonly renamePending: boolean;
  readonly onArchiveLabel: (label: Label) => void;
  readonly onCancelArchiveConfirmation: () => void;
  readonly onCancelEdit: () => void;
  readonly onRenameLabel: (label: Label) => void;
  readonly onRequestArchiveConfirmation: (label: Label) => void;
  readonly onStartEdit: (label: Label) => void;
}) {
  if (confirmingArchive) {
    return (
      <ArchiveConfirmationActions
        label={label}
        pending={archivePending}
        onArchiveLabel={onArchiveLabel}
        onCancelArchiveConfirmation={onCancelArchiveConfirmation}
      />
    );
  }

  if (editing) {
    return (
      <div className="flex items-center gap-1">
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          aria-label={`Save ${label.name}`}
          disabled={actionsDisabled}
          onClick={() => onRenameLabel(label)}
        >
          {renamePending ? (
            <Loader2 className="animate-spin" aria-hidden="true" />
          ) : (
            <Check aria-hidden="true" />
          )}
        </Button>
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          aria-label={`Cancel editing ${label.name}`}
          disabled={actionsDisabled}
          onClick={onCancelEdit}
        >
          <X aria-hidden="true" />
        </Button>
        <Button
          type="button"
          size="icon-sm"
          variant="destructive"
          aria-label={`Archive ${label.name}`}
          disabled={actionsDisabled}
          onClick={() => onRequestArchiveConfirmation(label)}
          title={`${HOTKEYS.labelsSettingsArchive.label}: ${HOTKEYS.labelsSettingsArchive.hotkey}`}
        >
          <Archive aria-hidden="true" />
        </Button>
      </div>
    );
  }

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger
          render={
            <DropdownMenuTrigger
              render={
                <Button
                  type="button"
                  aria-label={`Open actions for ${label.name}`}
                  className="opacity-0 transition-opacity group-focus-within/label-row:opacity-100 group-hover/label-row:opacity-100 focus-visible:opacity-100"
                  disabled={actionsDisabled}
                  size="icon-sm"
                  title={`Actions for ${label.name}`}
                  variant="ghost"
                />
              }
            />
          }
        >
          <MoreHorizontal aria-hidden="true" />
        </TooltipTrigger>
        <TooltipContent>Label actions</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuItem
          disabled={actionsDisabled}
          onClick={() => onStartEdit(label)}
        >
          <Pencil aria-hidden="true" />
          Edit label
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled={actionsDisabled}
          variant="destructive"
          onClick={() => onRequestArchiveConfirmation(label)}
        >
          <Archive aria-hidden="true" />
          Archive label
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function EditLabelShortcutHelp({
  confirmingArchive,
}: {
  readonly confirmingArchive: boolean;
}) {
  if (confirmingArchive) {
    return "Confirm or cancel archive below.";
  }

  return (
    <React.Fragment>
      Save with{" "}
      <ShortcutHint
        decorative
        hotkey={HOTKEYS.labelsSettingsSubmit.hotkey}
        label={HOTKEYS.labelsSettingsSubmit.label}
      />
      , cancel with{" "}
      <ShortcutHint
        decorative
        hotkey={HOTKEYS.labelsSettingsCancel.hotkey}
        label={HOTKEYS.labelsSettingsCancel.label}
      />{" "}
      or prepare archive with{" "}
      <ShortcutHint
        decorative
        hotkey={HOTKEYS.labelsSettingsArchive.hotkey}
        label={HOTKEYS.labelsSettingsArchive.label}
      />
    </React.Fragment>
  );
}

function ArchiveConfirmationActions({
  label,
  pending,
  onArchiveLabel,
  onCancelArchiveConfirmation,
}: {
  readonly label: Label;
  readonly pending: boolean;
  readonly onArchiveLabel: (label: Label) => void;
  readonly onCancelArchiveConfirmation: () => void;
}) {
  return (
    <fieldset className="m-0 flex min-w-0 flex-wrap items-center justify-end gap-2 border-0 p-0">
      <legend className="sr-only">Confirm archiving {label.name}</legend>
      <p className="basis-full text-sm font-medium text-foreground sm:text-right">
        Archive this label?
      </p>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        disabled={pending}
        onClick={onCancelArchiveConfirmation}
      >
        <X aria-hidden="true" />
        Cancel
      </Button>
      <Button
        type="button"
        size="sm"
        variant="destructive"
        disabled={pending}
        onClick={() => onArchiveLabel(label)}
      >
        {pending ? (
          <Loader2 className="animate-spin" aria-hidden="true" />
        ) : (
          <Archive aria-hidden="true" />
        )}
        Archive label
      </Button>
    </fieldset>
  );
}

function LabelMutationStatusView({
  status,
}: {
  readonly status: LabelMutationStatus | null;
}) {
  if (!status) {
    return null;
  }

  return (
    <p
      className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
      role="alert"
    >
      {status.message}
    </p>
  );
}

function LabelsLoadingSkeleton() {
  return (
    <div
      className="grid gap-3 rounded-lg border border-border/60 p-4"
      aria-busy="true"
      aria-label="Loading labels"
    >
      <div className="h-4 w-36 rounded bg-muted" />
      <div className="h-3 w-full max-w-lg rounded bg-muted/70" />
      <div className="h-3 w-4/5 max-w-md rounded bg-muted/70" />
    </div>
  );
}

function ShellNotice({
  icon,
  title,
  description,
}: {
  readonly description: string;
  readonly icon: React.ReactNode;
  readonly title: string;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border/60 p-4 sm:flex-row sm:items-start">
      <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        {icon}
      </div>
      <div className="min-w-0 space-y-1">
        <h3 className="text-sm font-medium text-foreground">{title}</h3>
        <p className="max-w-[64ch] text-sm/6 text-muted-foreground">
          {description}
        </p>
      </div>
    </div>
  );
}

function getLabelsSettingsState({
  canManageLabels,
  health,
  labelCount,
}: {
  readonly canManageLabels: boolean;
  readonly health: DataPlaneCollectionHealthSnapshot | null;
  readonly labelCount: number;
}): LabelsSettingsShellState {
  if (!canManageLabels) {
    return "permission-aware";
  }

  if (!health || health.status === "connecting") {
    return "connecting";
  }

  if (health.status === "ready") {
    return labelCount === 0 ? "empty" : "ready";
  }

  return "unavailable";
}

function createEmptyLabelCommandReflection(): LabelCommandReflection {
  return {
    archivedIds: new Set<Label["id"]>(),
    upserts: new Map<Label["id"], Label>(),
  };
}

function reflectLabelCommands(
  syncedLabels: readonly Label[],
  reflection: LabelCommandReflection
) {
  const labelsById = new Map(
    syncedLabels.map((label): [Label["id"], Label] => [label.id, label])
  );

  for (const archivedId of reflection.archivedIds) {
    labelsById.delete(archivedId);
  }

  for (const label of reflection.upserts.values()) {
    if (label.archivedAt === null && !reflection.archivedIds.has(label.id)) {
      labelsById.set(label.id, label);
    }
  }

  return sortLabelsByName([...labelsById.values()]);
}

function upsertReflectedLabel(
  current: LabelCommandReflection,
  label: Label
): LabelCommandReflection {
  const archivedIds = new Set(current.archivedIds);
  const upserts = new Map(current.upserts);

  archivedIds.delete(label.id);
  upserts.set(label.id, label);

  return { archivedIds, upserts };
}

function archiveReflectedLabel(
  current: LabelCommandReflection,
  labelId: Label["id"]
): LabelCommandReflection {
  const archivedIds = new Set(current.archivedIds);
  const upserts = new Map(current.upserts);

  archivedIds.add(labelId);
  upserts.delete(labelId);

  return { archivedIds, upserts };
}

function sortLabelsByName(labels: readonly Label[]) {
  return labels.toSorted(compareLabelsByName);
}

function compareLabelsByName(left: Label, right: Label) {
  const nameComparison = left.name.localeCompare(right.name);

  return nameComparison === 0
    ? left.id.localeCompare(right.id)
    : nameComparison;
}

function getHealthCopy({
  health,
  state,
}: {
  readonly health: DataPlaneCollectionHealthSnapshot | null;
  readonly state: LabelsSettingsShellState;
}) {
  if (state === "permission-aware") {
    return {
      description:
        "Label management is available to organization owners and admins.",
      title: "Permission-aware access",
    };
  }

  if (state === "ready" || state === "empty") {
    return {
      description:
        "The labels collection is ready and reflects active organization labels from the sync data plane.",
      title: "Realtime ready",
    };
  }

  if (state === "connecting") {
    return {
      description:
        "The Labels tab is subscribing to the named Electric labels shape.",
      title: "Connecting to realtime labels",
    };
  }

  return {
    description:
      health?.lastError?.message ??
      health?.disabledReason ??
      "The Electric labels collection is not available for this browser session.",
    title: "Realtime labels unavailable",
  };
}

function useCollectionHealthSnapshot(
  health: DataPlaneCollectionHealth | undefined
) {
  return React.useSyncExternalStore(
    React.useCallback(
      (onStoreChange) => health?.subscribe(onStoreChange) ?? (() => null),
      [health]
    ),
    React.useCallback(() => health?.current ?? null, [health]),
    React.useCallback(() => health?.current ?? null, [health])
  );
}

function createLabelInput(
  name: Label["name"],
  color: LabelColor,
  description: string | null
): CreateLabelInput {
  return decodeCreateLabelInput({
    color,
    description: normalizeLabelDescription(description),
    name,
  });
}

function updateLabelInput(
  label: Label,
  name: Label["name"],
  color: LabelColor
): UpdateLabelInput {
  return decodeUpdateLabelInput({
    color,
    description: label.description,
    name,
  });
}

async function persistLabelCommandMutation({
  commandName,
  input,
  journal,
  operation,
}: {
  readonly commandName: string;
  readonly input: unknown;
  readonly journal?: DataPlaneMutationJournal | undefined;
  readonly operation: () => Promise<LabelWriteResponse>;
}): Promise<LabelWriteResponse> {
  const journalEntry = journal?.recordPending({
    affectedCollections: LABEL_COMMAND_COLLECTIONS,
    commandName,
    input,
  });

  try {
    const output = await operation();
    if (journalEntry) {
      journal?.recordSuccess(journalEntry.id, output);
    }
    return output;
  } catch (error) {
    if (journalEntry) {
      journal?.recordFailure(journalEntry.id, error);
    }
    throw error;
  }
}

function createDefaultLabelWithConfirmation(input: CreateLabelInput) {
  return Effect.runPromise(createBrowserLabelWithConfirmation(input));
}

function updateDefaultLabelWithConfirmation(
  labelId: LabelIdType,
  input: UpdateLabelInput
) {
  return Effect.runPromise(updateBrowserLabelWithConfirmation(labelId, input));
}

function archiveDefaultLabelWithConfirmation(labelId: LabelIdType) {
  return Effect.runPromise(archiveBrowserLabelWithConfirmation(labelId));
}

function validateSettingsLabelName(
  input: string,
  labels: readonly Label[],
  ignoreLabelId?: Label["id"] | undefined
):
  | { readonly kind: "error"; readonly message: string }
  | { readonly kind: "valid"; readonly name: Label["name"] } {
  const decoded = validateLabelName(input);

  if (decoded.kind === "empty") {
    return { kind: "error", message: EMPTY_LABEL_NAME_MESSAGE };
  }

  if (decoded.kind === "invalid") {
    return { kind: "error", message: INVALID_LABEL_NAME_MESSAGE };
  }

  if (hasDuplicateLabelName(labels, decoded.name, ignoreLabelId)) {
    return { kind: "error", message: DUPLICATE_LABEL_NAME_MESSAGE };
  }

  return decoded;
}

function validateSettingsLabelDescription(
  input: string
):
  | { readonly description: string | null; readonly kind: "valid" }
  | { readonly kind: "error"; readonly message: string } {
  try {
    return {
      description: normalizeLabelDescription(input),
      kind: "valid",
    };
  } catch {
    return {
      kind: "error",
      message: INVALID_LABEL_DESCRIPTION_MESSAGE,
    };
  }
}

function hasDuplicateLabelName(
  labels: readonly Label[],
  name: string,
  ignoreLabelId?: Label["id"] | undefined
) {
  const normalizedName = normalizeLabelName(name);

  return labels.some(
    (label) =>
      label.id !== ignoreLabelId &&
      normalizeLabelName(label.name) === normalizedName
  );
}

function getLabelMutationFailureMessage(
  error: unknown,
  operation: LabelMutationKind
) {
  const tag =
    typeof error === "object" && error !== null && "_tag" in error
      ? error._tag
      : undefined;
  const message =
    typeof error === "object" && error !== null && "message" in error
      ? error.message
      : undefined;
  const name =
    typeof error === "object" && error !== null && "name" in error
      ? error.name
      : undefined;

  if (tag === "@ceird/labels-core/LabelNameConflictError") {
    return DUPLICATE_LABEL_NAME_MESSAGE;
  }

  if (tag === "@ceird/labels-core/LabelAccessDeniedError") {
    return "You do not have permission to manage organization labels.";
  }

  if (
    name === "TimeoutWaitingForTxIdError" ||
    (typeof message === "string" &&
      message.includes("Timeout waiting for txId"))
  ) {
    return "The label command succeeded, but realtime confirmation timed out. Refresh once sync catches up.";
  }

  if (operation === "archive") {
    return "Could not archive the label. The active label list was restored.";
  }

  if (operation === "rename") {
    return "Could not rename the label. The active label list was restored.";
  }

  return "Could not create the label. The pending row was removed.";
}
