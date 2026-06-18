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

type LabelsPageState = Parameters<
  typeof OrganizationLabelsSettingsPage
>[0]["state"];

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

  it("enables command-backed create when a ready Electric collection lacks local write helpers", async () => {
    const user = userEvent.setup();
    const createLabelWithConfirmation = vi.fn<
      (input: CreateLabelInput) => Promise<LabelWriteResponse>
    >((_input) =>
      Promise.resolve(
        makeLabelWriteResponse(
          makeLabel({
            id: "44444444-4444-4444-8444-444444444444",
            name: "Fire Safety",
          }),
          123
        )
      )
    );

    renderLabelsPage({
      collectionState: makeCollectionState({
        labels: [],
        status: "ready",
        writeUtils: false,
      }),
      createLabelWithConfirmation,
    });

    const createInput = screen.getByRole("textbox", {
      name: /new label name/i,
    });
    expect(createInput).toBeEnabled();
    await user.type(createInput, "Fire Safety");
    await user.click(screen.getByRole("button", { name: /create/i }));

    await expect(screen.findByRole("status")).resolves.toHaveTextContent(
      "Label created and reflected locally while realtime sync catches up."
    );
    await expect(screen.findByText("Fire Safety")).resolves.toBeVisible();
    expect(createLabelWithConfirmation).toHaveBeenCalledWith({
      color: "oklch(64% 0.19 28)",
      description: null,
      name: "Fire Safety",
    });
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

  it("shows the empty notice when ready rendering has no labels", () => {
    renderLabelsPage({
      collectionState: makeCollectionState({
        labels: [],
        status: "ready",
      }),
      state: "ready",
    });

    expect(screen.getByText("No labels yet")).toBeVisible();
    expect(screen.queryByText("No matching labels")).not.toBeInTheDocument();
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

  it("creates labels through the labels command and records command lifecycle", async () => {
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
      mutationJournal,
    });

    await user.type(
      screen.getByRole("textbox", { name: /new label name/i }),
      "Fire Safety"
    );
    await user.click(screen.getByRole("button", { name: /create/i }));

    await expect(screen.findByText("Fire Safety")).resolves.toBeVisible();
    await expect(screen.findByRole("status")).resolves.toHaveTextContent(
      "Label created and reflected locally while realtime sync catches up."
    );
    expect(mutationJournal.entries()).toMatchObject([
      {
        affectedCollections: ["labels"],
        commandName: "labels.create",
        input: {
          color: "oklch(64% 0.19 28)",
          description: null,
          name: "Fire Safety",
        },
        status: "success",
      },
    ]);
  });

  it("creates labels with the chosen curated color", async () => {
    const user = userEvent.setup();
    const createLabelWithConfirmation = vi.fn<
      (input: CreateLabelInput) => Promise<LabelWriteResponse>
    >((input) =>
      Promise.resolve(
        makeLabelWriteResponse(
          {
            ...makeLabel({
              id: "44444444-4444-4444-8444-444444444444",
              name: input.name,
            }),
            color: input.color,
          },
          123
        )
      )
    );

    renderLabelsPage({
      collectionState: makeCollectionState({
        labels: [],
        status: "ready",
      }),
      createLabelWithConfirmation,
    });

    await user.click(screen.getByRole("radio", { name: /blue/i }));
    await user.type(
      screen.getByRole("textbox", { name: /new label name/i }),
      "Customer visit"
    );
    await user.click(screen.getByRole("button", { name: /create/i }));

    await expect(screen.findByText("Customer visit")).resolves.toBeVisible();
    expect(createLabelWithConfirmation).toHaveBeenCalledWith({
      color: "oklch(63% 0.18 255)",
      description: null,
      name: "Customer visit",
    });
  });

  it("uses server create ids before immediate rename actions", async () => {
    const user = userEvent.setup();
    const serverLabel = makeLabel({
      id: "55555555-5555-4555-8555-555555555555",
      name: "Fire Safety",
    });
    const renamedLabel = { ...serverLabel, name: "Emergency" };
    const createLabelWithConfirmation = vi.fn<
      (input: CreateLabelInput) => Promise<LabelWriteResponse>
    >((_input) => Promise.resolve(makeLabelWriteResponse(serverLabel, 123)));
    const updateLabelWithConfirmation = vi.fn<
      (
        labelId: Label["id"],
        input: UpdateLabelInput
      ) => Promise<LabelWriteResponse>
    >((_labelId, _input) =>
      Promise.resolve(makeLabelWriteResponse(renamedLabel, 124))
    );

    renderLabelsPage({
      collectionState: makeCollectionState({
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
      screen.findByText(
        "Label created and reflected locally while realtime sync catches up."
      )
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
      screen.findByText(
        "Label renamed and reflected locally while realtime sync catches up."
      )
    ).resolves.toBeVisible();
    expect(updateLabelWithConfirmation).toHaveBeenCalledWith(serverLabel.id, {
      color: "oklch(64% 0.19 28)",
      description: null,
      name: "Emergency",
    });
    await waitFor(() => {
      expect(screen.getByText("Emergency")).toBeVisible();
    });
    expect(screen.queryByText("Fire Safety")).not.toBeInTheDocument();
  });

  it("creates and renames labels from authoritative command responses without local write helpers", async () => {
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
    const awaitTxId = vi
      .fn<(txid: number, timeout?: number) => Promise<boolean>>()
      .mockRejectedValue(new Error("Timeout waiting for txId: 789"));

    renderLabelsPage({
      collectionState: makeCollectionState({
        awaitTxId,
        labels: [],
        status: "ready",
        writeUtils: false,
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
      screen.findByText(
        "Label created and reflected locally while realtime sync catches up."
      )
    ).resolves.toBeVisible();
    expect(createLabelWithConfirmation).toHaveBeenCalledWith({
      color: "oklch(64% 0.19 28)",
      description: null,
      name: "Fire Safety",
    });
    expect(awaitTxId).not.toHaveBeenCalled();
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
      screen.findByText(
        "Label renamed and reflected locally while realtime sync catches up."
      )
    ).resolves.toBeVisible();
    expect(updateLabelWithConfirmation).toHaveBeenCalledWith(serverLabel.id, {
      color: "oklch(64% 0.19 28)",
      description: null,
      name: "Emergency",
    });
    expect(awaitTxId).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(screen.getByText("Emergency")).toBeVisible();
    });
    expect(screen.queryByText("Fire Safety")).not.toBeInTheDocument();
  });

  it("renames labels from the command response when Electric txid confirmation would time out", async () => {
    const user = userEvent.setup();
    const serverLabel = makeLabel({
      id: "33333333-3333-4333-8333-333333333333",
      name: "Fire Safety",
    });
    const renamedLabel = { ...serverLabel, name: "Emergency" };
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
    >(() => Promise.reject(new Error("Timeout waiting for txId: 789")));

    renderLabelsPage({
      collectionState: makeCollectionState({
        awaitTxId,
        labels: [serverLabel],
        status: "ready",
      }),
      updateLabelWithConfirmation,
    });

    await user.click(
      screen.getByRole("button", {
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
      screen.findByText(
        "Label renamed and reflected locally while realtime sync catches up."
      )
    ).resolves.toBeVisible();
    expect(updateLabelWithConfirmation).toHaveBeenCalledWith(serverLabel.id, {
      color: "oklch(64% 0.19 28)",
      description: null,
      name: "Emergency",
    });
    expect(awaitTxId).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(screen.getByText("Emergency")).toBeVisible();
    });
    expect(screen.queryByText("Fire Safety")).not.toBeInTheDocument();
  });

  it("archives labels through authoritative command responses without local write helpers", async () => {
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
        writeUtils: false,
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
        "Label archived and reflected locally while realtime sync catches up."
      )
    ).resolves.toBeVisible();
    expect(archiveLabelWithConfirmation).toHaveBeenCalledWith(serverLabel.id);
    expect(awaitTxId).not.toHaveBeenCalled();
    expect(screen.queryByText("Emergency")).not.toBeInTheDocument();
    await expect(screen.findByText("No labels yet")).resolves.toBeVisible();
  });

  it("disables mouse-driven row actions while another mutation is pending", async () => {
    const user = userEvent.setup();
    const createResponse = Promise.withResolvers<LabelWriteResponse>();
    const createLabelWithConfirmation = vi.fn<
      (input: CreateLabelInput) => Promise<LabelWriteResponse>
    >(() => createResponse.promise);

    renderLabelsPage({
      collectionState: makeCollectionState({
        labels: [urgentLabel],
        status: "ready",
      }),
      createLabelWithConfirmation,
    });

    await user.type(
      screen.getByRole("textbox", { name: /new label name/i }),
      "Fire Safety"
    );
    await user.click(screen.getByRole("button", { name: /create/i }));

    expect(screen.getByRole("button", { name: /create/i })).toBeDisabled();
    const urgentActions = screen.getByRole("button", {
      name: /open actions for urgent/i,
    });
    expect(urgentActions).toBeDisabled();

    await user.click(urgentActions);

    expect(
      screen.queryByRole("menuitem", { name: /archive label/i })
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /create/i })).toBeDisabled();

    createResponse.resolve(
      makeLabelWriteResponse(
        makeLabel({
          id: "44444444-4444-4444-8444-444444444444",
          name: "Fire Safety",
        }),
        123
      )
    );

    await expect(
      screen.findByText(
        "Label created and reflected locally while realtime sync catches up."
      )
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

  it("shows command confirmation failures without changing the active label", async () => {
    const user = userEvent.setup();
    const mutationJournal = createDataPlaneMutationJournal({
      createId: () => "mutation_rename",
      now: () => 1000,
    });
    const collectionState = makeCollectionState({
      labels: [urgentLabel],
      status: "ready",
    });
    const updateLabelWithConfirmation = vi.fn<
      (
        labelId: Label["id"],
        input: UpdateLabelInput
      ) => Promise<LabelWriteResponse>
    >(() => Promise.reject(new Error("Timeout waiting for txId: 102")));

    renderLabelsPage({
      collectionState,
      mutationJournal,
      updateLabelWithConfirmation,
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
        "Label archived and reflected locally while realtime sync catches up."
      )
    ).resolves.toBeVisible();
    expect(screen.queryByText("Urgent")).not.toBeInTheDocument();
  });

  it("shows command-backed empty state when sync health changes after archive", async () => {
    const user = userEvent.setup();
    const archivedLabel = {
      ...urgentLabel,
      archivedAt: "2026-06-18T19:00:00.000Z",
    };
    const collectionState = makeCollectionState({
      labels: [urgentLabel],
      status: "ready",
    });
    const archiveLabelWithConfirmation = vi.fn<
      (labelId: Label["id"]) => Promise<LabelWriteResponse>
    >((_labelId) =>
      Promise.resolve(makeLabelWriteResponse(archivedLabel, 222))
    );

    const { rerender } = renderLabelsPage({
      archiveLabelWithConfirmation,
      collectionState,
      state: "ready",
    });

    await user.click(
      await screen.findByRole("button", { name: /open actions for urgent/i })
    );
    await user.click(
      await screen.findByRole("menuitem", { name: /archive label/i })
    );
    await user.click(screen.getByRole("button", { name: /archive label/i }));
    await expect(
      screen.findByText(
        "Label archived and reflected locally while realtime sync catches up."
      )
    ).resolves.toBeVisible();
    expect(screen.queryByText("Urgent")).not.toBeInTheDocument();

    rerender(
      <LabelsPageHarness
        archiveLabelWithConfirmation={archiveLabelWithConfirmation}
        collectionState={collectionState}
        state="unavailable"
      />
    );

    expect(screen.getByText("No labels yet")).toBeVisible();
    expect(screen.getByText("Realtime labels unavailable")).toBeVisible();
  });

  it("archives labels after command-backed create and rename", async () => {
    const user = userEvent.setup();
    const serverLabel = makeLabel({
      id: "55555555-5555-4555-8555-555555555555",
      name: "Fire Safety",
    });
    const renamedLabel = { ...serverLabel, name: "Emergency" };
    const createLabelWithConfirmation = vi.fn<
      (input: CreateLabelInput) => Promise<LabelWriteResponse>
    >((_input) => Promise.resolve(makeLabelWriteResponse(serverLabel, 101)));
    const updateLabelWithConfirmation = vi.fn<
      (
        labelId: Label["id"],
        input: UpdateLabelInput
      ) => Promise<LabelWriteResponse>
    >((_labelId, _input) =>
      Promise.resolve(makeLabelWriteResponse(renamedLabel, 102))
    );
    const archiveLabelWithConfirmation = vi.fn<
      (labelId: Label["id"]) => Promise<LabelWriteResponse>
    >((_labelId) => Promise.resolve(makeLabelWriteResponse(renamedLabel, 103)));

    renderLabelsPage({
      archiveLabelWithConfirmation,
      collectionState: makeCollectionState({
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
      screen.findByText(
        "Label created and reflected locally while realtime sync catches up."
      )
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
      screen.findByText(
        "Label renamed and reflected locally while realtime sync catches up."
      )
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
        "Label archived and reflected locally while realtime sync catches up."
      )
    ).resolves.toBeVisible();
    expect(archiveLabelWithConfirmation).toHaveBeenCalledWith(serverLabel.id);
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
  mutationJournal,
  organizationRole = "owner",
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
  readonly mutationJournal?:
    | ReturnType<typeof createDataPlaneMutationJournal>
    | undefined;
  readonly organizationRole?: "admin" | "member" | "owner";
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
      mutationJournal={mutationJournal}
      organizationRole={organizationRole}
      state={state}
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
  mutationJournal,
  organizationRole = "owner",
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
  readonly mutationJournal?:
    | ReturnType<typeof createDataPlaneMutationJournal>
    | undefined;
  readonly organizationRole?: "admin" | "member" | "owner";
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
        <OrganizationLabelsSettingsPage
          archiveLabelWithConfirmation={
            archiveLabelWithConfirmation ?? archiveDefaultLabelWithConfirmation
          }
          collectionState={collectionState}
          createLabelWithConfirmation={
            createLabelWithConfirmation ?? createDefaultLabelWithConfirmation
          }
          mutationJournal={mutationJournal}
          organization={TEST_ORGANIZATION}
          organizationRole={organizationRole}
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
        id: labelId,
        name: "Archived",
      }),
      125
    )
  );
}

function makeCollectionState({
  awaitTxId,
  labels,
  status,
  writeUtils = true,
}: {
  readonly awaitTxId?:
    | ((txid: number, timeout?: number) => Promise<boolean>)
    | undefined;
  readonly labels: readonly Label[];
  readonly status: DataPlaneCollectionHealthStatus;
  readonly writeUtils?: boolean | undefined;
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
        : makeCollection(labels, status, awaitTxId, writeUtils),
    health: health as DataPlaneCollectionHealth,
  };
}

function makeCollection(
  labels: readonly Label[],
  status: DataPlaneCollectionHealthStatus,
  awaitTxId?: (txid: number, timeout?: number) => Promise<boolean>,
  writeUtils = true
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
    utils: writeUtils
      ? {
          awaitTxId,
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
        }
      : undefined,
  };
}

function makeLabel({
  id,
  name,
}: {
  readonly id: string;
  readonly name: string;
}): Label {
  return {
    archivedAt: null,
    color: "oklch(64% 0.19 28)",
    createdAt: "2026-06-14T00:00:00.000Z",
    description: null,
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
