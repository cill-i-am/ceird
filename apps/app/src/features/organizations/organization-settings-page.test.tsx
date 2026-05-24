import { decodeOrganizationId } from "@ceird/identity-core";
import type { Label, LabelIdType } from "@ceird/labels-core";
import { HotkeysProvider } from "@tanstack/react-hotkeys";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Effect, pipe } from "effect";

import type { runBrowserAppApiRequest as RunBrowserAppApiRequest } from "#/features/api/app-api-client";
import type { authClient as AuthClient } from "#/lib/auth-client";

import { OrganizationSettingsPage } from "./organization-settings-page";

const organizationId = decodeOrganizationId("org_123");
const nextOrganizationId = decodeOrganizationId("org_456");
const urgentLabelId = "11111111-1111-4111-8111-111111111111" as LabelIdType;
const blockedLabelId = "22222222-2222-4222-8222-222222222222" as LabelIdType;

const {
  mockedArchiveLabel,
  mockedClearOrganizationAccessClientCache,
  mockedCreateLabel,
  mockedInvalidate,
  mockedRunBrowserAppApiRequest,
  mockedUpdateLabel,
  mockedUpdateOrganization,
} = vi.hoisted(() => ({
  mockedArchiveLabel: vi.fn<(input: { labelId: string }) => Label>(),
  mockedClearOrganizationAccessClientCache: vi.fn<() => void>(),
  mockedCreateLabel: vi.fn<(input: { name: string }) => Label>(),
  mockedInvalidate: vi.fn<() => Promise<void>>(),
  mockedRunBrowserAppApiRequest:
    vi.fn<
      (
        operation: string,
        execute: Parameters<typeof RunBrowserAppApiRequest>[1]
      ) => Effect.Effect<unknown, unknown>
    >(),
  mockedUpdateLabel:
    vi.fn<(input: { labelId: string; name: string }) => Label>(),
  mockedUpdateOrganization: vi.fn<
    (input: { data: { name: string }; organizationId: string }) => Promise<{
      data: { id: string; name: string; slug: string } | null;
      error: { message: string; status: number; statusText: string } | null;
    }>
  >(),
}));

vi.mock(import("#/features/api/app-api-client"), () => ({
  runBrowserAppApiRequest:
    mockedRunBrowserAppApiRequest as unknown as typeof RunBrowserAppApiRequest,
}));

vi.mock(import("#/lib/auth-client"), () => ({
  authClient: {
    organization: {
      update: mockedUpdateOrganization,
    },
  } as unknown as typeof AuthClient,
}));

vi.mock(import("./organization-access-cache"), () => ({
  clearOrganizationAccessClientCache: mockedClearOrganizationAccessClientCache,
}));

vi.mock(import("./organization-service-areas-section"), () => ({
  OrganizationServiceAreasSection: () => (
    <section aria-label="Service areas test section">
      <label>
        Section field
        <input />
      </label>
    </section>
  ),
}));

vi.mock(import("./organization-rate-card-section"), () => ({
  OrganizationRateCardSection: () => (
    <section aria-label="Rate card test section" />
  ),
}));

vi.mock(import("@tanstack/react-router"), async (importOriginal) => {
  const actual = await importOriginal();

  return {
    ...actual,
    useRouter: (() => ({
      invalidate: mockedInvalidate,
    })) as unknown as typeof actual.useRouter,
  };
});

describe("organization settings page", () => {
  beforeEach(() => {
    mockedInvalidate.mockResolvedValue();
    mockedRunBrowserAppApiRequest.mockImplementation((operation, execute) =>
      pipe(
        execute({
          labels: {
            createLabel: ({ payload }: { payload: { name: string } }) =>
              Effect.sync(() => mockedCreateLabel(payload)),
            deleteLabel: ({ params }: { params: { labelId: string } }) =>
              Effect.sync(() => mockedArchiveLabel(params)),
            updateLabel: ({
              params,
              payload,
            }: {
              params: { labelId: string };
              payload: { name: string };
            }) =>
              Effect.sync(() =>
                mockedUpdateLabel({
                  labelId: params.labelId,
                  name: payload.name,
                })
              ),
          },
        } as never),
        Effect.mapError((error) => error)
      ).pipe(
        Effect.tapError(() =>
          Effect.logDebug(`Mocked ${operation} failed as requested`)
        )
      )
    );
    mockedCreateLabel.mockReturnValue(
      buildLabel({
        id: "33333333-3333-4333-8333-333333333333" as LabelIdType,
        name: "Needs estimate",
      })
    );
    mockedUpdateLabel.mockReturnValue(
      buildLabel({
        id: urgentLabelId,
        name: "Emergency",
      })
    );
    mockedArchiveLabel.mockReturnValue(
      buildLabel({
        id: blockedLabelId,
        name: "Blocked",
      })
    );
    mockedUpdateOrganization.mockResolvedValue({
      data: {
        id: "org_123",
        name: "Northwind Field Ops",
        slug: "acme-field-ops",
      },
      error: null,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  async function selectOrganizationTab(
    name: "General" | "Labels" | "Rate card" | "Service areas"
  ) {
    await userEvent.click(screen.getByRole("tab", { name }));
  }

  it("frames organization settings with direct feature tabs", async () => {
    render(
      <OrganizationSettingsPage
        organization={{
          id: organizationId,
          name: "Acme Field Ops",
          slug: "acme-field-ops",
        }}
        organizationLabels={[buildLabel({ id: urgentLabelId, name: "Urgent" })]}
      />
    );

    expect(
      screen.getByRole("heading", { name: "Organization settings" })
    ).toBeVisible();
    expect(screen.queryByText("Organization")).not.toBeInTheDocument();
    expect(
      screen.queryByText(
        "Keep the workspace identity, labels, service coverage, and billing defaults ready for field operations."
      )
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("region", { name: /organization status/i })
    ).not.toBeInTheDocument();
    const sectionTabs = screen.getByRole("tablist", {
      name: /organization settings sections/i,
    });

    expect(
      within(sectionTabs).queryByRole("tab", { name: "Overview" })
    ).not.toBeInTheDocument();
    expect(
      within(sectionTabs).getByRole("tab", { name: "General" })
    ).toHaveAttribute("aria-selected", "true");
    expect(
      within(sectionTabs).getByRole("tab", { name: "Labels" })
    ).toBeVisible();
    expect(
      within(sectionTabs).getByRole("tab", { name: "Service areas" })
    ).toBeVisible();
    expect(
      within(sectionTabs).getByRole("tab", { name: "Rate card" })
    ).toBeVisible();
    expect(
      within(sectionTabs).queryByRole("tab", { name: "Details" })
    ).not.toBeInTheDocument();
    expect(screen.queryByText("ORGANIZATION")).not.toBeInTheDocument();
    expect(
      screen.queryByText(
        "Keep the workspace identity current for everyone on the team."
      )
    ).not.toBeInTheDocument();
    await selectOrganizationTab("General");
    expect(screen.getByRole("heading", { name: "General" })).toBeVisible();
    expect(
      screen.queryByText("Update the name your team sees across Ceird.")
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText("Organization name")).toHaveValue(
      "Acme Field Ops"
    );

    await selectOrganizationTab("Labels");
    expect(
      screen.queryByText(
        "Manage organization labels used to sort and filter work."
      )
    ).not.toBeInTheDocument();
    expect(screen.getByText("Urgent")).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Label actions for Urgent" })
    ).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Edit Urgent" })
    ).not.toBeInTheDocument();
  }, 10_000);

  it("creates an organization label and refreshes route data", async () => {
    const user = userEvent.setup();

    render(
      <OrganizationSettingsPage
        organization={{
          id: organizationId,
          name: "Acme Field Ops",
          slug: "acme-field-ops",
        }}
        organizationLabels={[]}
      />
    );

    await selectOrganizationTab("Labels");
    await user.type(screen.getByLabelText("New label name"), "Needs estimate");
    await user.click(screen.getByRole("button", { name: "Create label" }));

    await waitFor(() => {
      expect(mockedRunBrowserAppApiRequest).toHaveBeenCalledWith(
        "LabelsBrowser.createLabel",
        expect.any(Function)
      );
    });
    expect(mockedCreateLabel).toHaveBeenCalledWith({
      name: "Needs estimate",
    });
    await expect(screen.findByText("Needs estimate")).resolves.toBeVisible();
    expect(screen.getByLabelText("New label name")).toHaveValue("");
    expect(mockedInvalidate).toHaveBeenCalledWith();
  }, 10_000);

  it("edits an organization label name", async () => {
    const user = userEvent.setup();

    render(
      <OrganizationSettingsPage
        organization={{
          id: organizationId,
          name: "Acme Field Ops",
          slug: "acme-field-ops",
        }}
        organizationLabels={[buildLabel({ id: urgentLabelId, name: "Urgent" })]}
      />
    );

    await selectOrganizationTab("Labels");
    await user.click(
      screen.getByRole("button", { name: "Label actions for Urgent" })
    );
    await user.click(
      await screen.findByRole("menuitem", { name: "Edit label" })
    );
    await user.clear(screen.getByLabelText("Label name"));
    await user.type(screen.getByLabelText("Label name"), "Emergency");
    await user.click(
      screen.getByRole("button", { name: "Save label changes" })
    );

    await waitFor(() => {
      expect(mockedRunBrowserAppApiRequest).toHaveBeenCalledWith(
        "LabelsBrowser.updateLabel",
        expect.any(Function)
      );
    });
    expect(mockedUpdateLabel).toHaveBeenCalledWith({
      labelId: String(urgentLabelId),
      name: "Emergency",
    });
    await expect(screen.findByText("Emergency")).resolves.toBeVisible();
  }, 10_000);

  it("archives an organization label", async () => {
    const user = userEvent.setup();

    render(
      <OrganizationSettingsPage
        organization={{
          id: organizationId,
          name: "Acme Field Ops",
          slug: "acme-field-ops",
        }}
        organizationLabels={[
          buildLabel({ id: urgentLabelId, name: "Urgent" }),
          buildLabel({ id: blockedLabelId, name: "Blocked" }),
        ]}
      />
    );

    await selectOrganizationTab("Labels");
    await user.click(
      screen.getByRole("button", { name: "Label actions for Blocked" })
    );
    await user.click(
      await screen.findByRole("menuitem", { name: "Archive label" })
    );

    await waitFor(() => {
      expect(mockedRunBrowserAppApiRequest).toHaveBeenCalledWith(
        "LabelsBrowser.archiveLabel",
        expect.any(Function)
      );
    });
    expect(mockedArchiveLabel).toHaveBeenCalledWith({
      labelId: String(blockedLabelId),
    });
    await waitFor(() => {
      expect(screen.queryByText("Blocked")).not.toBeInTheDocument();
    });
    expect(screen.getByText("Urgent")).toBeVisible();
  }, 10_000);

  it("validates organization label names before creating", async () => {
    const user = userEvent.setup();

    render(
      <OrganizationSettingsPage
        organization={{
          id: organizationId,
          name: "Acme Field Ops",
          slug: "acme-field-ops",
        }}
        organizationLabels={[buildLabel({ id: urgentLabelId, name: "Urgent" })]}
      />
    );

    await selectOrganizationTab("Labels");
    await user.type(screen.getByLabelText("New label name"), "   ");
    await user.click(screen.getByRole("button", { name: "Create label" }));

    expect(
      screen.getByText("Type a label name before creating it.")
    ).toBeVisible();
    expect(mockedRunBrowserAppApiRequest).not.toHaveBeenCalled();

    await user.clear(screen.getByLabelText("New label name"));
    await user.type(screen.getByLabelText("New label name"), "urgent");
    await user.click(screen.getByRole("button", { name: "Create label" }));

    expect(
      screen.getByText("A label with that name already exists.")
    ).toBeVisible();
    expect(mockedRunBrowserAppApiRequest).not.toHaveBeenCalled();
  }, 10_000);

  it("matches server whitespace normalization when checking duplicate label names", async () => {
    const user = userEvent.setup();

    render(
      <OrganizationSettingsPage
        organization={{
          id: organizationId,
          name: "Acme Field Ops",
          slug: "acme-field-ops",
        }}
        organizationLabels={[
          buildLabel({ id: urgentLabelId, name: "Waiting on PO" }),
        ]}
      />
    );

    await selectOrganizationTab("Labels");
    await user.type(screen.getByLabelText("New label name"), "Waiting  on PO");
    await user.click(screen.getByRole("button", { name: "Create label" }));

    expect(
      screen.getByText("A label with that name already exists.")
    ).toBeVisible();
    expect(mockedRunBrowserAppApiRequest).not.toHaveBeenCalled();
  }, 10_000);

  it("shows a safe error when a label mutation fails", async () => {
    mockedRunBrowserAppApiRequest.mockReturnValueOnce(
      Effect.fail(new Error("conflict"))
    );
    const user = userEvent.setup();

    render(
      <OrganizationSettingsPage
        organization={{
          id: organizationId,
          name: "Acme Field Ops",
          slug: "acme-field-ops",
        }}
        organizationLabels={[]}
      />
    );

    await selectOrganizationTab("Labels");
    await user.type(screen.getByLabelText("New label name"), "Needs estimate");
    await user.click(screen.getByRole("button", { name: "Create label" }));

    await expect(
      screen.findByText("We couldn't save the label. Please try again.")
    ).resolves.toBeVisible();
  }, 10_000);

  it("updates the organization name and refreshes route data", async () => {
    const user = userEvent.setup();

    render(
      <OrganizationSettingsPage
        organization={{
          id: organizationId,
          name: "Acme Field Ops",
          slug: "acme-field-ops",
        }}
      />
    );

    await selectOrganizationTab("General");
    await user.clear(screen.getByLabelText("Organization name"));
    await user.type(screen.getByLabelText("Organization name"), "Northwind");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => {
      expect(mockedUpdateOrganization).toHaveBeenCalledWith({
        data: {
          name: "Northwind",
        },
        organizationId: "org_123",
      });
    });
    await waitFor(() => {
      expect(mockedClearOrganizationAccessClientCache).toHaveBeenCalledOnce();
      expect(mockedInvalidate).toHaveBeenCalledOnce();
    });
    await expect(
      screen.findByText("Organization updated.")
    ).resolves.toBeVisible();

    await user.type(screen.getByLabelText("Organization name"), " Labs");

    expect(screen.queryByText("Organization updated.")).not.toBeInTheDocument();
  }, 10_000);

  it("updates the organization name with the submit hotkey", async () => {
    const user = userEvent.setup();

    render(
      <HotkeysProvider>
        <OrganizationSettingsPage
          organization={{
            id: organizationId,
            name: "Acme Field Ops",
            slug: "acme-field-ops",
          }}
        />
      </HotkeysProvider>
    );

    await selectOrganizationTab("General");
    await user.clear(screen.getByLabelText("Organization name"));
    await user.type(screen.getByLabelText("Organization name"), "Northwind");
    await user.keyboard("{Control>}{Enter}{/Control}");

    await waitFor(() => {
      expect(mockedUpdateOrganization).toHaveBeenCalledWith({
        data: {
          name: "Northwind",
        },
        organizationId: "org_123",
      });
    });
  }, 10_000);

  it("does not submit the organization name hotkey while focus is outside the general form", async () => {
    const user = userEvent.setup();

    render(
      <HotkeysProvider>
        <OrganizationSettingsPage
          organization={{
            id: organizationId,
            name: "Acme Field Ops",
            slug: "acme-field-ops",
          }}
        />
      </HotkeysProvider>
    );

    await selectOrganizationTab("General");
    await user.clear(screen.getByLabelText("Organization name"));
    await user.type(screen.getByLabelText("Organization name"), "Northwind");
    await selectOrganizationTab("Service areas");
    await user.click(screen.getByLabelText("Section field"));
    await user.keyboard("{Control>}{Enter}{/Control}");

    expect(mockedUpdateOrganization).not.toHaveBeenCalled();
  }, 10_000);

  it("does not offer a save action before the name changes", async () => {
    render(
      <OrganizationSettingsPage
        organization={{
          id: organizationId,
          name: "Acme Field Ops",
          slug: "acme-field-ops",
        }}
      />
    );

    await selectOrganizationTab("General");
    expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
    expect(mockedUpdateOrganization).not.toHaveBeenCalled();
  }, 10_000);

  it("shows a safe error when the update fails", async () => {
    mockedUpdateOrganization.mockResolvedValue({
      data: null,
      error: {
        message: "Forbidden",
        status: 403,
        statusText: "Forbidden",
      },
    });
    const user = userEvent.setup();

    render(
      <OrganizationSettingsPage
        organization={{
          id: organizationId,
          name: "Acme Field Ops",
          slug: "acme-field-ops",
        }}
      />
    );

    await selectOrganizationTab("General");
    await user.clear(screen.getByLabelText("Organization name"));
    await user.type(screen.getByLabelText("Organization name"), "Northwind");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await expect(
      screen.findByText(
        "We couldn't update the organization. Please try again."
      )
    ).resolves.toBeVisible();
  }, 10_000);

  it("shows a safe error when the update request rejects", async () => {
    mockedUpdateOrganization.mockRejectedValue(new Error("network down"));
    const user = userEvent.setup();

    render(
      <OrganizationSettingsPage
        organization={{
          id: organizationId,
          name: "Acme Field Ops",
          slug: "acme-field-ops",
        }}
      />
    );

    await selectOrganizationTab("General");
    await user.clear(screen.getByLabelText("Organization name"));
    await user.type(screen.getByLabelText("Organization name"), "Northwind");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await expect(
      screen.findByText(
        "We couldn't update the organization. Please try again."
      )
    ).resolves.toBeVisible();
    expect(mockedInvalidate).not.toHaveBeenCalled();
  }, 10_000);

  it("resets the form baseline when the active organization changes", async () => {
    const { rerender } = render(
      <OrganizationSettingsPage
        organization={{
          id: organizationId,
          name: "Acme Field Ops",
          slug: "acme-field-ops",
        }}
      />
    );

    await selectOrganizationTab("General");
    rerender(
      <OrganizationSettingsPage
        organization={{
          id: nextOrganizationId,
          name: "Northwind Field Ops",
          slug: "northwind-field-ops",
        }}
      />
    );

    await selectOrganizationTab("General");
    expect(screen.getByLabelText("Organization name")).toHaveValue(
      "Northwind Field Ops"
    );
    expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
  }, 10_000);

  it("refreshes a pristine organization name when the same organization changes remotely", async () => {
    const { rerender } = render(
      <OrganizationSettingsPage
        organization={{
          id: organizationId,
          name: "Acme Field Ops",
          slug: "acme-field-ops",
        }}
      />
    );

    await selectOrganizationTab("General");
    rerender(
      <OrganizationSettingsPage
        organization={{
          id: organizationId,
          name: "Acme Field Services",
          slug: "acme-field-ops",
        }}
      />
    );

    expect(screen.getByLabelText("Organization name")).toHaveValue(
      "Acme Field Services"
    );
    expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
  }, 10_000);

  it("preserves dirty organization name edits when same-organization props refresh", async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <OrganizationSettingsPage
        organization={{
          id: organizationId,
          name: "Acme Field Ops",
          slug: "acme-field-ops",
        }}
      />
    );

    await selectOrganizationTab("General");
    await user.clear(screen.getByLabelText("Organization name"));
    await user.type(screen.getByLabelText("Organization name"), "Local edit");

    rerender(
      <OrganizationSettingsPage
        organization={{
          id: organizationId,
          name: "Remote edit",
          slug: "acme-field-ops",
        }}
      />
    );

    expect(screen.getByLabelText("Organization name")).toHaveValue(
      "Local edit"
    );
    expect(screen.getByRole("button", { name: "Save changes" })).toBeEnabled();
  }, 10_000);
});

function buildLabel({
  id = urgentLabelId,
  name = "Urgent",
}: {
  readonly id?: LabelIdType;
  readonly name?: string;
} = {}): Label {
  return {
    id,
    name,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}
