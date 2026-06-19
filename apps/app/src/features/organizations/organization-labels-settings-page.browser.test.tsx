import { decodeOrganizationSummary } from "@ceird/identity-core";
import type {
  CreateLabelInput,
  Label,
  LabelsResponse,
  LabelWriteResponse,
  ListLabelsQuery,
  UpdateLabelInput,
} from "@ceird/labels-core";
import { HotkeysProvider } from "@tanstack/react-hotkeys";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";

import { Toaster } from "#/components/ui/sonner";
import { TooltipProvider } from "#/components/ui/tooltip";
import { createDataPlaneCollectionHealth } from "#/data-plane/collection-health";
import type {
  DataPlaneCollectionHealth,
  DataPlaneCollectionHealthStatus,
} from "#/data-plane/collection-health";
import { createDataPlaneMutationJournal } from "#/data-plane/mutation-journal";

import { OrganizationLabelsSettingsPage } from "./organization-labels-settings-page";

type LabelsPageState = Parameters<
  typeof OrganizationLabelsSettingsPage
>[0]["state"];

const TEST_ORGANIZATION = decodeOrganizationSummary({
  id: "org_123",
  name: "Acme Field Ops",
  slug: "acme-field-ops",
});

const urgentLabel = makeLabel({
  description: "Escalated work orders",
  id: "11111111-1111-4111-8111-111111111111",
  name: "Urgent",
});
const electricalLabel = makeLabel({
  description: "Panels and lighting",
  id: "22222222-2222-4222-8222-222222222222",
  name: "Electrical",
});
const archivedLabel = makeLabel({
  archivedAt: "2026-06-18T10:00:00.000Z",
  description: "Legacy plumbing category",
  id: "33333333-3333-4333-8333-333333333333",
  name: "Plumbing",
});
const DEFAULT_LABEL_USAGE_COUNTS = new Map<
  Label["id"],
  {
    readonly jobs: number;
    readonly sites: number;
  }
>([
  [urgentLabel.id, { jobs: 2, sites: 1 }],
  [electricalLabel.id, { jobs: 0, sites: 0 }],
  [archivedLabel.id, { jobs: 3, sites: 0 }],
]);

describe("organization labels settings page", () => {
  afterEach(() => {
    toast.dismiss();
    vi.restoreAllMocks();
  });

  it("renders a first-class active labels table with settings context", async () => {
    renderLabelsPage({
      collectionState: makeCollectionState({
        labels: [urgentLabel, electricalLabel],
        status: "ready",
      }),
    });

    expect(screen.getByRole("heading", { name: "Labels" })).toBeVisible();
    expect(screen.getByText("Organization settings")).toBeVisible();
    expect(screen.getByRole("tab", { name: "Active" })).toHaveAttribute(
      "aria-selected",
      "true"
    );
    expect(screen.getByRole("columnheader", { name: "Jobs" })).toBeVisible();
    expect(screen.getByRole("columnheader", { name: "Sites" })).toBeVisible();
    expect(
      screen.queryByRole("columnheader", { name: "Created" })
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /view 2 jobs using urgent/i })
    ).toHaveAttribute(
      "href",
      "/jobs?labelId=11111111-1111-4111-8111-111111111111"
    );
    expect(
      screen.getByRole("link", { name: /view 1 sites using urgent/i })
    ).toHaveAttribute(
      "href",
      "/sites?labelId=11111111-1111-4111-8111-111111111111"
    );
    expect(screen.getAllByText("0")).toHaveLength(2);
    expect(screen.getByText("2 active labels")).toBeVisible();
    await expect(
      screen.findByRole("button", {
        name: /open actions for electrical/i,
      })
    ).resolves.toBeVisible();
  });

  it("keeps the labels table scrollable in a constrained mobile width", async () => {
    const { container } = renderLabelsPage({
      collectionState: makeCollectionState({
        labels: [urgentLabel, electricalLabel],
        status: "ready",
      }),
    });
    container.style.width = "360px";

    const scrollRegion = await screen.findByTestId("labels-table-scroll");

    expect(screen.getByRole("table")).toBeVisible();
    expect(scrollRegion.scrollWidth).toBeGreaterThan(scrollRegion.clientWidth);
  });

  it("loads archived labels behind the Archived tab", async () => {
    const listLabels = vi.fn<
      (query: ListLabelsQuery) => Promise<LabelsResponse>
    >(() => Promise.resolve({ labels: [archivedLabel] }));
    const user = userEvent.setup();

    renderLabelsPage({
      collectionState: makeCollectionState({
        labels: [urgentLabel],
        status: "ready",
      }),
      listLabels,
    });

    await user.click(screen.getByRole("tab", { name: "Archived" }));

    expect(listLabels).toHaveBeenCalledWith({ status: "archived" });
    await expect(screen.findByText("Plumbing")).resolves.toBeVisible();
    expect(screen.getByText("Legacy plumbing category")).toBeVisible();
    expect(
      screen.getByRole("link", { name: /view 3 jobs using plumbing/i })
    ).toHaveAttribute(
      "href",
      "/jobs?labelId=33333333-3333-4333-8333-333333333333"
    );
    expect(screen.getByText("1 archived labels")).toBeVisible();
    expect(
      screen.getByRole("button", { name: /open actions for plumbing/i })
    ).toBeVisible();
  });

  it("searches the current view by label name and description", async () => {
    const user = userEvent.setup();

    renderLabelsPage({
      collectionState: makeCollectionState({
        labels: [urgentLabel, electricalLabel],
        status: "ready",
      }),
    });

    await user.type(
      screen.getByRole("textbox", { name: /search labels/i }),
      "lighting"
    );

    expect(screen.getByText("Electrical")).toBeVisible();
    expect(screen.queryByText("Urgent")).not.toBeInTheDocument();
    expect(screen.getByText("1 of 2 labels")).toBeVisible();
  });

  it("keeps long descriptions constrained and exposes the full text in a tooltip", async () => {
    const user = userEvent.setup();
    const longDescription =
      "High-priority environmental access constraints that should remain readable on demand without taking over the row.";
    const longDescriptionLabel = makeLabel({
      description: longDescription,
      id: "55555555-5555-4555-8555-555555555555",
      name: "Environmental access review",
    });

    const { container } = renderLabelsPage({
      collectionState: makeCollectionState({
        labels: [longDescriptionLabel],
        status: "ready",
      }),
    });
    container.style.width = "360px";

    expect(screen.getByRole("button", { name: longDescription })).toBeVisible();
    await user.hover(screen.getByRole("button", { name: longDescription }));

    await waitFor(() => {
      expect(screen.getAllByText(longDescription)).toHaveLength(2);
    });
  });

  it("creates labels from the responsive drawer with description and color", async () => {
    const user = userEvent.setup();
    const toastSuccess = vi.spyOn(toast, "success");
    const mutationJournal = createDataPlaneMutationJournal({
      createId: () => "mutation_create",
      now: () => 1000,
    });
    const createLabelWithConfirmation = vi.fn<
      (input: CreateLabelInput) => Promise<LabelWriteResponse>
    >((input) =>
      Promise.resolve(
        makeLabelWriteResponse(
          makeLabel({
            description: input.description,
            id: "44444444-4444-4444-8444-444444444444",
            name: input.name,
          }),
          123
        )
      )
    );

    renderLabelsPage({
      collectionState: makeCollectionState({ labels: [], status: "ready" }),
      createLabelWithConfirmation,
      mutationJournal,
    });

    await user.click(screen.getByRole("button", { name: /new label/i }));
    const dialog = screen.getByRole("dialog", { name: "New label" });
    await user.click(
      within(dialog).getByRole("button", { name: /choose label color/i })
    );
    await user.click(await screen.findByRole("radio", { name: /blue/i }));
    await user.type(
      within(dialog).getByRole("textbox", { name: "Name" }),
      "Fire Safety"
    );
    await user.type(
      within(dialog).getByRole("textbox", { name: "Description" }),
      "Annual fire checks"
    );
    await user.click(
      within(dialog).getByRole("button", { name: /save label/i })
    );

    expect(createLabelWithConfirmation).toHaveBeenCalledWith({
      color: "oklch(63% 0.18 255)",
      description: "Annual fire checks",
      name: "Fire Safety",
    });
    expect(mutationJournal.entries()).toMatchObject([
      {
        affectedCollections: ["labels"],
        commandName: "labels.create",
        status: "success",
      },
    ]);
    await expect(screen.findByText("Fire Safety")).resolves.toBeVisible();
    expect(screen.getByText("Annual fire checks")).toBeVisible();
    expect(toastSuccess).toHaveBeenCalledWith("Label created.");
  });

  it("edits labels from the shared drawer model", async () => {
    const user = userEvent.setup();
    const toastSuccess = vi.spyOn(toast, "success");
    const updateLabelWithConfirmation = vi.fn<
      (
        labelId: Label["id"],
        input: UpdateLabelInput
      ) => Promise<LabelWriteResponse>
    >((labelId, input) =>
      Promise.resolve(
        makeLabelWriteResponse(
          makeLabel({
            description: input.description,
            id: labelId,
            name: input.name,
          }),
          124
        )
      )
    );

    renderLabelsPage({
      collectionState: makeCollectionState({
        labels: [urgentLabel],
        status: "ready",
      }),
      updateLabelWithConfirmation,
    });

    await openRowAction(user, "Urgent", "Edit label");
    const dialog = screen.getByRole("dialog", { name: "Edit label" });
    await user.clear(within(dialog).getByRole("textbox", { name: "Name" }));
    await user.type(
      within(dialog).getByRole("textbox", { name: "Name" }),
      "Emergency"
    );
    await user.clear(
      within(dialog).getByRole("textbox", { name: "Description" })
    );
    await user.type(
      within(dialog).getByRole("textbox", { name: "Description" }),
      "Dispatch first"
    );
    await user.click(
      within(dialog).getByRole("button", { name: /save label/i })
    );

    expect(updateLabelWithConfirmation).toHaveBeenCalledWith(urgentLabel.id, {
      color: "oklch(64% 0.19 28)",
      description: "Dispatch first",
      name: "Emergency",
    });
    await expect(screen.findByText("Emergency")).resolves.toBeVisible();
    expect(screen.getByText("Dispatch first")).toBeVisible();
    expect(toastSuccess).toHaveBeenCalledWith("Label updated.");
  });

  it("archives one active label after confirmation", async () => {
    const user = userEvent.setup();
    const toastSuccess = vi.spyOn(toast, "success");
    const mutationJournal = createDataPlaneMutationJournal({
      createId: () => "mutation_archive",
      now: () => 1000,
    });
    const archiveLabelWithConfirmation = vi.fn<
      (labelId: Label["id"]) => Promise<LabelWriteResponse>
    >((_labelId) =>
      Promise.resolve(
        makeLabelWriteResponse(
          { ...urgentLabel, archivedAt: "2026-06-18T10:00:00.000Z" },
          125
        )
      )
    );

    renderLabelsPage({
      archiveLabelWithConfirmation,
      collectionState: makeCollectionState({
        labels: [urgentLabel],
        status: "ready",
      }),
      mutationJournal,
    });

    await openRowAction(user, "Urgent", "Archive label");
    await screen.findByText("Archive label?");
    await user.click(screen.getByRole("button", { name: /archive label/i }));

    expect(archiveLabelWithConfirmation).toHaveBeenCalledWith(urgentLabel.id);
    expect(mutationJournal.entries()).toMatchObject([
      {
        affectedCollections: ["labels"],
        commandName: "labels.archive",
        status: "success",
      },
    ]);
    await waitFor(() => {
      expect(screen.queryByText("Urgent")).not.toBeInTheDocument();
    });
    expect(screen.getByText("No active labels yet")).toBeVisible();
    expect(toastSuccess).toHaveBeenCalledWith("Label archived.");
  });

  it("restores one archived label and reflects it in Active", async () => {
    const user = userEvent.setup();
    const toastSuccess = vi.spyOn(toast, "success");
    const mutationJournal = createDataPlaneMutationJournal({
      createId: () => "mutation_restore",
      now: () => 1000,
    });
    const restoreLabelWithConfirmation = vi.fn<
      (labelId: Label["id"]) => Promise<LabelWriteResponse>
    >((_labelId) =>
      Promise.resolve(
        makeLabelWriteResponse({ ...archivedLabel, archivedAt: null }, 126)
      )
    );

    renderLabelsPage({
      collectionState: makeCollectionState({ labels: [], status: "ready" }),
      listLabels: () => Promise.resolve({ labels: [archivedLabel] }),
      mutationJournal,
      restoreLabelWithConfirmation,
    });

    await user.click(screen.getByRole("tab", { name: "Archived" }));
    await screen.findByText("Plumbing");
    await openRowAction(user, "Plumbing", "Restore label");

    expect(restoreLabelWithConfirmation).toHaveBeenCalledWith(archivedLabel.id);
    expect(mutationJournal.entries()).toMatchObject([
      {
        affectedCollections: ["labels"],
        commandName: "labels.restore",
        status: "success",
      },
    ]);
    await waitFor(() => {
      expect(screen.queryByText("Plumbing")).not.toBeInTheDocument();
    });
    await user.click(screen.getByRole("tab", { name: "Active" }));
    expect(screen.getByText("Plumbing")).toBeVisible();
    expect(toastSuccess).toHaveBeenCalledWith("Label restored.");
  });

  it("surfaces active-name restore conflicts clearly", async () => {
    const user = userEvent.setup();
    const conflictingArchivedLabel = {
      ...archivedLabel,
      name: urgentLabel.name,
    };

    renderLabelsPage({
      collectionState: makeCollectionState({
        labels: [urgentLabel],
        status: "ready",
      }),
      listLabels: () => Promise.resolve({ labels: [conflictingArchivedLabel] }),
    });

    await user.click(screen.getByRole("tab", { name: "Archived" }));
    await screen.findByText("Urgent");
    await openRowAction(user, "Urgent", "Restore label");

    await expect(screen.findByRole("alert")).resolves.toHaveTextContent(
      "Restore blocked because an active label already uses that name."
    );
  });

  it("surfaces server-side restore conflicts and keeps archived labels visible", async () => {
    const user = userEvent.setup();
    const mutationJournal = createDataPlaneMutationJournal({
      createId: () => "mutation_restore_conflict",
      now: () => 1000,
    });
    const restoreLabelWithConfirmation = vi.fn<
      (labelId: Label["id"]) => Promise<LabelWriteResponse>
    >(() =>
      Promise.reject(
        Object.assign(new Error("Active name conflict."), {
          _tag: "@ceird/labels-core/LabelRestoreConflictError",
          activeLabelId: urgentLabel.id,
          labelId: archivedLabel.id,
          name: archivedLabel.name,
        })
      )
    );

    renderLabelsPage({
      collectionState: makeCollectionState({ labels: [], status: "ready" }),
      listLabels: () => Promise.resolve({ labels: [archivedLabel] }),
      mutationJournal,
      restoreLabelWithConfirmation,
    });

    await user.click(screen.getByRole("tab", { name: "Archived" }));
    await screen.findByText("Plumbing");
    await openRowAction(user, "Plumbing", "Restore label");

    await expect(screen.findByRole("alert")).resolves.toHaveTextContent(
      "Restore blocked because an active label already uses that name."
    );
    expect(screen.getByText("Plumbing")).toBeVisible();
    expect(mutationJournal.entries()).toMatchObject([
      {
        affectedCollections: ["labels"],
        commandName: "labels.restore",
        status: "failure",
      },
    ]);
  });

  it("shows validation errors inside the drawer", async () => {
    const user = userEvent.setup();

    renderLabelsPage({
      collectionState: makeCollectionState({
        labels: [urgentLabel],
        status: "ready",
      }),
    });

    await user.click(screen.getByRole("button", { name: /new label/i }));
    const dialog = screen.getByRole("dialog", { name: "New label" });
    await user.type(
      within(dialog).getByRole("textbox", { name: "Name" }),
      "urgent"
    );
    await user.click(
      within(dialog).getByRole("button", { name: /save label/i })
    );
    expect(within(dialog).getByRole("alert")).toHaveTextContent(
      "A label with that name already exists."
    );

    await user.clear(within(dialog).getByRole("textbox", { name: "Name" }));
    await user.type(
      within(dialog).getByRole("textbox", { name: "Name" }),
      "x".repeat(49)
    );
    await user.click(
      within(dialog).getByRole("button", { name: /save label/i })
    );
    expect(within(dialog).getByRole("alert")).toHaveTextContent(
      "Label names must be between 1 and 48 characters."
    );
  });

  it("renders loading, unavailable, and permission-denied states", async () => {
    const user = userEvent.setup();
    const { rerender } = renderLabelsPage({
      collectionState: makeCollectionState({
        labels: [],
        status: "connecting",
      }),
    });

    expect(screen.getByLabelText("Loading labels")).toBeVisible();

    rerender(
      <LabelsPageHarness
        collectionState={makeCollectionState({
          labels: [],
          status: "unavailable",
        })}
      />
    );
    expect(screen.getByText("Labels unavailable")).toBeVisible();
    expect(screen.getByRole("button", { name: /new label/i })).toBeDisabled();

    rerender(
      <LabelsPageHarness
        collectionState={makeCollectionState({
          labels: [urgentLabel],
          status: "ready",
        })}
        organizationRole="member"
      />
    );
    expect(screen.getAllByText("Admin label management")).toHaveLength(2);
    expect(screen.queryByRole("button", { name: /new label/i })).toBeNull();

    await user.click(screen.getByRole("tab", { name: "Archived" }));
    expect(screen.getAllByText("Admin label management")).toHaveLength(2);
    expect(screen.queryByLabelText("Loading archived labels")).toBeNull();
  });

  it("records command lifecycle for create and failed update mutations", async () => {
    const user = userEvent.setup();
    const mutationJournal = createDataPlaneMutationJournal({
      createId: () => "mutation_1",
      now: () => 1000,
    });
    const updateLabelWithConfirmation = vi.fn<
      (
        labelId: Label["id"],
        input: UpdateLabelInput
      ) => Promise<LabelWriteResponse>
    >(() => Promise.reject(new Error("Timeout waiting for txId: 102")));

    renderLabelsPage({
      collectionState: makeCollectionState({
        labels: [urgentLabel],
        status: "ready",
      }),
      mutationJournal,
      updateLabelWithConfirmation,
    });

    await openRowAction(user, "Urgent", "Edit label");
    const dialog = screen.getByRole("dialog", { name: "Edit label" });
    await user.clear(within(dialog).getByRole("textbox", { name: "Name" }));
    await user.type(
      within(dialog).getByRole("textbox", { name: "Name" }),
      "Emergency"
    );
    await user.click(
      within(dialog).getByRole("button", { name: /save label/i })
    );

    await expect(
      screen.findAllByText(/realtime confirmation timed out/i)
    ).resolves.not.toHaveLength(0);
    expect(mutationJournal.entries()).toMatchObject([
      {
        affectedCollections: ["labels"],
        commandName: "labels.update",
        status: "failure",
      },
    ]);
    expect(screen.getByText("Urgent")).toBeVisible();
  });

  it("supports route hotkeys for search, create, submit, and cancel", async () => {
    const user = userEvent.setup();

    renderLabelsPage({
      collectionState: makeCollectionState({
        labels: [urgentLabel],
        status: "ready",
      }),
    });

    await user.keyboard("/");
    expect(
      screen.getByRole("textbox", { name: /search labels/i })
    ).toHaveFocus();

    await user.click(screen.getByRole("heading", { name: "Labels" }));
    await user.keyboard("n");
    const createDialog = screen.getByRole("dialog", { name: "New label" });
    expect(
      within(createDialog).getByRole("textbox", { name: "Name" })
    ).toHaveFocus();
    await user.type(
      within(createDialog).getByRole("textbox", { name: "Name" }),
      "Plaster"
    );
    await user.keyboard(getModEnterKeyboardInput());
    await expect(screen.findByText("Plaster")).resolves.toBeVisible();

    await user.keyboard("n");
    expect(screen.getByRole("dialog", { name: "New label" })).toBeVisible();
    await user.keyboard("{Escape}");
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "New label" })).toBeNull();
    });
  });
});

async function openRowAction(
  user: ReturnType<typeof userEvent.setup>,
  labelName: string,
  itemName: string
) {
  await user.click(
    await screen.findByRole("button", {
      name: new RegExp(`open actions for ${labelName}`, "i"),
    })
  );
  await user.click(await screen.findByRole("menuitem", { name: itemName }));
}

function renderLabelsPage({
  archiveLabelWithConfirmation,
  collectionState,
  createLabelWithConfirmation,
  listLabels,
  labelUsageCounts = DEFAULT_LABEL_USAGE_COUNTS,
  mutationJournal,
  organizationRole = "owner",
  restoreLabelWithConfirmation,
  state,
  updateLabelWithConfirmation,
}: {
  readonly archiveLabelWithConfirmation?:
    | ((labelId: Label["id"]) => Promise<LabelWriteResponse>)
    | undefined;
  readonly collectionState: ReturnType<typeof makeCollectionState>;
  readonly createLabelWithConfirmation?:
    | ((input: CreateLabelInput) => Promise<LabelWriteResponse>)
    | undefined;
  readonly listLabels?:
    | ((query: ListLabelsQuery) => Promise<LabelsResponse>)
    | undefined;
  readonly labelUsageCounts?:
    | ReadonlyMap<
        Label["id"],
        { readonly jobs: number; readonly sites: number }
      >
    | undefined;
  readonly mutationJournal?:
    | ReturnType<typeof createDataPlaneMutationJournal>
    | undefined;
  readonly organizationRole?: "admin" | "member" | "owner";
  readonly restoreLabelWithConfirmation?:
    | ((labelId: Label["id"]) => Promise<LabelWriteResponse>)
    | undefined;
  readonly state?: LabelsPageState;
  readonly updateLabelWithConfirmation?:
    | ((
        labelId: Label["id"],
        input: UpdateLabelInput
      ) => Promise<LabelWriteResponse>)
    | undefined;
}) {
  return render(
    <LabelsPageHarness
      archiveLabelWithConfirmation={archiveLabelWithConfirmation}
      collectionState={collectionState}
      createLabelWithConfirmation={createLabelWithConfirmation}
      listLabels={listLabels}
      labelUsageCounts={labelUsageCounts}
      mutationJournal={mutationJournal}
      organizationRole={organizationRole}
      restoreLabelWithConfirmation={restoreLabelWithConfirmation}
      state={state}
      updateLabelWithConfirmation={updateLabelWithConfirmation}
    />
  );
}

function LabelsPageHarness({
  archiveLabelWithConfirmation,
  collectionState,
  createLabelWithConfirmation,
  listLabels = () => Promise.resolve({ labels: [] }),
  labelUsageCounts = DEFAULT_LABEL_USAGE_COUNTS,
  mutationJournal,
  organizationRole = "owner",
  restoreLabelWithConfirmation,
  state,
  updateLabelWithConfirmation,
}: {
  readonly archiveLabelWithConfirmation?:
    | ((labelId: Label["id"]) => Promise<LabelWriteResponse>)
    | undefined;
  readonly collectionState: ReturnType<typeof makeCollectionState>;
  readonly createLabelWithConfirmation?:
    | ((input: CreateLabelInput) => Promise<LabelWriteResponse>)
    | undefined;
  readonly listLabels?: (query: ListLabelsQuery) => Promise<LabelsResponse>;
  readonly labelUsageCounts?: ReadonlyMap<
    Label["id"],
    { readonly jobs: number; readonly sites: number }
  >;
  readonly mutationJournal?:
    | ReturnType<typeof createDataPlaneMutationJournal>
    | undefined;
  readonly organizationRole?: "admin" | "member" | "owner";
  readonly restoreLabelWithConfirmation?:
    | ((labelId: Label["id"]) => Promise<LabelWriteResponse>)
    | undefined;
  readonly state?: LabelsPageState;
  readonly updateLabelWithConfirmation?:
    | ((
        labelId: Label["id"],
        input: UpdateLabelInput
      ) => Promise<LabelWriteResponse>)
    | undefined;
}) {
  return (
    <HotkeysProvider>
      <TooltipProvider>
        <Toaster position="top-right" closeButton />
        <OrganizationLabelsSettingsPage
          archiveLabelWithConfirmation={
            archiveLabelWithConfirmation ?? archiveDefaultLabelWithConfirmation
          }
          collectionState={collectionState}
          createLabelWithConfirmation={
            createLabelWithConfirmation ?? createDefaultLabelWithConfirmation
          }
          listLabels={listLabels}
          labelUsageCounts={labelUsageCounts}
          mutationJournal={mutationJournal}
          organization={TEST_ORGANIZATION}
          organizationRole={organizationRole}
          restoreLabelWithConfirmation={
            restoreLabelWithConfirmation ?? restoreDefaultLabelWithConfirmation
          }
          state={state}
          updateLabelWithConfirmation={
            updateLabelWithConfirmation ?? updateDefaultLabelWithConfirmation
          }
        />
      </TooltipProvider>
    </HotkeysProvider>
  );
}

function createDefaultLabelWithConfirmation(input: CreateLabelInput) {
  return Promise.resolve(
    makeLabelWriteResponse(
      makeLabel({
        description: input.description,
        id: "44444444-4444-4444-8444-444444444444",
        name: input.name,
      }),
      123
    )
  );
}

function updateDefaultLabelWithConfirmation(
  labelId: Label["id"],
  input: UpdateLabelInput
) {
  return Promise.resolve(
    makeLabelWriteResponse(
      makeLabel({
        description: input.description,
        id: labelId,
        name: input.name,
      }),
      124
    )
  );
}

function archiveDefaultLabelWithConfirmation(labelId: Label["id"]) {
  return Promise.resolve(
    makeLabelWriteResponse(
      makeLabel({
        archivedAt: "2026-06-18T10:00:00.000Z",
        id: labelId,
        name: "Archived",
      }),
      125
    )
  );
}

function restoreDefaultLabelWithConfirmation(labelId: Label["id"]) {
  return Promise.resolve(
    makeLabelWriteResponse(
      makeLabel({
        id: labelId,
        name: "Restored",
      }),
      126
    )
  );
}

function getModEnterKeyboardInput() {
  return /(Mac|iPhone|iPad|iPod)/i.test(navigator.platform)
    ? "{Meta>}{Enter}{/Meta}"
    : "{Control>}{Enter}{/Control}";
}

function makeCollectionState({
  labels,
  status,
}: {
  readonly labels: readonly Label[];
  readonly status: DataPlaneCollectionHealthStatus;
}) {
  const health = createDataPlaneCollectionHealth({
    collection: "labels",
    collectionId:
      "organization:org_123:user:user_123:role:owner:labels:settings:electric",
    source: "electric",
    status,
    subscriptionName: "labels",
  });

  if (status === "ready") {
    health.markReady();
  }

  if (status === "unavailable") {
    health.markUnavailable({
      kind: "network",
      message: "Sync worker is not reachable.",
      retryable: true,
    });
  }

  return {
    collection:
      status === "disabled" || status === "unavailable"
        ? null
        : makeCollection(labels, status),
    health: health as DataPlaneCollectionHealth,
  };
}

function makeCollection(
  labels: readonly Label[],
  status: DataPlaneCollectionHealthStatus
) {
  let currentLabels = [...labels].toSorted(compareLabels);
  const listeners = new Set<() => void>();
  const notify = () => {
    for (const listener of listeners) {
      listener();
    }
  };

  return {
    entries: () =>
      currentLabels
        .map((label): [string | number, Label] => [label.id, label])
        .values(),
    status,
    subscribeChanges: (callback: () => void) => {
      listeners.add(callback);
      queueMicrotask(callback);

      return {
        requestSnapshot: () => queueMicrotask(callback),
        unsubscribe: () => {
          listeners.delete(callback);
        },
      };
    },
    utils: {
      writeDelete: (key: Label["id"]) => {
        currentLabels = currentLabels.filter((label) => label.id !== key);
        notify();
      },
      writeUpsert: (label: Label) => {
        currentLabels = [
          label,
          ...currentLabels.filter(
            (currentLabel) => currentLabel.id !== label.id
          ),
        ].toSorted(compareLabels);
        notify();
      },
    },
  };
}

function makeLabel({
  archivedAt = null,
  color = "oklch(64% 0.19 28)",
  description = null,
  id,
  name,
}: {
  readonly archivedAt?: Label["archivedAt"] | undefined;
  readonly color?: Label["color"] | undefined;
  readonly description?: Label["description"] | undefined;
  readonly id: string;
  readonly name: string;
}): Label {
  return {
    archivedAt,
    color,
    createdAt: "2026-06-14T00:00:00.000Z",
    description,
    id: id as Label["id"],
    name,
    updatedAt: "2026-06-14T00:00:00.000Z",
  };
}

function makeLabelWriteResponse(label: Label, txid: number) {
  return {
    label,
    mutation: { txid },
  };
}

function compareLabels(left: Label, right: Label) {
  const nameComparison = left.name.localeCompare(right.name);

  return nameComparison === 0
    ? left.id.localeCompare(right.id)
    : nameComparison;
}
