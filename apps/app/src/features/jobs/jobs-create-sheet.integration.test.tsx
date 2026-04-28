/* oxlint-disable vitest/prefer-import-in-mock */
import { RegistryProvider, useAtomValue } from "@effect-atom/atom-react";
import { decodeOrganizationId } from "@task-tracker/identity-core";
import type {
  ContactIdType,
  CreateJobResponse,
  SiteIdType,
  UserIdType,
  WorkItemIdType,
} from "@task-tracker/jobs-core";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Effect } from "effect";
import type * as EffectPackage from "effect";
import type { ReactNode } from "react";

import { JobsCreateSheet } from "./jobs-create-sheet";
import {
  jobsListStateAtom,
  jobsNoticeAtom,
  jobsOptionsStateAtom,
  seedJobsListState,
  seedJobsOptionsState,
} from "./jobs-state";

type EffectClientMock = (...args: unknown[]) => unknown;
type NavigateMock = (...args: unknown[]) => Promise<void>;

const depotSiteId = "11111111-1111-4111-8111-111111111111" as SiteIdType;
const depotContactId = "22222222-2222-4222-8222-222222222222" as ContactIdType;
const existingJobId = "33333333-3333-4333-8333-333333333333" as WorkItemIdType;
const organizationId = decodeOrganizationId("org_123");

const {
  mockedMakeBrowserJobsClient,
  mockedNavigate,
  mockedCreateJob,
  mockedGetJobOptions,
  mockedListJobs,
} = vi.hoisted(() => ({
  mockedMakeBrowserJobsClient: vi.fn<EffectClientMock>(),
  mockedNavigate: vi.fn<NavigateMock>(),
  mockedCreateJob: vi.fn<EffectClientMock>(),
  mockedGetJobOptions: vi.fn<EffectClientMock>(),
  mockedListJobs: vi.fn<EffectClientMock>(),
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

vi.mock("#/components/ui/responsive-drawer", () => ({
  ResponsiveDrawer: ({
    children,
    open = true,
  }: {
    children?: ReactNode;
    open?: boolean;
  }) =>
    open ? (
      <div data-testid="responsive-drawer" data-nested="false">
        {children}
      </div>
    ) : null,
  ResponsiveNestedDrawer: ({
    children,
    open = true,
  }: {
    children?: ReactNode;
    open?: boolean;
  }) =>
    open ? (
      <div data-testid="responsive-drawer" data-nested="true">
        {children}
      </div>
    ) : null,
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

describe("jobs create sheet integration", () => {
  beforeEach(() => {
    mockedNavigate.mockReset();
    mockedMakeBrowserJobsClient.mockReset();
    mockedCreateJob.mockReset();
    mockedGetJobOptions.mockReset();
    mockedListJobs.mockReset();

    mockedMakeBrowserJobsClient.mockImplementation(() =>
      Effect.succeed({
        jobs: {
          createJob: mockedCreateJob,
          getJobOptions: mockedGetJobOptions,
          listJobs: mockedListJobs,
        },
      })
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it(
    "still completes the create flow when the post-create refresh fails",
    {
      timeout: 10_000,
    },
    async () => {
      const createdJob = buildCreatedJob("Replace air valve");

      mockedCreateJob.mockReturnValue(Effect.succeed(createdJob));
      mockedListJobs.mockReturnValue(Effect.fail(new Error("refresh failed")));
      mockedGetJobOptions.mockReturnValue(
        Effect.fail(new Error("refresh failed"))
      );

      const user = userEvent.setup();
      renderCreateSheet();

      await user.type(screen.getByLabelText("Title"), "Replace air valve");
      await user.type(
        screen.getByLabelText("External reference"),
        "CLAIM-2026-0042"
      );
      await createInlineContact(user, "Alex Caller");
      await user.type(
        screen.getByLabelText("Contact email"),
        "alex@example.com"
      );
      await user.type(
        screen.getByLabelText("Contact phone"),
        "+353 87 123 4567"
      );
      await user.type(
        screen.getByLabelText("Contact notes"),
        "Prefers morning calls."
      );
      await user.click(screen.getByRole("button", { name: /create job/i }));

      await waitFor(() => {
        expect(mockedNavigate).toHaveBeenCalledWith({ to: "/jobs" });
      });

      expect(mockedCreateJob).toHaveBeenCalledWith(
        expect.objectContaining({
          payload: expect.objectContaining({
            contact: {
              input: {
                email: "alex@example.com",
                name: "Alex Caller",
                notes: "Prefers morning calls.",
                phone: "+353 87 123 4567",
              },
              kind: "create",
            },
            externalReference: "CLAIM-2026-0042",
          }),
        })
      );

      expect(screen.getByTestId("job-titles")).toHaveTextContent(
        "Replace air valve | Existing queue job"
      );
      expect(screen.getByTestId("notice-title")).toHaveTextContent(
        "Replace air valve"
      );
      expect(
        screen.queryByText(/we couldn't create that job/i)
      ).not.toBeInTheDocument();
    }
  );

  it(
    "keeps the refreshed queue when options reload fails after create",
    {
      timeout: 10_000,
    },
    async () => {
      const createdJob = buildCreatedJob("Replace air valve");

      mockedCreateJob.mockReturnValue(Effect.succeed(createdJob));
      mockedListJobs.mockReturnValue(
        Effect.succeed({
          items: [
            {
              createdAt: createdJob.createdAt,
              id: createdJob.id,
              kind: createdJob.kind,
              priority: createdJob.priority,
              status: createdJob.status,
              title: "Canonical queue title",
              updatedAt: createdJob.updatedAt,
            },
          ],
          nextCursor: undefined,
        })
      );
      mockedGetJobOptions.mockReturnValue(
        Effect.fail(new Error("refresh failed"))
      );

      const user = userEvent.setup();
      renderCreateSheet();

      await user.type(screen.getByLabelText("Title"), "Replace air valve");
      await createInlineContact(user, "Alex Caller");
      await user.click(screen.getByRole("button", { name: /create job/i }));

      await waitFor(() => {
        expect(mockedNavigate).toHaveBeenCalledWith({ to: "/jobs" });
      });

      expect(screen.getByTestId("job-titles")).toHaveTextContent(
        "Canonical queue title"
      );
      expect(mockedGetJobOptions).toHaveBeenCalledOnce();
      expect(
        screen.queryByText(/we couldn't create that job/i)
      ).not.toBeInTheDocument();
    }
  );

  it(
    "renders the mutation error banner from the real atom result state",
    {
      timeout: 10_000,
    },
    async () => {
      mockedCreateJob.mockReturnValue(Effect.fail(new Error("API down")));

      const user = userEvent.setup();
      renderCreateSheet();

      await user.type(screen.getByLabelText("Title"), "Replace air valve");
      await user.click(screen.getByRole("button", { name: /create job/i }));

      await expect(
        screen.findByText(/we couldn't create that job/i)
      ).resolves.toBeInTheDocument();
      expect(screen.getByText("API down")).toBeInTheDocument();
      expect(mockedNavigate).not.toHaveBeenCalled();
    }
  );

  it(
    "validates constrained fields before submitting",
    {
      timeout: 10_000,
    },
    async () => {
      const user = userEvent.setup();
      renderCreateSheet();

      await user.type(screen.getByLabelText("Title"), "Replace air valve");
      fireEvent.change(screen.getByLabelText("External reference"), {
        target: { value: "R".repeat(121) },
      });
      await createInlineContact(user, "Alex Caller");
      await user.type(screen.getByLabelText("Contact email"), "not-an-email");
      fireEvent.change(screen.getByLabelText("Contact notes"), {
        target: { value: "N".repeat(2001) },
      });
      await user.click(screen.getByRole("button", { name: /create job/i }));

      expect(mockedCreateJob).not.toHaveBeenCalled();
      expect(mockedNavigate).not.toHaveBeenCalled();
      expect(
        screen.getByText("Use 120 characters or fewer.")
      ).toBeInTheDocument();
      expect(
        screen.getByText("Enter a valid email address.")
      ).toBeInTheDocument();
      expect(
        screen.getByText("Use 2,000 characters or fewer.")
      ).toBeInTheDocument();
    }
  );
});

function renderCreateSheet() {
  return render(
    <RegistryProvider
      initialValues={[
        [
          jobsListStateAtom,
          seedJobsListState(organizationId, {
            items: [
              {
                createdAt: "2026-04-23T11:00:00.000Z",
                id: existingJobId,
                kind: "job",
                priority: "none",
                status: "new",
                title: "Existing queue job",
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
                id: depotContactId,
                name: "Pat Contact",
                phone: "+353 87 765 4321",
                siteIds: [depotSiteId],
              },
            ],
            members: [],
            serviceAreas: [],
            sites: [
              {
                addressLine1: "Depot Road",
                country: "IE",
                county: "Dublin",
                eircode: "D01 X2X2",
                geocodedAt: "2026-04-27T10:00:00.000Z",
                geocodingProvider: "stub",
                id: depotSiteId,
                latitude: 53.3498,
                longitude: -6.2603,
                name: "Depot",
                serviceAreaId: undefined,
                serviceAreaName: undefined,
              },
            ],
          }),
        ],
      ]}
    >
      <JobsCreateSheet />
      <JobsStateProbe />
    </RegistryProvider>
  );
}

function JobsStateProbe() {
  const listState = useAtomValue(jobsListStateAtom);
  const notice = useAtomValue(jobsNoticeAtom);

  return (
    <div>
      <output data-testid="job-titles">
        {listState.items.map((job) => job.title).join(" | ")}
      </output>
      <output data-testid="notice-title">{notice?.title ?? ""}</output>
    </div>
  );
}

async function createInlineContact(
  user: ReturnType<typeof userEvent.setup>,
  contactName: string
) {
  await user.click(screen.getByLabelText("Contact"));
  await user.type(screen.getByPlaceholderText("Contact"), contactName);
  await user.click(
    screen.getByRole("option", {
      name: `Create new contact: "${contactName}"`,
    })
  );
}

function buildCreatedJob(title: string): CreateJobResponse {
  return {
    createdAt: "2026-04-24T09:00:00.000Z",
    createdByUserId: "user_123" as UserIdType,
    id: "44444444-4444-4444-8444-444444444444" as WorkItemIdType,
    kind: "job",
    priority: "none",
    status: "new",
    title,
    updatedAt: "2026-04-24T09:00:00.000Z",
  };
}
