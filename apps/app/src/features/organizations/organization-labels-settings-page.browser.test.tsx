import { decodeOrganizationSummary } from "@ceird/identity-core";
import type {
  CreateLabelInput,
  Label,
  LabelWriteResponse,
  UpdateLabelInput,
} from "@ceird/labels-core";
import { HotkeysProvider } from "@tanstack/react-hotkeys";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { TooltipProvider } from "#/components/ui/tooltip";
import { createDataPlaneCollectionHealth } from "#/data-plane/collection-health";
import type {
  DataPlaneCollectionHealth,
  DataPlaneCollectionHealthStatus,
} from "#/data-plane/collection-health";
import { createDataPlaneMutationJournal } from "#/data-plane/mutation-journal";

import { OrganizationLabelsSettingsPage } from "./organization-labels-settings-page";

const TEST_ORGANIZATION = decodeOrganizationSummary({
  id: "org_123",
  name: "Acme Field Ops",
  slug: "acme-field-ops",
});

const urgentLabel = makeLabel({
  id: "11111111-1111-4111-8111-111111111111",
  name: "Urgent",
});
const electricalLabel = makeLabel({
  id: "22222222-2222-4222-8222-222222222222",
  name: "Electrical",
});
const plumbingLabel = makeLabel({
  id: "33333333-3333-4333-8333-333333333333",
  name: "Plumbing",
});

describe("organization labels settings page", () => {
  it("renders active labels from the synced collection with ready health", async () => {
    renderLabelsPage({
      collectionState: makeCollectionState({
        labels: [urgentLabel, electricalLabel, plumbingLabel],
        status: "ready",
      }),
    });

    expect(screen.getByRole("heading", { name: "Labels" })).toBeVisible();
    expect(screen.getByText("Realtime ready")).toBeVisible();
    expect(
      screen.getByRole("textbox", { name: /new label name/i })
    ).toBeVisible();
    await expect(
      screen.findByRole("button", {
        name: /open actions for electrical/i,
      })
    ).resolves.toBeVisible();
    expect(screen.getByText("Plumbing")).toBeVisible();
    expect(screen.getByText("Urgent")).toBeVisible();
    expect(screen.getByText("3 active labels")).toBeVisible();
  });

  it("filters labels locally from the synced collection", async () => {
    const user = userEvent.setup();

    renderLabelsPage({
      collectionState: makeCollectionState({
        labels: [urgentLabel, electricalLabel, plumbingLabel],
        status: "ready",
      }),
    });

    await screen.findByText("Electrical");
    await user.type(
      screen.getByRole("textbox", { name: /search labels/i }),
      "g"
    );

    expect(screen.getByText("Plumbing")).toBeVisible();
    expect(screen.getByText("Urgent")).toBeVisible();
    expect(screen.queryByText("Electrical")).not.toBeInTheDocument();
    expect(screen.getByText("2 of 3 labels")).toBeVisible();
  });

  it("shows an empty search result without changing sync state", async () => {
    const user = userEvent.setup();

    renderLabelsPage({
      collectionState: makeCollectionState({
        labels: [electricalLabel],
        status: "ready",
      }),
    });

    await screen.findByText("Electrical");
    await user.type(
      screen.getByRole("textbox", { name: /search labels/i }),
      "zz"
    );

    expect(screen.getByText("No matching labels")).toBeVisible();
    expect(screen.getByText('No active labels match "zz".')).toBeVisible();
    expect(screen.getByText("Realtime ready")).toBeVisible();
  });

  it("renders connecting, empty, unavailable, and permission-aware states", async () => {
    const { rerender } = renderLabelsPage({
      collectionState: makeCollectionState({
        labels: [],
        status: "connecting",
      }),
    });

    expect(screen.getByLabelText("Loading labels")).toBeVisible();
    expect(screen.getByText("Connecting to realtime labels")).toBeVisible();

    rerender(
      <LabelsPageHarness
        collectionState={makeCollectionState({ labels: [], status: "ready" })}
      />
    );
    await waitFor(() => {
      expect(screen.getByText("No labels yet")).toBeVisible();
    });

    rerender(
      <LabelsPageHarness
        collectionState={makeCollectionState({
          labels: [],
          status: "unavailable",
        })}
      />
    );
    expect(screen.getAllByText("Realtime labels unavailable")).toHaveLength(2);

    rerender(
      <LabelsPageHarness
        collectionState={makeCollectionState({
          labels: [urgentLabel],
          status: "ready",
        })}
        organizationRole="member"
      />
    );
    expect(screen.getByText("Admin label management")).toBeVisible();
    expect(
      screen.queryByRole("textbox", { name: /search labels/i })
    ).toBeNull();
  });

  it("creates labels through the writable collection and records command lifecycle", async () => {
    const user = userEvent.setup();
    const mutationJournal = createDataPlaneMutationJournal({
      createId: () => "mutation_1",
      now: () => 1000,
    });

    renderLabelsPage({
      collectionState: makeCollectionState({
        labels: [],
        status: "ready",
      }),
      createTemporaryLabelId: () =>
        "44444444-4444-4444-8444-444444444444" as Label["id"],
      mutationJournal,
    });

    await user.type(
      screen.getByRole("textbox", { name: /new label name/i }),
      "Fire Safety"
    );
    await user.click(screen.getByRole("button", { name: /create/i }));

    await expect(screen.findByText("Fire Safety")).resolves.toBeVisible();
    await expect(
      screen.findByText("Label created and confirmed by realtime sync.")
    ).resolves.toBeVisible();
    expect(
      screen.getByText("Label created and confirmed by realtime sync.")
    ).toHaveTextContent("Label created and confirmed by realtime sync.");
    expect(mutationJournal.entries()).toMatchObject([
      {
        affectedCollections: ["labels"],
        commandName: "labels.create",
        input: { name: "Fire Safety" },
        status: "success",
      },
    ]);
  });

  it("reconciles temporary create ids before immediate rename actions", async () => {
    const user = userEvent.setup();
    const createTransaction = Promise.withResolvers<unknown>();
    const serverLabel = makeLabel({
      id: "55555555-5555-4555-8555-555555555555",
      name: "Fire Safety",
    });

    renderLabelsPage({
      collectionState: makeCollectionState({
        labels: [],
        status: "ready",
        transactions: {
          insert: [createTransaction],
        },
      }),
      createTemporaryLabelId: () =>
        "44444444-4444-4444-8444-444444444444" as Label["id"],
    });

    await user.type(
      screen.getByRole("textbox", { name: /new label name/i }),
      "Fire Safety"
    );
    await user.click(screen.getByRole("button", { name: /create/i }));

    await expect(screen.findByText("Fire Safety")).resolves.toBeVisible();
    createTransaction.resolve({
      responses: [makeLabelWriteResponse(serverLabel, 123)],
      timeout: 10_000,
      txid: 123,
    });

    await expect(
      screen.findByText("Label created and confirmed by realtime sync.")
    ).resolves.toBeVisible();
    await user.click(
      await screen.findByRole("button", {
        name: /open actions for fire safety/i,
      })
    );
    await user.click(
      await screen.findByRole("menuitem", { name: /edit label/i })
    );
    const editInput = screen.getByRole("textbox", {
      name: /rename fire safety/i,
    });
    await user.clear(editInput);
    await user.type(editInput, "Emergency");
    await user.click(screen.getByRole("button", { name: /save fire safety/i }));

    await expect(
      screen.findByText("Label renamed and confirmed by realtime sync.")
    ).resolves.toBeVisible();
    await waitFor(() => {
      expect(screen.getByText("Emergency")).toBeVisible();
    });
    expect(screen.queryByText("Fire Safety")).not.toBeInTheDocument();
  });

  it("creates labels through the authoritative command when Electric txid confirmation is available", async () => {
    const user = userEvent.setup();
    const serverLabel = makeLabel({
      id: "55555555-5555-4555-8555-555555555555",
      name: "Fire Safety",
    });
    const renamedLabel = { ...serverLabel, name: "Emergency" };
    const createLabelWithConfirmation = vi.fn<
      (input: CreateLabelInput) => Promise<LabelWriteResponse>
    >((_input) => Promise.resolve(makeLabelWriteResponse(serverLabel, 456)));
    const updateLabelWithConfirmation = vi.fn<
      (
        labelId: Label["id"],
        input: UpdateLabelInput
      ) => Promise<LabelWriteResponse>
    >((_labelId, _input) =>
      Promise.resolve(makeLabelWriteResponse(renamedLabel, 789))
    );
    const awaitTxId = vi.fn<
      (txid: number, timeout?: number) => Promise<boolean>
    >(() => Promise.resolve(true));

    renderLabelsPage({
      collectionState: makeCollectionState({
        awaitTxId,
        labels: [],
        status: "ready",
      }),
      createLabelWithConfirmation,
      updateLabelWithConfirmation,
    });

    await user.type(
      screen.getByRole("textbox", { name: /new label name/i }),
      "Fire Safety"
    );
    await user.click(screen.getByRole("button", { name: /create/i }));

    await expect(
      screen.findByText("Label created and confirmed by realtime sync.")
    ).resolves.toBeVisible();
    expect(createLabelWithConfirmation).toHaveBeenCalledWith({
      name: "Fire Safety",
    });
    expect(awaitTxId).toHaveBeenCalledWith(456, 10_000);
    await expect(screen.findByText("Fire Safety")).resolves.toBeVisible();

    await user.click(
      await screen.findByRole("button", {
        name: /open actions for fire safety/i,
      })
    );
    await user.click(
      await screen.findByRole("menuitem", { name: /edit label/i })
    );
    const editInput = screen.getByRole("textbox", {
      name: /rename fire safety/i,
    });
    await user.clear(editInput);
    await user.type(editInput, "Emergency");
    await user.click(screen.getByRole("button", { name: /save fire safety/i }));

    await expect(
      screen.findByText("Label renamed and confirmed by realtime sync.")
    ).resolves.toBeVisible();
    expect(updateLabelWithConfirmation).toHaveBeenCalledWith(serverLabel.id, {
      name: "Emergency",
    });
    expect(awaitTxId).toHaveBeenCalledWith(789, 10_000);
    await waitFor(() => {
      expect(screen.getByText("Emergency")).toBeVisible();
    });
    expect(screen.queryByText("Fire Safety")).not.toBeInTheDocument();
  });

  it("archives labels through the authoritative command when Electric txid confirmation is available", async () => {
    const user = userEvent.setup();
    const serverLabel = makeLabel({
      id: "55555555-5555-4555-8555-555555555555",
      name: "Fire Safety",
    });
    const renamedLabel = { ...serverLabel, name: "Emergency" };
    const createLabelWithConfirmation = vi.fn<
      (input: CreateLabelInput) => Promise<LabelWriteResponse>
    >((_input) => Promise.resolve(makeLabelWriteResponse(serverLabel, 456)));
    const archiveLabelWithConfirmation = vi.fn<
      (labelId: Label["id"]) => Promise<LabelWriteResponse>
    >((_labelId) => Promise.resolve(makeLabelWriteResponse(renamedLabel, 789)));
    const updateLabelWithConfirmation = vi.fn<
      (
        labelId: Label["id"],
        input: UpdateLabelInput
      ) => Promise<LabelWriteResponse>
    >((_labelId, _input) =>
      Promise.resolve(makeLabelWriteResponse(renamedLabel, 678))
    );
    const awaitTxId = vi.fn<
      (txid: number, timeout?: number) => Promise<boolean>
    >(() => Promise.resolve(true));

    renderLabelsPage({
      archiveLabelWithConfirmation,
      collectionState: makeCollectionState({
        awaitTxId,
        labels: [],
        status: "ready",
      }),
      createLabelWithConfirmation,
      updateLabelWithConfirmation,
    });

    await user.type(
      screen.getByRole("textbox", { name: /new label name/i }),
      "Fire Safety"
    );
    await user.click(screen.getByRole("button", { name: /create/i }));
    await expect(screen.findByText("Fire Safety")).resolves.toBeVisible();

    await user.click(
      await screen.findByRole("button", {
        name: /open actions for fire safety/i,
      })
    );
    await user.click(
      await screen.findByRole("menuitem", { name: /edit label/i })
    );
    const editInput = screen.getByRole("textbox", {
      name: /rename fire safety/i,
    });
    await user.clear(editInput);
    await user.type(editInput, "Emergency");
    await user.click(screen.getByRole("button", { name: /save fire safety/i }));
    await expect(screen.findByText("Emergency")).resolves.toBeVisible();

    await user.click(
      await screen.findByRole("button", {
        name: /open actions for emergency/i,
      })
    );
    await user.click(
      await screen.findByRole("menuitem", { name: /archive label/i })
    );
    const archiveConfirmation = await screen.findByRole("group", {
      name: /confirm archiving emergency/i,
    });
    await user.click(
      within(archiveConfirmation).getByRole("button", {
        name: /archive label/i,
      })
    );

    await expect(
      screen.findByText(
        "Label archived and removed after realtime confirmation."
      )
    ).resolves.toBeVisible();
    expect(archiveLabelWithConfirmation).toHaveBeenCalledWith(serverLabel.id);
    expect(awaitTxId).toHaveBeenCalledWith(789, 10_000);
    expect(screen.queryByText("Emergency")).not.toBeInTheDocument();
  });

  it("disables mouse-driven row actions while another mutation is pending", async () => {
    const user = userEvent.setup();
    const createTransaction = Promise.withResolvers<unknown>();

    renderLabelsPage({
      collectionState: makeCollectionState({
        labels: [urgentLabel],
        status: "ready",
        transactions: {
          insert: [createTransaction],
        },
      }),
      createTemporaryLabelId: () =>
        "44444444-4444-4444-8444-444444444444" as Label["id"],
    });

    await user.type(
      screen.getByRole("textbox", { name: /new label name/i }),
      "Fire Safety"
    );
    await user.click(screen.getByRole("button", { name: /create/i }));

    await expect(screen.findByText("Fire Safety")).resolves.toBeVisible();
    expect(screen.getByText("Pending realtime confirmation")).toBeVisible();
    const urgentActions = screen.getByRole("button", {
      name: /open actions for urgent/i,
    });
    expect(urgentActions).toBeDisabled();

    await user.click(urgentActions);

    expect(
      screen.queryByRole("menuitem", { name: /archive label/i })
    ).not.toBeInTheDocument();
    expect(screen.getByText("Pending realtime confirmation")).toBeVisible();

    createTransaction.resolve({ txid: 123 });

    await expect(
      screen.findByText("Label created and confirmed by realtime sync.")
    ).resolves.toBeVisible();
  });

  it("shows duplicate and invalid label feedback before submitting", async () => {
    const user = userEvent.setup();

    renderLabelsPage({
      collectionState: makeCollectionState({
        labels: [urgentLabel],
        status: "ready",
      }),
    });

    const input = screen.getByRole("textbox", { name: /new label name/i });
    await user.type(input, "  urgent  ");
    await user.click(screen.getByRole("button", { name: /create/i }));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "A label with that name already exists."
    );

    await user.clear(input);
    await user.type(input, "x".repeat(49));
    await user.click(screen.getByRole("button", { name: /create/i }));
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Label names must be between 1 and 48 characters."
    );
  });

  it("renames labels after Electric confirmation and rolls back failed renames", async () => {
    const user = userEvent.setup();
    const mutationJournal = createDataPlaneMutationJournal({
      createId: () => "mutation_rename",
      now: () => 1000,
    });
    const collectionState = makeCollectionState({
      failures: {
        update: [new Error("Timeout waiting for txId: 102")],
      },
      labels: [urgentLabel],
      status: "ready",
    });

    renderLabelsPage({
      collectionState,
      mutationJournal,
    });

    await user.click(
      await screen.findByRole("button", { name: /open actions for urgent/i })
    );
    await user.click(
      await screen.findByRole("menuitem", { name: /edit label/i })
    );
    const editInput = screen.getByRole("textbox", { name: /rename urgent/i });
    await user.clear(editInput);
    await user.type(editInput, "Emergency");
    await user.click(screen.getByRole("button", { name: /save urgent/i }));

    await expect(screen.findByRole("alert")).resolves.toHaveTextContent(
      "realtime confirmation timed out"
    );
    await waitFor(() => {
      expect(screen.getByText("Urgent")).toBeVisible();
    });
    await waitFor(() => {
      expect(screen.queryByText("Emergency")).not.toBeInTheDocument();
    });
    expect(mutationJournal.entries()).toMatchObject([
      {
        affectedCollections: ["labels"],
        commandName: "labels.update",
        status: "failure",
      },
    ]);
  });

  it("requires menu archive confirmation before removing labels from the active synced list", async () => {
    const user = userEvent.setup();

    renderLabelsPage({
      collectionState: makeCollectionState({
        labels: [urgentLabel],
        status: "ready",
      }),
    });

    await user.click(
      await screen.findByRole("button", { name: /open actions for urgent/i })
    );
    await user.click(
      await screen.findByRole("menuitem", { name: /archive label/i })
    );

    expect(screen.getByText("Archive this label?")).toBeVisible();
    expect(screen.getByText("Urgent")).toBeVisible();

    await user.click(screen.getByRole("button", { name: /archive label/i }));

    await expect(
      screen.findByText(
        "Label archived and removed after realtime confirmation."
      )
    ).resolves.toBeVisible();
    expect(screen.queryByText("Urgent")).not.toBeInTheDocument();
  });

  it("archives labels after temporary create id reconciliation and rename", async () => {
    const user = userEvent.setup();
    const createTransaction = Promise.withResolvers<unknown>();
    const serverLabel = makeLabel({
      id: "55555555-5555-4555-8555-555555555555",
      name: "Fire Safety",
    });

    renderLabelsPage({
      collectionState: makeCollectionState({
        labels: [],
        status: "ready",
        transactions: {
          insert: [createTransaction],
        },
      }),
      createTemporaryLabelId: () =>
        "44444444-4444-4444-8444-444444444444" as Label["id"],
    });

    await user.type(
      screen.getByRole("textbox", { name: /new label name/i }),
      "Fire Safety"
    );
    await user.click(screen.getByRole("button", { name: /create/i }));
    await expect(screen.findByText("Fire Safety")).resolves.toBeVisible();

    createTransaction.resolve({
      responses: [makeLabelWriteResponse(serverLabel, 101)],
      timeout: 10_000,
      txid: 101,
    });
    await expect(
      screen.findByText("Label created and confirmed by realtime sync.")
    ).resolves.toBeVisible();

    await user.click(
      await screen.findByRole("button", {
        name: /open actions for fire safety/i,
      })
    );
    await user.click(
      await screen.findByRole("menuitem", { name: /edit label/i })
    );
    const editInput = screen.getByRole("textbox", {
      name: /rename fire safety/i,
    });
    await user.clear(editInput);
    await user.type(editInput, "Emergency");
    await user.click(screen.getByRole("button", { name: /save fire safety/i }));
    await expect(
      screen.findByText("Label renamed and confirmed by realtime sync.")
    ).resolves.toBeVisible();
    await expect(screen.findByText("Emergency")).resolves.toBeVisible();

    await user.click(
      await screen.findByRole("button", {
        name: /open actions for emergency/i,
      })
    );
    await user.click(
      await screen.findByRole("menuitem", { name: /archive label/i })
    );
    const archiveConfirmation = await screen.findByRole("group", {
      name: /confirm archiving emergency/i,
    });
    const confirmArchiveButton = within(archiveConfirmation).getByRole(
      "button",
      {
        name: /archive label/i,
      }
    );
    await waitFor(() => {
      expect(confirmArchiveButton).toBeEnabled();
    });
    await user.click(confirmArchiveButton);

    await expect(
      screen.findByText(
        "Label archived and removed after realtime confirmation."
      )
    ).resolves.toBeVisible();
    expect(screen.queryByText("Emergency")).not.toBeInTheDocument();
  });

  it("requires edit-mode archive icon confirmation and supports cancel", async () => {
    const user = userEvent.setup();

    renderLabelsPage({
      collectionState: makeCollectionState({
        labels: [urgentLabel],
        status: "ready",
      }),
    });

    await user.click(
      await screen.findByRole("button", { name: /open actions for urgent/i })
    );
    await user.click(
      await screen.findByRole("menuitem", { name: /edit label/i })
    );
    await user.click(screen.getByRole("button", { name: /archive urgent/i }));

    expect(screen.getByText("Archive this label?")).toBeVisible();
    expect(screen.getByRole("textbox", { name: /rename urgent/i })).toHaveValue(
      "Urgent"
    );

    await user.click(screen.getByRole("button", { name: /cancel/i }));

    expect(screen.queryByText("Archive this label?")).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: /rename urgent/i })).toHaveValue(
      "Urgent"
    );
  });

  it("supports route hotkeys for search, create, save, cancel, and archive edit mode", async () => {
    const user = userEvent.setup();

    renderLabelsPage({
      collectionState: makeCollectionState({
        labels: [urgentLabel],
        status: "ready",
      }),
      createTemporaryLabelId: () =>
        "55555555-5555-4555-8555-555555555555" as Label["id"],
    });

    const searchInput = await screen.findByRole("textbox", {
      name: /search labels/i,
    });
    await user.keyboard("/");

    expect(searchInput).toHaveFocus();

    await user.click(screen.getByRole("heading", { name: "Labels" }));
    await user.keyboard("n");
    const createInput = screen.getByRole("textbox", {
      name: /new label name/i,
    });
    expect(createInput).toHaveFocus();
    await user.type(createInput, "Plaster");
    await user.keyboard(getModEnterKeyboardInput());
    await expect(screen.findByText("Plaster")).resolves.toBeVisible();

    await user.click(
      await screen.findByRole("button", { name: /open actions for urgent/i })
    );
    await user.click(
      await screen.findByRole("menuitem", { name: /edit label/i })
    );
    expect(
      screen.getByRole("textbox", { name: /rename urgent/i })
    ).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(
      screen.queryByRole("textbox", { name: /rename urgent/i })
    ).not.toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: /open actions for urgent/i })
    );
    await user.click(
      await screen.findByRole("menuitem", { name: /edit label/i })
    );
    await user.keyboard(getModShiftBackspaceKeyboardInput());
    expect(screen.getByText("Archive this label?")).toBeVisible();
    expect(screen.getByRole("textbox", { name: /rename urgent/i })).toHaveValue(
      "Urgent"
    );
    await user.click(screen.getByRole("button", { name: /archive label/i }));
    await waitFor(() => {
      expect(screen.queryByText("Urgent")).not.toBeInTheDocument();
    });
  });
});

function renderLabelsPage({
  archiveLabelWithConfirmation,
  collectionState,
  createLabelWithConfirmation,
  createTemporaryLabelId,
  mutationJournal,
  organizationRole = "owner",
  updateLabelWithConfirmation,
}: {
  readonly archiveLabelWithConfirmation?:
    | ((labelId: Label["id"]) => Promise<LabelWriteResponse>)
    | undefined;
  readonly collectionState: ReturnType<typeof makeCollectionState>;
  readonly createLabelWithConfirmation?:
    | ((input: CreateLabelInput) => Promise<LabelWriteResponse>)
    | undefined;
  readonly createTemporaryLabelId?: (() => Label["id"]) | undefined;
  readonly mutationJournal?:
    | ReturnType<typeof createDataPlaneMutationJournal>
    | undefined;
  readonly organizationRole?: "admin" | "member" | "owner";
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
      createTemporaryLabelId={createTemporaryLabelId}
      mutationJournal={mutationJournal}
      organizationRole={organizationRole}
      updateLabelWithConfirmation={updateLabelWithConfirmation}
    />
  );
}

function getModEnterKeyboardInput() {
  return /(Mac|iPhone|iPad|iPod)/i.test(navigator.platform)
    ? "{Meta>}{Enter}{/Meta}"
    : "{Control>}{Enter}{/Control}";
}

function getModShiftBackspaceKeyboardInput() {
  return /(Mac|iPhone|iPad|iPod)/i.test(navigator.platform)
    ? "{Meta>}{Shift>}{Backspace}{/Shift}{/Meta}"
    : "{Control>}{Shift>}{Backspace}{/Shift}{/Control}";
}

function LabelsPageHarness({
  archiveLabelWithConfirmation,
  collectionState,
  createLabelWithConfirmation,
  createTemporaryLabelId,
  mutationJournal,
  organizationRole = "owner",
  updateLabelWithConfirmation,
}: {
  readonly archiveLabelWithConfirmation?:
    | ((labelId: Label["id"]) => Promise<LabelWriteResponse>)
    | undefined;
  readonly collectionState: ReturnType<typeof makeCollectionState>;
  readonly createLabelWithConfirmation?:
    | ((input: CreateLabelInput) => Promise<LabelWriteResponse>)
    | undefined;
  readonly createTemporaryLabelId?: (() => Label["id"]) | undefined;
  readonly mutationJournal?:
    | ReturnType<typeof createDataPlaneMutationJournal>
    | undefined;
  readonly organizationRole?: "admin" | "member" | "owner";
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
        <OrganizationLabelsSettingsPage
          archiveLabelWithConfirmation={archiveLabelWithConfirmation}
          collectionState={collectionState}
          createLabelWithConfirmation={createLabelWithConfirmation}
          createTemporaryLabelId={createTemporaryLabelId}
          mutationJournal={mutationJournal}
          organization={TEST_ORGANIZATION}
          organizationRole={organizationRole}
          updateLabelWithConfirmation={updateLabelWithConfirmation}
        />
      </TooltipProvider>
    </HotkeysProvider>
  );
}

function makeCollectionState({
  awaitTxId,
  failures,
  labels,
  status,
  transactions,
}: {
  readonly awaitTxId?:
    | ((txid: number, timeout?: number) => Promise<boolean>)
    | undefined;
  readonly failures?: Partial<
    Record<"delete" | "insert" | "update", readonly Error[]>
  >;
  readonly labels: readonly Label[];
  readonly status: DataPlaneCollectionHealthStatus;
  readonly transactions?: Partial<
    Record<"delete" | "insert" | "update", readonly ManualTransaction[]>
  >;
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
        : makeCollection(labels, status, failures, transactions, awaitTxId),
    health: health as DataPlaneCollectionHealth,
  };
}

function makeCollection(
  labels: readonly Label[],
  status: DataPlaneCollectionHealthStatus,
  failures?: Partial<Record<"delete" | "insert" | "update", readonly Error[]>>,
  transactions?: Partial<
    Record<"delete" | "insert" | "update", readonly ManualTransaction[]>
  >,
  awaitTxId?: (txid: number, timeout?: number) => Promise<boolean>
) {
  let currentLabels = [...labels].toSorted(compareLabels);
  const listeners = new Set<() => void>();
  const failureQueues = {
    delete: [...(failures?.delete ?? [])],
    insert: [...(failures?.insert ?? [])],
    update: [...(failures?.update ?? [])],
  };
  const transactionQueues = {
    delete: [...(transactions?.delete ?? [])],
    insert: [...(transactions?.insert ?? [])],
    update: [...(transactions?.update ?? [])],
  };
  const notify = () => {
    if (batchDepth > 0) {
      shouldNotifyAfterBatch = true;
      return;
    }

    for (const listener of listeners) {
      listener();
    }
  };
  let batchDepth = 0;
  let shouldNotifyAfterBatch = false;

  return {
    entries: () =>
      currentLabels
        .map((label): [string | number, Label] => [label.id, label])
        .values(),
    delete: (key: Label["id"]) => {
      const previous = currentLabels;
      currentLabels = currentLabels.filter((label) => label.id !== key);
      notify();

      return makeTransaction({
        failWith: failureQueues.delete.shift(),
        transaction: transactionQueues.delete.shift(),
        onRollback: () => {
          currentLabels = previous;
          notify();
        },
      });
    },
    insert: (label: Label) => {
      const previous = currentLabels;
      currentLabels = [...currentLabels, label].toSorted(compareLabels);
      notify();

      return makeTransaction({
        failWith: failureQueues.insert.shift(),
        transaction: transactionQueues.insert.shift(),
        onRollback: () => {
          currentLabels = previous;
          notify();
        },
      });
    },
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
    update: (
      key: Label["id"],
      callback: (draft: {
        createdAt: string;
        id: Label["id"];
        name: string;
        updatedAt: string;
      }) => void
    ) => {
      const previous = currentLabels;
      currentLabels = currentLabels.map((label) => {
        if (label.id !== key) {
          return label;
        }

        const draft = { ...label };
        callback(draft);
        return draft;
      });
      notify();

      return makeTransaction({
        failWith: failureQueues.update.shift(),
        transaction: transactionQueues.update.shift(),
        onRollback: () => {
          currentLabels = previous;
          notify();
        },
      });
    },
    utils: {
      awaitTxId,
      writeBatch: (callback: () => void) => {
        batchDepth += 1;
        try {
          callback();
        } finally {
          batchDepth -= 1;
        }

        if (batchDepth === 0 && shouldNotifyAfterBatch) {
          shouldNotifyAfterBatch = false;
          notify();
        }
      },
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

function makeTransaction({
  failWith,
  onRollback,
  transaction,
}: {
  readonly failWith?: Error | undefined;
  readonly onRollback: () => void;
  readonly transaction?: ManualTransaction | undefined;
}) {
  const persisted = transaction ?? Promise.withResolvers<unknown>();

  if (transaction) {
    return {
      isPersisted: {
        promise: persisted.promise,
      },
    };
  }

  queueMicrotask(() => {
    if (failWith) {
      onRollback();
      persisted.reject(failWith);
      return;
    }

    persisted.resolve({ txid: 123 });
  });

  return {
    isPersisted: {
      promise: persisted.promise,
    },
  };
}

interface ManualTransaction {
  readonly promise: Promise<unknown>;
  readonly reject: (reason?: unknown) => void;
  readonly resolve: (value: unknown) => void;
}

function makeLabel({
  id,
  name,
}: {
  readonly id: string;
  readonly name: string;
}): Label {
  return {
    createdAt: "2026-06-14T00:00:00.000Z",
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
