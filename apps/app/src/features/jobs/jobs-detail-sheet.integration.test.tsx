/* oxlint-disable vitest/prefer-import-in-mock */
import { RegistryProvider, useAtomValue } from "@effect-atom/atom-react";
import { decodeOrganizationId } from "@task-tracker/identity-core";
import type {
  ActivityIdType,
  CommentIdType,
  ContactIdType,
  JobDetailResponse,
  RegionIdType,
  SiteIdType,
  UserIdType,
  VisitIdType,
  WorkItemIdType,
} from "@task-tracker/jobs-core";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Effect } from "effect";
import type * as EffectPackage from "effect";
import type { ComponentProps, ReactNode } from "react";

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
const regionId = "55555555-5555-4555-8555-555555555555" as RegionIdType;
const organizationId = decodeOrganizationId("org_123");

const {
  mockedAddJobComment,
  mockedAddJobVisit,
  mockedGetJobDetail,
  mockedListJobs,
  mockedMakeBrowserJobsClient,
  mockedNavigate,
  mockedPatchJob,
  mockedReopenJob,
  mockedTransitionJob,
} = vi.hoisted(() => ({
  mockedAddJobComment: vi.fn<EffectClientMock>(),
  mockedAddJobVisit: vi.fn<EffectClientMock>(),
  mockedGetJobDetail: vi.fn<EffectClientMock>(),
  mockedListJobs: vi.fn<EffectClientMock>(),
  mockedMakeBrowserJobsClient: vi.fn<EffectClientMock>(),
  mockedNavigate: vi.fn<NavigateMock>(),
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

vi.mock("./jobs-client", async () => {
  const { Effect: EffectModule } =
    await vi.importActual<typeof EffectPackage>("effect");

  return {
    makeBrowserJobsClient: mockedMakeBrowserJobsClient,
    provideBrowserJobsHttp: (effect: unknown) => effect,
    runBrowserJobsRequest: (
      _operation: string,
      execute: (client: unknown) => unknown
    ) =>
      (mockedMakeBrowserJobsClient() as Effect.Effect<unknown, unknown>).pipe(
        EffectModule.flatMap(
          (client) => execute(client) as Effect.Effect<unknown, unknown>
        )
      ),
  };
});

describe("jobs detail sheet integration", () => {
  beforeEach(() => {
    mockedAddJobComment.mockReset();
    mockedAddJobVisit.mockReset();
    mockedGetJobDetail.mockReset();
    mockedListJobs.mockReset();
    mockedMakeBrowserJobsClient.mockReset();
    mockedNavigate.mockReset();
    mockedPatchJob.mockReset();
    mockedReopenJob.mockReset();
    mockedTransitionJob.mockReset();

    mockedMakeBrowserJobsClient.mockImplementation(() =>
      Effect.succeed({
        jobs: {
          addJobComment: mockedAddJobComment,
          addJobVisit: mockedAddJobVisit,
          getJobDetail: mockedGetJobDetail,
          listJobs: mockedListJobs,
          patchJob: mockedPatchJob,
          reopenJob: mockedReopenJob,
          transitionJob: mockedTransitionJob,
        },
      })
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

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
    "clears stale rich contact detail when site reassignment clears the contact and refresh fails",
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
      expect(
        screen.queryByText("Use email for routine updates.")
      ).not.toBeInTheDocument();
      expect(screen.queryByText("pat@example.com")).not.toBeInTheDocument();
    }
  );
});

function renderDetailSheet() {
  return render(
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
            members: [
              {
                id: actorUserId,
                name: "Taylor Owner",
              },
            ],
            regions: [
              {
                id: regionId,
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
                regionId,
                regionName: "North",
                town: "Dublin",
              },
            ],
          }),
        ],
      ]}
    >
      <JobsDetailSheet
        initialDetail={buildDetail()}
        viewer={{
          role: "owner",
          userId: actorUserId,
        }}
      />
      <JobsListProbe />
    </RegistryProvider>
  );
}

function JobsListProbe() {
  const listState = useAtomValue(jobsListStateAtom);

  return (
    <output data-testid="list-statuses">
      {listState.items.map((job) => job.status).join(" | ")}
    </output>
  );
}

function buildDetail(): JobDetailResponse {
  return {
    activity: [
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
    comments: [
      {
        authorUserId: actorUserId,
        body: "Checked the burner and reset the controls.",
        createdAt: "2026-04-23T11:00:00.000Z",
        id: "77777777-7777-4777-8777-777777777777" as CommentIdType,
        workItemId,
      },
    ],
    contact: {
      email: "pat@example.com",
      id: contactId,
      name: "Pat Contact",
      notes: "Use email for routine updates.",
      phone: "+353 87 765 4321",
    },
    job: {
      assigneeId: actorUserId,
      contactId,
      createdAt: "2026-04-23T10:00:00.000Z",
      createdByUserId: actorUserId,
      externalReference: "PO-4471",
      id: workItemId,
      kind: "job",
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
