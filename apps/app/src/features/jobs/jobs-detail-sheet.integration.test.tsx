import { decodeOrganizationId } from "@ceird/identity-core";
import type {
  ActivityIdType,
  CommentIdType,
  ContactIdType,
  CostLineIdType,
  JobDetailResponse,
  UserIdType,
  VisitIdType,
  WorkItemIdType,
} from "@ceird/jobs-core";
import type { LabelIdType } from "@ceird/labels-core";
import type { ServiceAreaIdType, SiteIdType } from "@ceird/sites-core";
/* oxlint-disable vitest/prefer-import-in-mock */
import { RegistryProvider, useAtomValue } from "@effect-atom/atom-react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Effect } from "effect";
import type * as EffectPackage from "effect";
import type { ComponentProps, ReactNode } from "react";

import { CommandBarProvider } from "#/features/command-bar/command-bar";

import { JobsDetailSheet } from "./jobs-detail-sheet";
import {
  jobsListStateAtom,
  jobsOptionsStateAtom,
  seedJobsListState,
  seedJobsOptionsState,
} from "./jobs-state";

type EffectClientMock = (...args: unknown[]) => unknown;
type NavigateMock = (...args: unknown[]) => Promise<void>;

const workItemId = "11111111-1111-4111-8111-111111111111" as WorkItemIdType;
const actorUserId = "22222222-2222-4222-8222-222222222222" as UserIdType;
const siteId = "33333333-3333-4333-8333-333333333333" as SiteIdType;
const contactId = "44444444-4444-4444-8444-444444444444" as ContactIdType;
const urgentLabelId = "99999999-9999-4999-8999-999999999999" as LabelIdType;
const newLabelId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" as LabelIdType;
const serviceAreaId =
  "55555555-5555-4555-8555-555555555555" as ServiceAreaIdType;
const organizationId = decodeOrganizationId("org_123");

const {
  mockedAddJobCostLine,
  mockedAddJobComment,
  mockedAddJobVisit,
  mockedAssignJobLabel,
  mockedCreateLabel,
  mockedGetJobDetail,
  mockedListJobs,
  mockedMakeBrowserAppApiClient,
  mockedNavigate,
  mockedRemoveJobLabel,
  mockedPatchJob,
  mockedReopenJob,
  mockedTransitionJob,
} = vi.hoisted(() => ({
  mockedAddJobCostLine: vi.fn<EffectClientMock>(),
  mockedAddJobComment: vi.fn<EffectClientMock>(),
  mockedAddJobVisit: vi.fn<EffectClientMock>(),
  mockedAssignJobLabel: vi.fn<EffectClientMock>(),
  mockedCreateLabel: vi.fn<EffectClientMock>(),
  mockedGetJobDetail: vi.fn<EffectClientMock>(),
  mockedListJobs: vi.fn<EffectClientMock>(),
  mockedMakeBrowserAppApiClient: vi.fn<EffectClientMock>(),
  mockedNavigate: vi.fn<NavigateMock>(),
  mockedRemoveJobLabel: vi.fn<EffectClientMock>(),
  mockedPatchJob: vi.fn<EffectClientMock>(),
  mockedReopenJob: vi.fn<EffectClientMock>(),
  mockedTransitionJob: vi.fn<EffectClientMock>(),
}));

vi.mock(import("@tanstack/react-router"), async (importActual) => {
  const actual = await importActual();

  return {
    ...actual,
    useNavigate: (() =>
      mockedNavigate as ReturnType<
        typeof actual.useNavigate
      >) as typeof actual.useNavigate,
  };
});

vi.mock("@hugeicons/react", () => ({
  HugeiconsIcon: (({ icon }: { icon?: unknown }) => (
    <span data-testid="hugeicon">{String(icon ?? "icon")}</span>
  )) as never,
}));

vi.mock("#/components/ui/command-select", () => ({
  CommandSelect: ({
    ariaInvalid: _ariaInvalid,
    emptyText: _emptyText,
    groups,
    id,
    onValueChange,
    placeholder: _placeholder,
    searchPlaceholder: _searchPlaceholder,
    value,
    ...props
  }: ComponentProps<"select"> & {
    ariaInvalid?: boolean;
    emptyText?: string;
    groups: readonly {
      readonly options: readonly {
        readonly label: string;
        readonly value: string;
      }[];
    }[];
    onValueChange: (value: string) => void;
    placeholder?: string;
    searchPlaceholder?: string;
  }) => (
    <select
      id={id}
      value={value}
      onChange={(event) => onValueChange(event.target.value)}
      {...props}
    >
      {groups.flatMap((group) =>
        group.options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))
      )}
    </select>
  ),
}));

vi.mock("#/components/ui/responsive-drawer", () => ({
  ResponsiveDrawer: ({
    children,
    open = true,
  }: {
    children?: ReactNode;
    open?: boolean;
  }) => (open ? <div>{children}</div> : null),
}));

vi.mock("#/components/ui/drawer", () => ({
  DrawerContent: ({ children }: { children?: ReactNode }) => (
    <section>{children}</section>
  ),
  DrawerDescription: ({ children }: { children?: ReactNode }) => (
    <p>{children}</p>
  ),
  DrawerFooter: ({ children }: { children?: ReactNode }) => (
    <footer>{children}</footer>
  ),
  DrawerHeader: ({ children }: { children?: ReactNode }) => (
    <header>{children}</header>
  ),
  DrawerTitle: ({ children }: { children?: ReactNode }) => <h2>{children}</h2>,
}));

vi.mock("#/components/ui/popover", () => ({
  Popover: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  PopoverContent: ({ children }: { children?: ReactNode }) => (
    <div>{children}</div>
  ),
  PopoverTrigger: ({
    children,
    id,
    render: _render,
    ...props
  }: ComponentProps<"button"> & {
    children?: ReactNode;
    render?: unknown;
  }) => (
    <button type="button" id={id} {...props}>
      {children}
    </button>
  ),
}));

vi.mock("#/features/api/app-api-client", async () => {
  const { Effect: EffectModule } =
    await vi.importActual<typeof EffectPackage>("effect");

  return {
    makeBrowserAppApiClient: mockedMakeBrowserAppApiClient,
    provideBrowserAppApiHttp: (effect: unknown) => effect,
    runBrowserAppApiRequest: (
      _operation: string,
      execute: (client: unknown) => unknown
    ) =>
      (mockedMakeBrowserAppApiClient() as Effect.Effect<unknown, unknown>).pipe(
        EffectModule.flatMap(
          (client) => execute(client) as Effect.Effect<unknown, unknown>
        )
      ),
  };
});

describe("jobs detail sheet integration", () => {
  beforeEach(() => {
    mockedAddJobCostLine.mockReset();
    mockedAddJobComment.mockReset();
    mockedAddJobVisit.mockReset();
    mockedAssignJobLabel.mockReset();
    mockedCreateLabel.mockReset();
    mockedGetJobDetail.mockReset();
    mockedListJobs.mockReset();
    mockedMakeBrowserAppApiClient.mockReset();
    mockedNavigate.mockReset();
    mockedRemoveJobLabel.mockReset();
    mockedPatchJob.mockReset();
    mockedReopenJob.mockReset();
    mockedTransitionJob.mockReset();

    mockedMakeBrowserAppApiClient.mockImplementation(() =>
      Effect.succeed({
        jobs: {
          addJobCostLine: mockedAddJobCostLine,
          addJobComment: mockedAddJobComment,
          addJobVisit: mockedAddJobVisit,
          assignJobLabel: mockedAssignJobLabel,
          getJobDetail: mockedGetJobDetail,
          listJobs: mockedListJobs,
          removeJobLabel: mockedRemoveJobLabel,
          patchJob: mockedPatchJob,
          reopenJob: mockedReopenJob,
          transitionJob: mockedTransitionJob,
        },
        labels: {
          createLabel: mockedCreateLabel,
        },
      })
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it(
    "opens external collaborator detail under the command bar without recursive updates",
    {
      timeout: 10_000,
    },
    () => {
      renderDetailSheet(
        buildDetail({
          costs: undefined,
          activity: [],
        }),
        {
          commandBar: true,
          viewer: {
            role: "external",
            userId: actorUserId,
          },
        }
      );

      expect(screen.getByText("Inspect boiler")).toBeInTheDocument();
      expect(screen.getAllByText("Depot").length).toBeGreaterThan(0);
      expect(screen.getAllByText("North").length).toBeGreaterThan(0);
      expect(
        screen.queryByRole("button", { name: /apply status change/i })
      ).not.toBeInTheDocument();
      expect(screen.queryByText("Site assignment")).not.toBeInTheDocument();
      expect(screen.queryByText("Visits")).not.toBeInTheDocument();
      expect(screen.queryByText("Activity")).not.toBeInTheDocument();
      expect(
        screen.queryByText("Cost details are not available here.")
      ).not.toBeInTheDocument();
    }
  );

  it(
    "assigns an existing label and syncs detail activity plus the jobs list",
    {
      timeout: 10_000,
    },
    async () => {
      mockedAssignJobLabel.mockReturnValue(
        Effect.succeed(
          buildDetail({
            activity: [
              buildLabelActivity("label_added", urgentLabelId, "Urgent"),
              ...buildDetail().activity,
            ],
            labels: [buildLabel(urgentLabelId, "Urgent")],
          })
        )
      );

      const user = userEvent.setup();
      renderDetailSheet();

      await user.click(screen.getByRole("button", { name: /add label/i }));
      await user.click(screen.getByRole("option", { name: "Urgent" }));

      await expect(
        screen.findByText("Taylor Owner added the Urgent label.")
      ).resolves.toBeInTheDocument();
      expect(screen.getByTestId("list-labels")).toHaveTextContent("Urgent");
      expect(mockedAssignJobLabel).toHaveBeenCalledWith({
        path: { workItemId },
        payload: { labelId: urgentLabelId },
      });
    }
  );

  it(
    "creates and assigns an inline label while updating the options lookup",
    {
      timeout: 10_000,
    },
    async () => {
      const newLabel = buildLabel(newLabelId, "Warranty");
      mockedCreateLabel.mockReturnValue(Effect.succeed(newLabel));
      mockedAssignJobLabel.mockReturnValue(
        Effect.succeed(
          buildDetail({
            activity: [
              buildLabelActivity("label_added", newLabelId, "Warranty"),
            ],
            labels: [newLabel],
          })
        )
      );

      const user = userEvent.setup();
      renderDetailSheet();

      await user.click(screen.getByRole("button", { name: /add label/i }));
      await user.type(screen.getByPlaceholderText("Search labels"), "Warranty");
      await user.click(
        screen.getByRole("option", {
          name: 'Create new label: "Warranty"',
        })
      );

      await waitFor(() => {
        expect(screen.getAllByText("Warranty").length).toBeGreaterThan(0);
      });
      expect(screen.getByTestId("option-labels")).toHaveTextContent(
        "Urgent | Warranty"
      );
      expect(screen.getByTestId("list-labels")).toHaveTextContent("Warranty");
      expect(mockedCreateLabel).toHaveBeenCalledWith({
        payload: { name: "Warranty" },
      });
      expect(mockedAssignJobLabel).toHaveBeenCalledWith({
        path: { workItemId },
        payload: { labelId: newLabelId },
      });
    }
  );

  it(
    "removes an assigned label and syncs detail activity plus the jobs list",
    {
      timeout: 10_000,
    },
    async () => {
      mockedRemoveJobLabel.mockReturnValue(
        Effect.succeed(
          buildDetail({
            activity: [
              buildLabelActivity("label_removed", urgentLabelId, "Urgent"),
            ],
            labels: [],
          })
        )
      );

      const user = userEvent.setup();
      renderDetailSheet(
        buildDetail({ labels: [buildLabel(urgentLabelId, "Urgent")] })
      );

      await user.click(
        screen.getByRole("button", { name: /remove urgent label/i })
      );

      await expect(
        screen.findByText("Taylor Owner removed the Urgent label.")
      ).resolves.toBeInTheDocument();
      expect(screen.getByTestId("list-labels")).toHaveTextContent("none");
      expect(mockedRemoveJobLabel).toHaveBeenCalledWith({
        path: { workItemId, labelId: urgentLabelId },
      });
    }
  );

  it(
    "keeps a status transition successful when the follow-up detail and list refresh both fail",
    {
      timeout: 10_000,
    },
    async () => {
      mockedTransitionJob.mockReturnValue(
        Effect.succeed({
          ...buildDetail().job,
          completedAt: "2026-04-24T10:00:00.000Z",
          completedByUserId: actorUserId,
          status: "completed",
          updatedAt: "2026-04-24T10:00:00.000Z",
        })
      );
      mockedGetJobDetail.mockReturnValue(
        Effect.fail(new Error("refresh failed"))
      );
      mockedListJobs.mockReturnValue(Effect.fail(new Error("refresh failed")));

      const user = userEvent.setup();
      renderDetailSheet();

      await user.selectOptions(
        screen.getByLabelText("Next status"),
        "completed"
      );
      await user.click(
        screen.getByRole("button", { name: /apply status change/i })
      );

      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: /reopen job/i })
        ).toBeInTheDocument();
      });

      expect(screen.getByText("Completed")).toBeInTheDocument();
      expect(screen.getAllByText("PO-4471").length).toBeGreaterThan(0);
      expect(screen.getAllByText("pat@example.com").length).toBeGreaterThan(0);
      expect(screen.getAllByText("+353 87 765 4321").length).toBeGreaterThan(0);
      expect(
        screen.getAllByText("Use email for routine updates.").length
      ).toBeGreaterThan(0);
      expect(
        screen.getByText("Use reception and the south gate.")
      ).toBeInTheDocument();
      expect(
        screen.getByRole("link", { name: /open in google maps/i })
      ).toBeInTheDocument();
      expect(screen.getByTestId("list-statuses")).toHaveTextContent(
        "completed"
      );
      expect(
        screen.queryByText(/that update didn't land/i)
      ).not.toBeInTheDocument();
    }
  );

  it(
    "keeps a newly added comment visible when the follow-up detail refresh fails",
    {
      timeout: 10_000,
    },
    async () => {
      mockedAddJobComment.mockReturnValue(
        Effect.succeed({
          authorUserId: actorUserId,
          body: "Crew returning first thing tomorrow.",
          createdAt: "2026-04-24T11:00:00.000Z",
          id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" as CommentIdType,
          workItemId,
        })
      );
      mockedGetJobDetail.mockReturnValue(
        Effect.fail(new Error("refresh failed"))
      );

      const user = userEvent.setup();
      renderDetailSheet();

      await user.type(
        screen.getByLabelText("Add a comment"),
        "Crew returning first thing tomorrow."
      );
      await user.click(screen.getByRole("button", { name: /add comment/i }));

      await expect(
        screen.findByText("Crew returning first thing tomorrow.")
      ).resolves.toBeInTheDocument();
      expect(
        screen.queryByText(/that update didn't land/i)
      ).not.toBeInTheDocument();
    }
  );

  it(
    "lets an external collaborator add a visible attributed comment",
    {
      timeout: 10_000,
    },
    async () => {
      mockedAddJobComment.mockReturnValue(
        Effect.succeed({
          authorName: "External Partner",
          authorUserId: actorUserId,
          body: "I can meet the technician at reception.",
          createdAt: "2026-04-24T11:00:00.000Z",
          id: "abababab-abab-4aba-8bab-abababababab" as CommentIdType,
          workItemId,
        })
      );
      mockedGetJobDetail.mockReturnValue(
        Effect.fail(new Error("refresh failed"))
      );

      const user = userEvent.setup();
      renderDetailSheet(
        buildDetail({
          activity: [],
          costs: undefined,
          viewerAccess: {
            canComment: true,
            visibility: "external",
          },
        }),
        {
          viewer: {
            role: "external",
            userId: actorUserId,
          },
        }
      );

      await user.type(
        screen.getByLabelText("Add a comment"),
        "I can meet the technician at reception."
      );
      await user.click(screen.getByRole("button", { name: /add comment/i }));

      await expect(
        screen.findByText("I can meet the technician at reception.")
      ).resolves.toBeInTheDocument();
      expect(screen.getByText("External Partner")).toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: /apply status change/i })
      ).not.toBeInTheDocument();
      expect(screen.queryByText("Visits")).not.toBeInTheDocument();
      expect(screen.queryByText("Activity")).not.toBeInTheDocument();
    }
  );

  it(
    "keeps a newly logged visit visible when the follow-up detail refresh fails",
    {
      timeout: 10_000,
    },
    async () => {
      mockedAddJobVisit.mockReturnValue(
        Effect.succeed({
          authorUserId: actorUserId,
          createdAt: "2026-04-24T12:30:00.000Z",
          durationMinutes: 120,
          id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" as VisitIdType,
          note: "Returned with the pressure kit.",
          visitDate: "2026-04-24",
          workItemId,
        })
      );
      mockedGetJobDetail.mockReturnValue(
        Effect.fail(new Error("refresh failed"))
      );

      const user = userEvent.setup();
      renderDetailSheet();

      await user.clear(screen.getByLabelText("Visit date"));
      await user.type(screen.getByLabelText("Visit date"), "2026-04-24");
      await user.type(
        screen.getByLabelText("Visit note"),
        "Returned with the pressure kit."
      );
      await user.click(screen.getByRole("button", { name: /log visit/i }));

      await expect(
        screen.findByText("Returned with the pressure kit.")
      ).resolves.toBeInTheDocument();
      const visitNotes = screen
        .getAllByText(/Returned with the pressure kit.|Replaced faulty relay/)
        .map((node) => node.textContent);
      expect(visitNotes).toStrictEqual([
        "Returned with the pressure kit.",
        "Replaced faulty relay and tested startup.",
      ]);
      expect(
        screen.queryByText(/that update didn't land/i)
      ).not.toBeInTheDocument();
    }
  );

  it(
    "shows cost totals and keeps a newly added cost line visible when refresh fails",
    {
      timeout: 10_000,
    },
    async () => {
      mockedAddJobCostLine.mockReturnValue(
        Effect.succeed({
          authorUserId: actorUserId,
          createdAt: "2026-04-24T13:00:00.000Z",
          description: "Two hours install labour",
          id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaab" as CostLineIdType,
          lineTotalMinor: 13_000,
          quantity: 2,
          type: "labour",
          unitPriceMinor: 6500,
          workItemId,
        })
      );
      mockedGetJobDetail.mockReturnValue(
        Effect.fail(new Error("refresh failed"))
      );

      const user = userEvent.setup();
      renderDetailSheet();

      expect(screen.getByText("Cost total")).toBeInTheDocument();
      expect(screen.getByText("€45.00")).toBeInTheDocument();

      await user.selectOptions(screen.getByLabelText("Cost type"), "labour");
      await user.type(
        screen.getByLabelText("Cost description"),
        "Two hours install labour"
      );
      await user.clear(screen.getByLabelText("Quantity"));
      await user.type(screen.getByLabelText("Quantity"), "2");
      await user.clear(screen.getByLabelText("Unit price"));
      await user.type(screen.getByLabelText("Unit price"), "65");
      await user.click(screen.getByRole("button", { name: /add cost line/i }));

      await expect(
        screen.findByText("Two hours install labour")
      ).resolves.toBeInTheDocument();
      expect(screen.getByText("€175.00")).toBeInTheDocument();
      expect(
        screen.queryByText(/that update didn't land/i)
      ).not.toBeInTheDocument();
    }
  );

  it(
    "clears stale rich contact and site detail when site reassignment clears them and refresh fails",
    {
      timeout: 10_000,
    },
    async () => {
      mockedPatchJob.mockReturnValue(
        Effect.succeed({
          ...buildDetail().job,
          contactId: undefined,
          siteId: undefined,
          updatedAt: "2026-04-24T13:00:00.000Z",
        })
      );
      mockedGetJobDetail.mockReturnValue(
        Effect.fail(new Error("refresh failed"))
      );

      const user = userEvent.setup();
      renderDetailSheet();

      await user.selectOptions(screen.getByLabelText("Site"), "__none__");
      await user.click(screen.getByRole("button", { name: /save site/i }));

      await waitFor(() => {
        expect(screen.getAllByText("No contact yet").length).toBeGreaterThan(0);
      });
      expect(screen.getAllByText("No site yet").length).toBeGreaterThan(0);
      expect(
        screen.queryByText("Use email for routine updates.")
      ).not.toBeInTheDocument();
      expect(screen.queryByText("pat@example.com")).not.toBeInTheDocument();
      expect(
        screen.queryByText("Use reception and the south gate.")
      ).not.toBeInTheDocument();
    }
  );
});

function renderDetailSheet(
  detail: JobDetailResponse = buildDetail(),
  options: {
    readonly commandBar?: boolean;
    readonly viewer?: ComponentProps<typeof JobsDetailSheet>["viewer"];
  } = {}
) {
  const content = (
    <RegistryProvider
      initialValues={[
        [
          jobsListStateAtom,
          seedJobsListState(organizationId, {
            items: [
              {
                assigneeId: actorUserId,
                contactId,
                createdAt: "2026-04-23T10:00:00.000Z",
                externalReference: "PO-4471",
                id: workItemId,
                kind: "job",
                labels: detail.job.labels,
                priority: "medium",
                siteId,
                status: "in_progress",
                title: "Inspect boiler",
                updatedAt: "2026-04-23T12:00:00.000Z",
              },
            ],
            nextCursor: undefined,
          }),
        ],
        [
          jobsOptionsStateAtom,
          seedJobsOptionsState(organizationId, {
            contacts: [
              {
                email: "pat@example.com",
                id: contactId,
                name: "Pat Contact",
                phone: "+353 87 765 4321",
                siteIds: [siteId],
              },
            ],
            labels: [buildLabel(urgentLabelId, "Urgent")],
            members: [
              {
                id: actorUserId,
                name: "Taylor Owner",
              },
            ],
            serviceAreas: [
              {
                id: serviceAreaId,
                name: "North",
              },
            ],
            sites: [
              {
                accessNotes: "Use reception and the south gate.",
                addressLine1: "1 Custom House Quay",
                addressLine2: "North Dock",
                county: "Dublin",
                country: "IE",
                eircode: "D01 X2X2",
                geocodedAt: "2026-04-27T10:00:00.000Z",
                geocodingProvider: "stub",
                latitude: 53.3498,
                id: siteId,
                name: "Depot",
                longitude: -6.2603,
                serviceAreaId,
                serviceAreaName: "North",
                town: "Dublin",
              },
            ],
          }),
        ],
      ]}
    >
      <JobsDetailSheet
        initialDetail={detail}
        viewer={
          options.viewer ?? {
            role: "owner",
            userId: actorUserId,
          }
        }
      />
      <JobsListProbe />
      <JobsOptionsProbe />
    </RegistryProvider>
  );

  return render(
    options.commandBar ? (
      <CommandBarProvider>{content}</CommandBarProvider>
    ) : (
      content
    )
  );
}

function JobsListProbe() {
  const listState = useAtomValue(jobsListStateAtom);

  return (
    <>
      <output data-testid="list-statuses">
        {listState.items.map((job) => job.status).join(" | ")}
      </output>
      <output data-testid="list-labels">
        {listState.items
          .flatMap((job) => job.labels.map((label) => label.name))
          .join(" | ") || "none"}
      </output>
    </>
  );
}

function JobsOptionsProbe() {
  const optionsState = useAtomValue(jobsOptionsStateAtom);

  return (
    <output data-testid="option-labels">
      {optionsState.data.labels.map((label) => label.name).join(" | ") ||
        "none"}
    </output>
  );
}

function buildDetail(
  overrides: {
    readonly activity?: JobDetailResponse["activity"];
    readonly comments?: JobDetailResponse["comments"];
    readonly costs?: JobDetailResponse["costs"];
    readonly labels?: JobDetailResponse["job"]["labels"];
    readonly viewerAccess?: JobDetailResponse["viewerAccess"];
  } = {}
): JobDetailResponse {
  const defaultCosts: JobDetailResponse["costs"] = {
    lines: [
      {
        authorUserId: actorUserId,
        createdAt: "2026-04-23T12:00:00.000Z",
        description: "Replacement relay",
        id: "99999999-9999-4999-8999-999999999999" as CostLineIdType,
        lineTotalMinor: 4500,
        quantity: 1,
        type: "material",
        unitPriceMinor: 4500,
        workItemId,
      },
    ],
    summary: {
      subtotalMinor: 4500,
    },
  };

  return {
    activity: overrides.activity ?? [
      {
        actorUserId,
        createdAt: "2026-04-23T10:00:00.000Z",
        id: "66666666-6666-4666-8666-666666666666" as ActivityIdType,
        payload: {
          eventType: "job_created",
          kind: "job",
          priority: "medium",
          title: "Inspect boiler",
        },
        workItemId,
      },
    ],
    comments: overrides.comments ?? [
      {
        authorName: "Taylor Owner",
        authorUserId: actorUserId,
        body: "Checked the burner and reset the controls.",
        createdAt: "2026-04-23T11:00:00.000Z",
        id: "77777777-7777-4777-8777-777777777777" as CommentIdType,
        workItemId,
      },
    ],
    costs: "costs" in overrides ? overrides.costs : defaultCosts,
    viewerAccess: overrides.viewerAccess ?? {
      canComment: true,
      visibility: "internal" as const,
    },
    contact: {
      email: "pat@example.com",
      id: contactId,
      name: "Pat Contact",
      notes: "Use email for routine updates.",
      phone: "+353 87 765 4321",
    },
    site: {
      accessNotes: "Use reception and the south gate.",
      addressLine1: "1 Custom House Quay",
      addressLine2: "North Dock",
      county: "Dublin",
      country: "IE",
      eircode: "D01 X2X2",
      geocodedAt: "2026-04-27T10:00:00.000Z",
      geocodingProvider: "stub",
      latitude: 53.3498,
      id: siteId,
      name: "Depot",
      longitude: -6.2603,
      serviceAreaId,
      serviceAreaName: "North",
      town: "Dublin",
    },
    job: {
      assigneeId: actorUserId,
      contactId,
      createdAt: "2026-04-23T10:00:00.000Z",
      createdByUserId: actorUserId,
      externalReference: "PO-4471",
      id: workItemId,
      kind: "job",
      labels: overrides.labels ?? [],
      priority: "medium",
      siteId,
      status: "in_progress",
      title: "Inspect boiler",
      updatedAt: "2026-04-23T12:00:00.000Z",
    },
    visits: [
      {
        authorUserId: actorUserId,
        createdAt: "2026-04-23T11:30:00.000Z",
        durationMinutes: 60,
        id: "88888888-8888-4888-8888-888888888888" as VisitIdType,
        note: "Replaced faulty relay and tested startup.",
        visitDate: "2026-04-23",
        workItemId,
      },
    ],
  };
}

function buildLabel(id: LabelIdType, name: string) {
  return {
    createdAt: "2026-04-23T09:00:00.000Z",
    id,
    name,
    updatedAt: "2026-04-23T09:00:00.000Z",
  };
}

function buildLabelActivity(
  eventType: "label_added" | "label_removed",
  labelId: LabelIdType,
  labelName: string
): JobDetailResponse["activity"][number] {
  return {
    actorUserId,
    createdAt: "2026-04-24T10:00:00.000Z",
    id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc" as ActivityIdType,
    payload: {
      eventType,
      labelId,
      labelName,
    },
    workItemId,
  };
}
