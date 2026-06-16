import { decodeOrganizationSummary } from "@ceird/identity-core";
import type { Label } from "@ceird/labels-core";
import { HotkeysProvider } from "@tanstack/react-hotkeys";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { TooltipProvider } from "#/components/ui/tooltip";
import { createDataPlaneCollectionHealth } from "#/data-plane/collection-health";
import type {
  DataPlaneCollectionHealth,
  DataPlaneCollectionHealthStatus,
} from "#/data-plane/collection-health";

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

  it("keeps row actions accessible while deferring mutation behavior", async () => {
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

    expect(
      screen.getByText(
        "Edit for Urgent will be handled by the label mutation confirmation flow."
      )
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", { name: /open actions for urgent/i })
    );
    await user.click(
      await screen.findByRole("menuitem", { name: /archive label/i })
    );
    expect(
      screen.getByText(
        "Archive for Urgent will be handled by the label mutation confirmation flow."
      )
    ).toBeInTheDocument();
  });

  it("focuses label search from the route hotkey", async () => {
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
  });
});

function renderLabelsPage({
  collectionState,
  organizationRole = "owner",
}: {
  readonly collectionState: ReturnType<typeof makeCollectionState>;
  readonly organizationRole?: "admin" | "member" | "owner";
}) {
  return render(
    <LabelsPageHarness
      collectionState={collectionState}
      organizationRole={organizationRole}
    />
  );
}

function LabelsPageHarness({
  collectionState,
  organizationRole = "owner",
}: {
  readonly collectionState: ReturnType<typeof makeCollectionState>;
  readonly organizationRole?: "admin" | "member" | "owner";
}) {
  return (
    <HotkeysProvider>
      <TooltipProvider>
        <OrganizationLabelsSettingsPage
          collectionState={collectionState}
          organization={TEST_ORGANIZATION}
          organizationRole={organizationRole}
        />
      </TooltipProvider>
    </HotkeysProvider>
  );
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
  return {
    entries: () =>
      labels
        .map((label): [string | number, Label] => [label.id, label])
        .values(),
    status,
    subscribeChanges: (callback: () => void) => {
      queueMicrotask(callback);

      return {
        requestSnapshot: () => queueMicrotask(callback),
        unsubscribe: vi.fn<() => void>(),
      };
    },
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
    createdAt: "2026-06-14T00:00:00.000Z",
    id: id as Label["id"],
    name,
    updatedAt: "2026-06-14T00:00:00.000Z",
  };
}
