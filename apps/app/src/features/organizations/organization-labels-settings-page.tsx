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
  LabelsResponse,
  ListLabelsQuery,
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
  RotateCcw,
  Search,
  ShieldAlert,
  Slash,
  X,
} from "lucide-react";
import * as React from "react";
import { toast } from "sonner";

import { AppPageHeader } from "#/components/app-page-header";
import { AppUtilityPanel } from "#/components/app-utility-panel";
import { Alert, AlertDescription, AlertTitle } from "#/components/ui/alert";
import { Badge } from "#/components/ui/badge";
import { Button, buttonVariants } from "#/components/ui/button";
import {
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "#/components/ui/drawer";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "#/components/ui/dropdown-menu";
import { Field, FieldError, FieldLabel } from "#/components/ui/field";
import { Input } from "#/components/ui/input";
import { ResponsiveDrawer } from "#/components/ui/responsive-drawer";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "#/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "#/components/ui/tabs";
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
  listBrowserLabels,
  restoreBrowserLabelWithConfirmation,
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
type LabelsView = "active" | "archived";
type LabelMutationKind = "archive" | "create" | "restore" | "update";
type LabelFormMode = "create" | "edit";

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
  readonly listLabels?:
    | ((query: ListLabelsQuery) => Promise<LabelsResponse>)
    | undefined;
  readonly mutationJournal?: DataPlaneMutationJournal | undefined;
  readonly organization: OrganizationSummary;
  readonly organizationRole?: OrganizationRole | undefined;
  readonly restoreLabelWithConfirmation?:
    | ((labelId: LabelIdType) => Promise<LabelWriteResponse>)
    | undefined;
  readonly state?: LabelsSettingsShellState | undefined;
  readonly updateLabelWithConfirmation?:
    | ((
        labelId: LabelIdType,
        input: UpdateLabelInput
      ) => Promise<LabelWriteResponse>)
    | undefined;
}

interface PendingLabelMutation {
  readonly id: string;
  readonly kind: LabelMutationKind;
  readonly labelId?: Label["id"] | undefined;
}

interface LabelMutationStatus {
  readonly message: string;
}

interface LabelCommandReflection {
  readonly archivedIds: ReadonlySet<Label["id"]>;
  readonly upserts: ReadonlyMap<Label["id"], Label>;
}

interface LabelFormState {
  readonly color: LabelColor;
  readonly description: string;
  readonly error: string | null;
  readonly label: Label | null;
  readonly mode: LabelFormMode;
  readonly name: string;
  readonly open: boolean;
}

interface ArchivedLabelsState {
  readonly error: string | null;
  readonly labels: readonly Label[];
  readonly status: "idle" | "loading" | "ready" | "unavailable";
}

const LABEL_COMMAND_COLLECTIONS = ["labels"] as const;
const EMPTY_LABEL_NAME_MESSAGE = "Type a label name before saving it.";
const INVALID_LABEL_NAME_MESSAGE =
  "Label names must be between 1 and 48 characters.";
const DUPLICATE_LABEL_NAME_MESSAGE = "A label with that name already exists.";
const INVALID_LABEL_DESCRIPTION_MESSAGE =
  "Descriptions must be 280 characters or fewer.";
const RESTORE_CONFLICT_MESSAGE =
  "Restore blocked because an active label already uses that name.";
const USAGE_PLACEHOLDER = "Coming next";
const LABEL_DATE_FORMATTER = new Intl.DateTimeFormat(undefined, {
  day: "numeric",
  month: "short",
  year: "numeric",
});

const decodeCreateLabelInput = Schema.decodeUnknownSync(CreateLabelInputSchema);
const decodeUpdateLabelInput = Schema.decodeUnknownSync(UpdateLabelInputSchema);

// oxlint-disable-next-line complexity -- The route owns one explicit UI state machine for active sync, archived API reads, drawer edits, and mutation feedback.
export function OrganizationLabelsSettingsPage({
  archiveLabelWithConfirmation = archiveDefaultLabelWithConfirmation,
  collectionState,
  createLabelWithConfirmation = createDefaultLabelWithConfirmation,
  listLabels = listDefaultLabels,
  mutationJournal,
  organization,
  organizationRole,
  restoreLabelWithConfirmation = restoreDefaultLabelWithConfirmation,
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
  const activeLabels = React.useMemo(
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
      labelCount: activeLabels.length,
    });
  const [activeView, setActiveView] = React.useState<LabelsView>("active");
  const [searchQuery, setSearchQuery] = React.useState("");
  const [archivedState, setArchivedState] = React.useState<ArchivedLabelsState>(
    {
      error: null,
      labels: [],
      status: "idle",
    }
  );
  const [formState, setFormState] = React.useState<LabelFormState>(
    createClosedLabelFormState
  );
  const [pendingMutation, setPendingMutation] =
    React.useState<PendingLabelMutation | null>(null);
  const [mutationStatus, setMutationStatus] =
    React.useState<LabelMutationStatus | null>(null);
  const mutationInFlightRef = React.useRef(false);
  const searchInputRef = React.useRef<HTMLInputElement>(null);
  const formNameRef = React.useRef<HTMLInputElement>(null);
  const canWriteActiveLabels =
    canManageLabels &&
    collection !== null &&
    (shellState === "ready" || shellState === "empty");
  const visibleLabels = React.useMemo(
    () =>
      searchSettingsLabels(
        activeView === "active" ? activeLabels : archivedState.labels,
        searchQuery
      ),
    [activeLabels, activeView, archivedState.labels, searchQuery]
  );
  const viewTotal =
    activeView === "active" ? activeLabels.length : archivedState.labels.length;
  const hasSearch = searchQuery.trim().length > 0;
  const refreshArchivedLabels = React.useCallback(async () => {
    if (!canManageLabels) {
      return;
    }

    setArchivedState((current) => ({
      ...current,
      error: null,
      status: current.status === "ready" ? "ready" : "loading",
    }));

    try {
      const response = await listLabels({ status: "archived" });
      setArchivedState({
        error: null,
        labels: sortLabelsByName(response.labels),
        status: "ready",
      });
    } catch {
      setArchivedState({
        error: "Archived labels could not be loaded.",
        labels: [],
        status: "unavailable",
      });
    }
  }, [canManageLabels, listLabels]);

  React.useEffect(() => {
    if (activeView === "archived" && archivedState.status === "idle") {
      void refreshArchivedLabels();
    }
  }, [activeView, archivedState.status, refreshArchivedLabels]);

  React.useEffect(() => {
    if (formState.open) {
      window.setTimeout(() => {
        formNameRef.current?.focus();
        formNameRef.current?.select();
      }, 0);
    }
  }, [formState.open]);

  const openCreateForm = React.useCallback(() => {
    if (!canWriteActiveLabels) {
      return;
    }

    setMutationStatus(null);
    setFormState({
      color: DEFAULT_LABEL_COLOR,
      description: "",
      error: null,
      label: null,
      mode: "create",
      name: "",
      open: true,
    });
  }, [canWriteActiveLabels]);

  const openEditForm = React.useCallback(
    (label: Label) => {
      if (!canWriteActiveLabels) {
        return;
      }

      setMutationStatus(null);
      setFormState({
        color: label.color,
        description: label.description ?? "",
        error: null,
        label,
        mode: "edit",
        name: label.name,
        open: true,
      });
    },
    [canWriteActiveLabels]
  );

  const closeForm = React.useCallback(() => {
    if (mutationInFlightRef.current) {
      return;
    }

    setFormState(createClosedLabelFormState());
  }, []);

  const setFormName = React.useCallback((name: string) => {
    setFormState((current) => ({ ...current, error: null, name }));
  }, []);
  const setFormDescription = React.useCallback((description: string) => {
    setFormState((current) => ({ ...current, description, error: null }));
  }, []);
  const setFormColor = React.useCallback((color: LabelColor) => {
    setFormState((current) => ({ ...current, color, error: null }));
  }, []);

  // oxlint-disable-next-line complexity -- Keeping create/edit validation and command journaling in one transaction avoids splitting the form flow across single-use helpers.
  const submitForm = React.useCallback(async () => {
    if (
      !canWriteActiveLabels ||
      !formState.open ||
      mutationInFlightRef.current
    ) {
      return;
    }

    const ignoreLabelId = formState.label?.id;
    const decodedName = validateSettingsLabelName(
      formState.name,
      activeLabels,
      ignoreLabelId
    );

    if (decodedName.kind === "error") {
      setFormState((current) => ({ ...current, error: decodedName.message }));
      return;
    }

    const decodedDescription = validateSettingsLabelDescription(
      formState.description
    );

    if (decodedDescription.kind === "error") {
      setFormState((current) => ({
        ...current,
        error: decodedDescription.message,
      }));
      return;
    }

    if (
      formState.mode === "edit" &&
      formState.label !== null &&
      decodedName.name === formState.label.name &&
      formState.color === formState.label.color &&
      decodedDescription.description === formState.label.description
    ) {
      closeForm();
      return;
    }

    const input =
      formState.mode === "create"
        ? createLabelInput(
            decodedName.name,
            formState.color,
            decodedDescription.description
          )
        : updateLabelInput(
            decodedName.name,
            formState.color,
            decodedDescription.description
          );
    const operationLabelId = formState.label?.id;
    const operationId =
      formState.mode === "create"
        ? `labels.create:${decodedName.name}`
        : `labels.update:${operationLabelId}`;

    setPendingMutation({
      id: operationId,
      kind: formState.mode === "create" ? "create" : "update",
      labelId: operationLabelId,
    });
    mutationInFlightRef.current = true;
    setMutationStatus(null);

    try {
      const response = await persistLabelCommandMutation({
        commandName:
          formState.mode === "create" ? "labels.create" : "labels.update",
        input:
          formState.mode === "create"
            ? input
            : { labelId: operationLabelId, ...input },
        journal: mutationJournal,
        operation: () =>
          formState.mode === "create"
            ? createLabelWithConfirmation(input as CreateLabelInput)
            : updateLabelWithConfirmation(
                operationLabelId as LabelIdType,
                input as UpdateLabelInput
              ),
      });

      reflectLabelUpsert(response.label);
      setFormState(createClosedLabelFormState());
      toast.success(
        formState.mode === "create" ? "Label created." : "Label updated."
      );
    } catch (error) {
      const message = getLabelMutationFailureMessage(
        error,
        formState.mode === "create" ? "create" : "update"
      );
      setFormState((current) => ({ ...current, error: message }));
      setMutationStatus({ message });
    } finally {
      mutationInFlightRef.current = false;
      setPendingMutation((current) =>
        current?.id === operationId ? null : current
      );
    }
  }, [
    activeLabels,
    canWriteActiveLabels,
    closeForm,
    createLabelWithConfirmation,
    formState,
    mutationJournal,
    reflectLabelUpsert,
    updateLabelWithConfirmation,
  ]);

  const archiveLabel = React.useCallback(
    async (label: Label) => {
      if (!canWriteActiveLabels || mutationInFlightRef.current) {
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
        const response = await persistLabelCommandMutation({
          commandName: "labels.archive",
          input: { labelId: label.id },
          journal: mutationJournal,
          operation: () => archiveLabelWithConfirmation(label.id),
        });
        const archivedLabel = ensureArchivedLabel(response.label);

        reflectLabelArchive(label.id);
        setArchivedState((current) =>
          current.status === "ready"
            ? {
                ...current,
                labels: sortLabelsByName([
                  archivedLabel,
                  ...current.labels.filter((item) => item.id !== label.id),
                ]),
              }
            : current
        );
        toast.success("Label archived.");
      } catch (error) {
        setMutationStatus({
          message: getLabelMutationFailureMessage(error, "archive"),
        });
      } finally {
        mutationInFlightRef.current = false;
        setPendingMutation((current) =>
          current?.id === operationId ? null : current
        );
      }
    },
    [
      archiveLabelWithConfirmation,
      canWriteActiveLabels,
      mutationJournal,
      reflectLabelArchive,
    ]
  );

  const requestArchiveConfirmation = React.useCallback(
    (label: Label) => {
      if (!canWriteActiveLabels || mutationInFlightRef.current) {
        return;
      }

      toast("Archive label?", {
        action: {
          label: "Archive label",
          onClick: () => {
            void archiveLabel(label);
          },
        },
        description: `${label.name} will leave active management views. Existing assignments stay on jobs and sites.`,
      });
    },
    [archiveLabel, canWriteActiveLabels]
  );

  const restoreLabel = React.useCallback(
    async (label: Label) => {
      if (!canManageLabels || mutationInFlightRef.current) {
        return;
      }

      if (hasDuplicateLabelName(activeLabels, label.name)) {
        setMutationStatus({
          message: RESTORE_CONFLICT_MESSAGE,
        });
        return;
      }

      const operationId = `labels.restore:${label.id}`;
      setPendingMutation({
        id: operationId,
        kind: "restore",
        labelId: label.id,
      });
      mutationInFlightRef.current = true;
      setMutationStatus(null);

      try {
        const response = await persistLabelCommandMutation({
          commandName: "labels.restore",
          input: { labelId: label.id },
          journal: mutationJournal,
          operation: () => restoreLabelWithConfirmation(label.id),
        });

        reflectLabelUpsert(response.label);
        setArchivedState((current) => ({
          ...current,
          labels: current.labels.filter((item) => item.id !== label.id),
        }));
        toast.success("Label restored.");
      } catch (error) {
        setMutationStatus({
          message: getLabelMutationFailureMessage(error, "restore"),
        });
        void refreshArchivedLabels();
      } finally {
        mutationInFlightRef.current = false;
        setPendingMutation((current) =>
          current?.id === operationId ? null : current
        );
      }
    },
    [
      activeLabels,
      canManageLabels,
      mutationJournal,
      reflectLabelUpsert,
      refreshArchivedLabels,
      restoreLabelWithConfirmation,
    ]
  );

  useLabelsSettingsHotkeys({
    canManageLabels,
    canWriteActiveLabels,
    closeForm,
    formOpen: formState.open,
    openCreateForm,
    searchInputRef,
    submitForm,
  });

  return (
    <main className="flex flex-1 flex-col gap-5 p-4 sm:gap-6 sm:p-6 lg:p-8">
      <AppPageHeader
        eyebrow={organization.name}
        title="Labels"
        description="Manage organization taxonomy for jobs, sites, and future work."
        className="border-b-0 pb-0"
        actions={
          <a className={buttonVariants()} href="/organization/settings">
            Organization settings
            <ArrowRight aria-hidden="true" />
          </a>
        }
      />

      <div className="flex max-w-6xl flex-col gap-5">
        <AppUtilityPanel
          id="organization-labels-management"
          title="Label library"
          description="Active labels are available to product workflows. Archived labels remain available for history and restore."
        >
          <Tabs
            value={activeView}
            onValueChange={(value) => {
              if (value === "active" || value === "archived") {
                setActiveView(value);
              }
            }}
            className="gap-4"
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="no-scrollbar overflow-x-auto">
                <TabsList aria-label="Label views">
                  <TabsTrigger value="active">Active</TabsTrigger>
                  <TabsTrigger value="archived">Archived</TabsTrigger>
                </TabsList>
              </div>
              {canManageLabels ? (
                <Button
                  type="button"
                  disabled={!canWriteActiveLabels}
                  onClick={openCreateForm}
                >
                  <Plus aria-hidden="true" />
                  New label
                  <ShortcutHint
                    decorative
                    hotkey={HOTKEYS.labelsSettingsCreate.hotkey}
                    label={HOTKEYS.labelsSettingsCreate.label}
                  />
                </Button>
              ) : null}
            </div>

            {canManageLabels ? (
              <LabelsSearchField
                disabled={
                  activeView === "active"
                    ? shellState === "unavailable"
                    : archivedState.status === "unavailable"
                }
                inputRef={searchInputRef}
                resultCount={visibleLabels.length}
                searchQuery={searchQuery}
                totalCount={viewTotal}
                view={activeView}
                onSearchQueryChange={setSearchQuery}
              />
            ) : null}

            <TabsContent value="active" keepMounted>
              <LabelsStateView
                canWriteLabels={canWriteActiveLabels}
                hasCommandReflection={hasCommandReflection}
                hasSearch={hasSearch}
                labels={activeView === "active" ? visibleLabels : []}
                pendingMutation={pendingMutation}
                searchQuery={searchQuery}
                state={shellState}
                view="active"
                onArchive={requestArchiveConfirmation}
                onEdit={openEditForm}
              />
            </TabsContent>
            <TabsContent value="archived" keepMounted>
              <ArchivedLabelsStateView
                canManageLabels={canManageLabels}
                hasSearch={hasSearch}
                labels={activeView === "archived" ? visibleLabels : []}
                pendingMutation={pendingMutation}
                searchQuery={searchQuery}
                state={archivedState}
                onRefresh={() => void refreshArchivedLabels()}
                onRestore={(label) => void restoreLabel(label)}
              />
            </TabsContent>
          </Tabs>

          <LabelMutationStatusView status={mutationStatus} />
        </AppUtilityPanel>
      </div>

      <LabelFormDrawer
        form={formState}
        nameRef={formNameRef}
        pending={
          pendingMutation?.kind === "create" ||
          pendingMutation?.kind === "update"
        }
        onClose={closeForm}
        onColorChange={setFormColor}
        onDescriptionChange={setFormDescription}
        onNameChange={setFormName}
        onSubmit={() => void submitForm()}
      />
    </main>
  );
}

function useLabelsSettingsHotkeys({
  canManageLabels,
  canWriteActiveLabels,
  closeForm,
  formOpen,
  openCreateForm,
  searchInputRef,
  submitForm,
}: {
  readonly canManageLabels: boolean;
  readonly canWriteActiveLabels: boolean;
  readonly closeForm: () => void;
  readonly formOpen: boolean;
  readonly openCreateForm: () => void;
  readonly searchInputRef: React.RefObject<HTMLInputElement | null>;
  readonly submitForm: () => Promise<void>;
}) {
  useAppHotkey(
    "labelsSettingsSearch",
    () => {
      searchInputRef.current?.focus();
    },
    { enabled: canManageLabels, ignoreInputs: true }
  );

  useAppHotkey("labelsSettingsCreate", openCreateForm, {
    enabled: canWriteActiveLabels && !formOpen,
    ignoreInputs: true,
  });

  useAppHotkey(
    "labelsSettingsSubmit",
    () => {
      void submitForm();
    },
    { enabled: canWriteActiveLabels && formOpen, ignoreInputs: false }
  );

  useAppHotkey("labelsSettingsCancel", closeForm, {
    enabled: formOpen,
    ignoreInputs: false,
  });
}

function LabelsSearchField({
  disabled,
  inputRef,
  onSearchQueryChange,
  resultCount,
  searchQuery,
  totalCount,
  view,
}: {
  readonly disabled: boolean;
  readonly inputRef: React.RefObject<HTMLInputElement | null>;
  readonly onSearchQueryChange: (query: string) => void;
  readonly resultCount: number;
  readonly searchQuery: string;
  readonly totalCount: number;
  readonly view: LabelsView;
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
          autoComplete="off"
          className="pr-20 pl-9"
          disabled={disabled}
          name="label-search"
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
          : `${totalCount} ${view} labels`}
      </p>
    </div>
  );
}

function LabelsStateView({
  canWriteLabels,
  hasCommandReflection,
  hasSearch,
  labels,
  onArchive,
  onEdit,
  pendingMutation,
  searchQuery,
  state,
  view,
}: {
  readonly canWriteLabels: boolean;
  readonly hasCommandReflection: boolean;
  readonly hasSearch: boolean;
  readonly labels: readonly Label[];
  readonly onArchive: (label: Label) => void;
  readonly onEdit: (label: Label) => void;
  readonly pendingMutation: PendingLabelMutation | null;
  readonly searchQuery: string;
  readonly state: LabelsSettingsShellState;
  readonly view: LabelsView;
}) {
  if (labels.length === 0 && !hasSearch && hasCommandReflection) {
    return <LabelsEmptyNotice view={view} />;
  }

  switch (state) {
    case "connecting": {
      return <LabelsLoadingSkeleton />;
    }
    case "empty": {
      return <LabelsEmptyNotice view={view} />;
    }
    case "unavailable": {
      return (
        <ShellNotice
          icon={<RadioTower aria-hidden="true" />}
          title="Labels unavailable"
          description="Active labels could not be loaded from realtime sync."
        />
      );
    }
    case "permission-aware": {
      return (
        <ShellNotice
          icon={<ShieldAlert aria-hidden="true" />}
          title="Admin label management"
          description="Owners and admins can manage organization labels."
        />
      );
    }
    case "ready": {
      if (labels.length === 0) {
        return hasSearch ? (
          <NoMatchingLabelsNotice query={searchQuery} view={view} />
        ) : (
          <LabelsEmptyNotice view={view} />
        );
      }

      return (
        <LabelsTable
          canWriteLabels={canWriteLabels}
          labels={labels}
          pendingMutation={pendingMutation}
          view="active"
          onArchive={onArchive}
          onEdit={onEdit}
        />
      );
    }
    default: {
      state satisfies never;
      return null;
    }
  }
}

function ArchivedLabelsStateView({
  canManageLabels,
  hasSearch,
  labels,
  onRefresh,
  onRestore,
  pendingMutation,
  searchQuery,
  state,
}: {
  readonly canManageLabels: boolean;
  readonly hasSearch: boolean;
  readonly labels: readonly Label[];
  readonly onRefresh: () => void;
  readonly onRestore: (label: Label) => void;
  readonly pendingMutation: PendingLabelMutation | null;
  readonly searchQuery: string;
  readonly state: ArchivedLabelsState;
}) {
  if (!canManageLabels) {
    return (
      <ShellNotice
        icon={<ShieldAlert aria-hidden="true" />}
        title="Admin label management"
        description="Owners and admins can manage organization labels."
      />
    );
  }

  if (state.status === "idle" || state.status === "loading") {
    return <LabelsLoadingSkeleton label="Loading archived labels" />;
  }

  if (state.status === "unavailable") {
    return (
      <ShellNotice
        icon={<RadioTower aria-hidden="true" />}
        title="Archived labels unavailable"
        description={state.error ?? "Archived labels could not be loaded."}
        action={
          <Button type="button" variant="outline" onClick={onRefresh}>
            Refresh
          </Button>
        }
      />
    );
  }

  if (labels.length === 0) {
    return hasSearch ? (
      <NoMatchingLabelsNotice query={searchQuery} view="archived" />
    ) : (
      <LabelsEmptyNotice view="archived" />
    );
  }

  return (
    <LabelsTable
      canWriteLabels
      labels={labels}
      pendingMutation={pendingMutation}
      view="archived"
      onRestore={onRestore}
    />
  );
}

function LabelsTable({
  canWriteLabels,
  labels,
  onArchive,
  onEdit,
  onRestore,
  pendingMutation,
  view,
}: {
  readonly canWriteLabels: boolean;
  readonly labels: readonly Label[];
  readonly onArchive?: ((label: Label) => void) | undefined;
  readonly onEdit?: ((label: Label) => void) | undefined;
  readonly onRestore?: ((label: Label) => void) | undefined;
  readonly pendingMutation: PendingLabelMutation | null;
  readonly view: LabelsView;
}) {
  return (
    <div
      className="overflow-x-auto rounded-lg border border-border/70"
      data-testid="labels-table-scroll"
    >
      <Table className="min-w-[760px]">
        <TableHeader>
          <TableRow className="bg-muted/40 hover:bg-muted/40">
            <TableHead className="w-[32%]">Label</TableHead>
            <TableHead className="w-[30%]">Description</TableHead>
            <TableHead>Jobs</TableHead>
            <TableHead>Sites</TableHead>
            <TableHead>Created</TableHead>
            <TableHead className="w-12 text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {labels.map((label) => (
            <LabelTableRow
              canWriteLabels={canWriteLabels}
              key={label.id}
              label={label}
              pendingMutation={pendingMutation}
              view={view}
              onArchive={onArchive}
              onEdit={onEdit}
              onRestore={onRestore}
            />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function LabelTableRow({
  canWriteLabels,
  label,
  onArchive,
  onEdit,
  onRestore,
  pendingMutation,
  view,
}: {
  readonly canWriteLabels: boolean;
  readonly label: Label;
  readonly onArchive?: ((label: Label) => void) | undefined;
  readonly onEdit?: ((label: Label) => void) | undefined;
  readonly onRestore?: ((label: Label) => void) | undefined;
  readonly pendingMutation: PendingLabelMutation | null;
  readonly view: LabelsView;
}) {
  const rowPending = pendingMutation?.labelId === label.id;
  const actionsDisabled = pendingMutation !== null || !canWriteLabels;

  return (
    <TableRow className="group/label-row bg-background">
      <TableCell className="max-w-0">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className={cn(
              "size-3 shrink-0 rounded-full border border-black/15",
              view === "archived" ? "opacity-55 grayscale" : undefined
            )}
            style={{ backgroundColor: label.color }}
            aria-hidden="true"
          />
          <div className="min-w-0">
            <p className="truncate font-medium text-foreground">{label.name}</p>
            {view === "archived" ? (
              <Badge variant="outline" className="mt-1">
                Archived
              </Badge>
            ) : null}
          </div>
        </div>
      </TableCell>
      <TableCell className="max-w-[18rem] text-muted-foreground">
        <span className="block truncate">
          {label.description ?? "No description"}
        </span>
      </TableCell>
      <TableCell>
        <UsagePlaceholder />
      </TableCell>
      <TableCell>
        <UsagePlaceholder />
      </TableCell>
      <TableCell className="text-muted-foreground">
        {formatLabelDate(label.createdAt)}
      </TableCell>
      <TableCell className="text-right">
        {rowPending ? (
          <Loader2
            className="ml-auto size-4 animate-spin text-muted-foreground"
            aria-label="Label mutation pending"
          />
        ) : (
          <LabelRowActions
            actionsDisabled={actionsDisabled}
            label={label}
            view={view}
            onArchive={onArchive}
            onEdit={onEdit}
            onRestore={onRestore}
          />
        )}
      </TableCell>
    </TableRow>
  );
}

function LabelRowActions({
  actionsDisabled,
  label,
  onArchive,
  onEdit,
  onRestore,
  view,
}: {
  readonly actionsDisabled: boolean;
  readonly label: Label;
  readonly onArchive?: ((label: Label) => void) | undefined;
  readonly onEdit?: ((label: Label) => void) | undefined;
  readonly onRestore?: ((label: Label) => void) | undefined;
  readonly view: LabelsView;
}) {
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
                  className="pointer-events-auto opacity-100 transition-opacity focus-visible:pointer-events-auto focus-visible:opacity-100 sm:pointer-events-none sm:opacity-0 sm:group-focus-within/label-row:pointer-events-auto sm:group-focus-within/label-row:opacity-100 sm:group-hover/label-row:pointer-events-auto sm:group-hover/label-row:opacity-100"
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
        {view === "active" ? (
          <React.Fragment>
            <DropdownMenuItem
              disabled={actionsDisabled}
              onClick={() => onEdit?.(label)}
            >
              <Pencil aria-hidden="true" />
              Edit label
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              disabled={actionsDisabled}
              variant="destructive"
              onClick={() => onArchive?.(label)}
            >
              <Archive aria-hidden="true" />
              Archive label
            </DropdownMenuItem>
          </React.Fragment>
        ) : (
          <DropdownMenuItem
            disabled={actionsDisabled}
            onClick={() => onRestore?.(label)}
          >
            <RotateCcw aria-hidden="true" />
            Restore label
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function LabelFormDrawer({
  form,
  nameRef,
  onClose,
  onColorChange,
  onDescriptionChange,
  onNameChange,
  onSubmit,
  pending,
}: {
  readonly form: LabelFormState;
  readonly nameRef: React.RefObject<HTMLInputElement | null>;
  readonly onClose: () => void;
  readonly onColorChange: (color: LabelColor) => void;
  readonly onDescriptionChange: (description: string) => void;
  readonly onNameChange: (name: string) => void;
  readonly onSubmit: () => void;
  readonly pending: boolean;
}) {
  const title = form.mode === "create" ? "New label" : "Edit label";

  return (
    <ResponsiveDrawer open={form.open} onOpenChange={ignoreDrawerOpenChange}>
      <DrawerContent className="max-h-[92vh] overflow-hidden p-0 data-[vaul-drawer-direction=bottom]:min-h-[70vh] data-[vaul-drawer-direction=right]:inset-y-0 data-[vaul-drawer-direction=right]:right-0 data-[vaul-drawer-direction=right]:h-full data-[vaul-drawer-direction=right]:max-h-none data-[vaul-drawer-direction=right]:sm:max-w-lg">
        <DrawerHeader className="shrink-0 border-b px-5 py-4 text-left md:px-6">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <DrawerTitle>{title}</DrawerTitle>
              <DrawerDescription>
                Name, description, and color are shared by product surfaces.
              </DrawerDescription>
            </div>
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              aria-label="Close label drawer"
              disabled={pending}
              onClick={onClose}
            >
              <X aria-hidden="true" />
            </Button>
          </div>
        </DrawerHeader>
        <form
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit();
          }}
        >
          <div className="grid min-h-0 flex-1 content-start gap-5 overflow-y-auto px-5 py-5 md:px-6">
            {form.error ? (
              <Alert variant="destructive">
                <AlertTitle>Label not saved</AlertTitle>
                <AlertDescription>{form.error}</AlertDescription>
              </Alert>
            ) : null}
            <Field>
              <FieldLabel htmlFor="label-form-name">Name</FieldLabel>
              <div className="relative min-w-0">
                <LabelColorPicker
                  className="absolute top-0 left-0 z-10 size-9 rounded-r-none border-r border-border bg-background hover:bg-muted aria-expanded:bg-muted"
                  disabled={pending}
                  label="Label color"
                  value={form.color}
                  onChange={onColorChange}
                />
                <Input
                  id="label-form-name"
                  ref={nameRef}
                  autoComplete="off"
                  className="pl-12"
                  disabled={pending}
                  name="label-name"
                  value={form.name}
                  onChange={(event) => onNameChange(event.currentTarget.value)}
                />
              </div>
              <FieldError />
            </Field>
            <Field>
              <FieldLabel htmlFor="label-form-description">
                Description
              </FieldLabel>
              <Textarea
                id="label-form-description"
                autoComplete="off"
                className="min-h-28 resize-none"
                disabled={pending}
                name="label-description"
                value={form.description}
                onChange={(event) =>
                  onDescriptionChange(event.currentTarget.value)
                }
              />
            </Field>
          </div>
          <DrawerFooter className="shrink-0 flex-col-reverse gap-2 border-t px-5 py-4 sm:flex-row sm:justify-end md:px-6">
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={onClose}
            >
              Cancel
              <ShortcutHint
                decorative
                hotkey={HOTKEYS.labelsSettingsCancel.hotkey}
                label={HOTKEYS.labelsSettingsCancel.label}
              />
            </Button>
            <Button type="button" disabled={pending} onClick={onSubmit}>
              {pending ? (
                <Loader2 className="animate-spin" aria-hidden="true" />
              ) : (
                <Check aria-hidden="true" />
              )}
              Save label
              <ShortcutHint
                decorative
                hotkey={HOTKEYS.labelsSettingsSubmit.hotkey}
                label={HOTKEYS.labelsSettingsSubmit.label}
              />
            </Button>
          </DrawerFooter>
        </form>
      </DrawerContent>
    </ResponsiveDrawer>
  );
}

function UsagePlaceholder() {
  return (
    <Badge variant="outline" className="text-muted-foreground">
      {USAGE_PLACEHOLDER}
    </Badge>
  );
}

function ignoreDrawerOpenChange(open: boolean) {
  void open;
}

function LabelsEmptyNotice({ view }: { readonly view: LabelsView }) {
  return (
    <ShellNotice
      icon={<CheckCircle2 aria-hidden="true" />}
      title={view === "active" ? "No active labels yet" : "No archived labels"}
      description={
        view === "active"
          ? "Create a label to keep shared work categories consistent."
          : "Archived labels will appear here after admins archive them."
      }
    />
  );
}

function NoMatchingLabelsNotice({
  query,
  view,
}: {
  readonly query: string;
  readonly view: LabelsView;
}) {
  return (
    <ShellNotice
      icon={<Slash aria-hidden="true" />}
      title="No matching labels"
      description={`No ${view} labels match "${query.trim()}".`}
    />
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
      className="mt-4 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
      role="alert"
    >
      {status.message}
    </p>
  );
}

function LabelsLoadingSkeleton({
  label = "Loading labels",
}: {
  readonly label?: string | undefined;
}) {
  return (
    <div
      className="grid gap-3 rounded-lg border border-border/60 p-4"
      aria-busy="true"
      aria-label={label}
    >
      <div className="h-4 w-36 rounded bg-muted" />
      <div className="h-3 w-full max-w-lg rounded bg-muted/70" />
      <div className="h-3 w-4/5 max-w-md rounded bg-muted/70" />
    </div>
  );
}

function ShellNotice({
  action,
  description,
  icon,
  title,
}: {
  readonly action?: React.ReactNode | undefined;
  readonly description: string;
  readonly icon: React.ReactNode;
  readonly title: string;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border/60 p-4 sm:flex-row sm:items-start">
      <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        {icon}
      </div>
      <div className="min-w-0 flex-1 space-y-1">
        <h3 className="text-sm font-medium text-foreground">{title}</h3>
        <p className="max-w-[64ch] text-sm/6 text-muted-foreground">
          {description}
        </p>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
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

  if (
    !health ||
    health.status === "connecting" ||
    health.disabledReason === "server-render"
  ) {
    return "connecting";
  }

  if (health.status === "ready") {
    return labelCount === 0 ? "empty" : "ready";
  }

  return "unavailable";
}

function createClosedLabelFormState(): LabelFormState {
  return {
    color: DEFAULT_LABEL_COLOR,
    description: "",
    error: null,
    label: null,
    mode: "create",
    name: "",
    open: false,
  };
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
  name: Label["name"],
  color: LabelColor,
  description: string | null
): UpdateLabelInput {
  return decodeUpdateLabelInput({
    color,
    description: normalizeLabelDescription(description),
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

function restoreDefaultLabelWithConfirmation(labelId: LabelIdType) {
  return Effect.runPromise(restoreBrowserLabelWithConfirmation(labelId));
}

function listDefaultLabels(query: ListLabelsQuery) {
  return Effect.runPromise(listBrowserLabels(query));
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

  if (tag === "@ceird/labels-core/LabelRestoreConflictError") {
    return RESTORE_CONFLICT_MESSAGE;
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

  if (operation === "restore") {
    return "Could not restore the label. Try again after archived labels refresh.";
  }

  if (operation === "update") {
    return "Could not update the label. The active label list was restored.";
  }

  return "Could not create the label. The pending row was removed.";
}

function ensureArchivedLabel(label: Label): Label {
  return label.archivedAt === null
    ? { ...label, archivedAt: new Date().toISOString() }
    : label;
}

function formatLabelDate(value: string) {
  return LABEL_DATE_FORMATTER.format(new Date(value));
}
