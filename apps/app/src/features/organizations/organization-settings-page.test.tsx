import { HotkeysProvider } from "@tanstack/react-hotkeys";
import { decodeOrganizationId } from "@task-tracker/identity-core";
import type { JobLabel, JobLabelIdType } from "@task-tracker/jobs-core";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Effect, pipe } from "effect";

import type { runBrowserJobsRequest as RunBrowserJobsRequest } from "#/features/jobs/jobs-client";
import type { authClient as AuthClient } from "#/lib/auth-client";

import { OrganizationSettingsPage } from "./organization-settings-page";

const organizationId = decodeOrganizationId("org_123");
const nextOrganizationId = decodeOrganizationId("org_456");
const urgentLabelId = "11111111-1111-4111-8111-111111111111" as JobLabelIdType;
const blockedLabelId = "22222222-2222-4222-8222-222222222222" as JobLabelIdType;

const {
  mockedArchiveJobLabel,
  mockedCreateJobLabel,
  mockedInvalidate,
  mockedRunBrowserJobsRequest,
  mockedUpdateJobLabel,
  mockedUpdateOrganization,
} = vi.hoisted(() => ({
  mockedArchiveJobLabel: vi.fn<(input: { labelId: string }) => JobLabel>(),
  mockedCreateJobLabel: vi.fn<(input: { name: string }) => JobLabel>(),
  mockedInvalidate: vi.fn<() => Promise<void>>(),
  mockedRunBrowserJobsRequest:
    vi.fn<
      (
        operation: string,
        execute: Parameters<typeof RunBrowserJobsRequest>[1]
      ) => Effect.Effect<unknown, unknown>
    >(),
  mockedUpdateJobLabel:
    vi.fn<(input: { labelId: string; name: string }) => JobLabel>(),
  mockedUpdateOrganization: vi.fn<
    (input: { data: { name: string }; organizationId: string }) => Promise<{
      data: { id: string; name: string; slug: string } | null;
      error: { message: string; status: number; statusText: string } | null;
    }>
  >(),
}));

vi.mock(import("#/features/jobs/jobs-client"), () => ({
  runBrowserJobsRequest:
    mockedRunBrowserJobsRequest as unknown as typeof RunBrowserJobsRequest,
}));

vi.mock(import("#/lib/auth-client"), () => ({
  authClient: {
    organization: {
      update: mockedUpdateOrganization,
    },
  } as unknown as typeof AuthClient,
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
    mockedRunBrowserJobsRequest.mockImplementation((operation, execute) =>
      pipe(
        execute({
          jobs: {
            createJobLabel: ({ payload }: { payload: { name: string } }) =>
              Effect.sync(() => mockedCreateJobLabel(payload)),
            deleteJobLabel: ({ path }: { path: { labelId: string } }) =>
              Effect.sync(() => mockedArchiveJobLabel(path)),
            updateJobLabel: ({
              path,
              payload,
            }: {
              path: { labelId: string };
              payload: { name: string };
            }) =>
              Effect.sync(() =>
                mockedUpdateJobLabel({
                  labelId: path.labelId,
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
    mockedCreateJobLabel.mockReturnValue(
      buildLabel({
        id: "33333333-3333-4333-8333-333333333333" as JobLabelIdType,
        name: "Needs estimate",
      })
    );
    mockedUpdateJobLabel.mockReturnValue(
      buildLabel({
        id: urgentLabelId,
        name: "Emergency",
      })
    );
    mockedArchiveJobLabel.mockReturnValue(
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

  it("renders editable name and read-only slug for the active organization", () => {
    render(
      <OrganizationSettingsPage
        organization={{
          id: organizationId,
          name: "Acme Field Ops",
          slug: "acme-field-ops",
        }}
        jobLabels={[buildLabel({ id: urgentLabelId, name: "Urgent" })]}
      />
    );

    expect(
      screen.getByRole("heading", { name: "Organization settings" })
    ).toBeVisible();
    expect(screen.getByLabelText("Organization name")).toHaveValue(
      "Acme Field Ops"
    );
    expect(screen.getByText("acme-field-ops")).toBeVisible();
    expect(screen.getByText("Urgent")).toBeVisible();
  }, 10_000);

  it("creates a job label and refreshes route data", async () => {
    const user = userEvent.setup();

    render(
      <OrganizationSettingsPage
        organization={{
          id: organizationId,
          name: "Acme Field Ops",
          slug: "acme-field-ops",
        }}
        jobLabels={[]}
      />
    );

    await user.type(screen.getByLabelText("New label name"), "Needs estimate");
    await user.click(screen.getByRole("button", { name: "Create label" }));

    await waitFor(() => {
      expect(mockedRunBrowserJobsRequest).toHaveBeenCalledWith(
        "JobsBrowser.createJobLabel",
        expect.any(Function)
      );
    });
    expect(mockedCreateJobLabel).toHaveBeenCalledWith({
      name: "Needs estimate",
    });
    await expect(screen.findByText("Needs estimate")).resolves.toBeVisible();
    expect(screen.getByLabelText("New label name")).toHaveValue("");
    expect(mockedInvalidate).toHaveBeenCalledWith();
  }, 10_000);

  it("edits a job label name", async () => {
    const user = userEvent.setup();

    render(
      <OrganizationSettingsPage
        organization={{
          id: organizationId,
          name: "Acme Field Ops",
          slug: "acme-field-ops",
        }}
        jobLabels={[buildLabel({ id: urgentLabelId, name: "Urgent" })]}
      />
    );

    await user.click(screen.getByRole("button", { name: "Edit Urgent" }));
    await user.clear(screen.getByLabelText("Label name"));
    await user.type(screen.getByLabelText("Label name"), "Emergency");
    await user.click(
      screen.getByRole("button", { name: "Save label changes" })
    );

    await waitFor(() => {
      expect(mockedRunBrowserJobsRequest).toHaveBeenCalledWith(
        "JobsBrowser.updateJobLabel",
        expect.any(Function)
      );
    });
    expect(mockedUpdateJobLabel).toHaveBeenCalledWith({
      labelId: String(urgentLabelId),
      name: "Emergency",
    });
    await expect(screen.findByText("Emergency")).resolves.toBeVisible();
  }, 10_000);

  it("archives a job label", async () => {
    const user = userEvent.setup();

    render(
      <OrganizationSettingsPage
        organization={{
          id: organizationId,
          name: "Acme Field Ops",
          slug: "acme-field-ops",
        }}
        jobLabels={[
          buildLabel({ id: urgentLabelId, name: "Urgent" }),
          buildLabel({ id: blockedLabelId, name: "Blocked" }),
        ]}
      />
    );

    await user.click(screen.getByRole("button", { name: "Archive Blocked" }));

    await waitFor(() => {
      expect(mockedRunBrowserJobsRequest).toHaveBeenCalledWith(
        "JobsBrowser.archiveJobLabel",
        expect.any(Function)
      );
    });
    expect(mockedArchiveJobLabel).toHaveBeenCalledWith({
      labelId: String(blockedLabelId),
    });
    await waitFor(() => {
      expect(screen.queryByText("Blocked")).not.toBeInTheDocument();
    });
    expect(screen.getByText("Urgent")).toBeVisible();
  }, 10_000);

  it("validates job label names before creating", async () => {
    const user = userEvent.setup();

    render(
      <OrganizationSettingsPage
        organization={{
          id: organizationId,
          name: "Acme Field Ops",
          slug: "acme-field-ops",
        }}
        jobLabels={[buildLabel({ id: urgentLabelId, name: "Urgent" })]}
      />
    );

    await user.type(screen.getByLabelText("New label name"), "   ");
    await user.click(screen.getByRole("button", { name: "Create label" }));

    expect(
      screen.getByText("Type a label name before creating it.")
    ).toBeVisible();
    expect(mockedRunBrowserJobsRequest).not.toHaveBeenCalled();

    await user.clear(screen.getByLabelText("New label name"));
    await user.type(screen.getByLabelText("New label name"), "urgent");
    await user.click(screen.getByRole("button", { name: "Create label" }));

    expect(
      screen.getByText("A label with that name already exists.")
    ).toBeVisible();
    expect(mockedRunBrowserJobsRequest).not.toHaveBeenCalled();
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
        jobLabels={[buildLabel({ id: urgentLabelId, name: "Waiting on PO" })]}
      />
    );

    await user.type(screen.getByLabelText("New label name"), "Waiting  on PO");
    await user.click(screen.getByRole("button", { name: "Create label" }));

    expect(
      screen.getByText("A label with that name already exists.")
    ).toBeVisible();
    expect(mockedRunBrowserJobsRequest).not.toHaveBeenCalled();
  }, 10_000);

  it("shows a safe error when a job label mutation fails", async () => {
    mockedRunBrowserJobsRequest.mockReturnValueOnce(
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
        jobLabels={[]}
      />
    );

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

    await user.clear(screen.getByLabelText("Organization name"));
    await user.type(screen.getByLabelText("Organization name"), "Northwind");
    await user.click(screen.getByLabelText("Section field"));
    await user.keyboard("{Control>}{Enter}{/Control}");

    expect(mockedUpdateOrganization).not.toHaveBeenCalled();
  }, 10_000);

  it("does not offer a save action before the name changes", () => {
    render(
      <OrganizationSettingsPage
        organization={{
          id: organizationId,
          name: "Acme Field Ops",
          slug: "acme-field-ops",
        }}
      />
    );

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

  it("resets the form baseline when the active organization changes", () => {
    const { rerender } = render(
      <OrganizationSettingsPage
        organization={{
          id: organizationId,
          name: "Acme Field Ops",
          slug: "acme-field-ops",
        }}
      />
    );

    rerender(
      <OrganizationSettingsPage
        organization={{
          id: nextOrganizationId,
          name: "Northwind Field Ops",
          slug: "northwind-field-ops",
        }}
      />
    );

    expect(screen.getByLabelText("Organization name")).toHaveValue(
      "Northwind Field Ops"
    );
    expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
  }, 10_000);

  it("refreshes a pristine organization name when the same organization changes remotely", () => {
    const { rerender } = render(
      <OrganizationSettingsPage
        organization={{
          id: organizationId,
          name: "Acme Field Ops",
          slug: "acme-field-ops",
        }}
      />
    );

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
  readonly id?: JobLabelIdType;
  readonly name?: string;
} = {}): JobLabel {
  return {
    id,
    name,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}
