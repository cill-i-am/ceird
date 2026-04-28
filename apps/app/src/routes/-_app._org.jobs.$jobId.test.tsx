/* oxlint-disable vitest/prefer-import-in-mock */
import { decodeOrganizationId } from "@task-tracker/identity-core";
import type {
  ActivityIdType,
  CommentIdType,
  ContactIdType,
  ServiceAreaIdType,
  SiteIdType,
  UserIdType,
  VisitIdType,
  WorkItemIdType,
} from "@task-tracker/jobs-core";
import { render, screen } from "@testing-library/react";
import type { ComponentProps, ReactNode } from "react";

type AsyncLoaderMock = (...args: unknown[]) => Promise<unknown>;
type NavigateMock = (...args: unknown[]) => Promise<void>;

const workItemId = "11111111-1111-4111-8111-111111111111" as WorkItemIdType;
const actorUserId = "22222222-2222-4222-8222-222222222222" as UserIdType;
const siteId = "33333333-3333-4333-8333-333333333333" as SiteIdType;
const contactId = "44444444-4444-4444-8444-444444444444" as ContactIdType;
const serviceAreaId =
  "55555555-5555-4555-8555-555555555555" as ServiceAreaIdType;
const organizationId = decodeOrganizationId("org_123");

const { mockedGetCurrentServerJobDetail, mockedNavigate } = vi.hoisted(() => ({
  mockedGetCurrentServerJobDetail: vi.fn<AsyncLoaderMock>(),
  mockedNavigate: vi.fn<NavigateMock>(),
}));

vi.mock(import("@tanstack/react-router"), async (importActual) => {
  const actual = await importActual();

  return {
    ...actual,
    Link: (({
      children,
      to,
      ...props
    }: ComponentProps<"a"> & { to?: string }) => (
      <a href={to} {...props}>
        {children}
      </a>
    )) as typeof actual.Link,
    useNavigate: (() =>
      mockedNavigate as ReturnType<
        typeof actual.useNavigate
      >) as typeof actual.useNavigate,
  };
});

vi.mock("#/components/ui/sheet", () => ({
  Sheet: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  SheetContent: ({ children }: { children?: ReactNode }) => (
    <section>{children}</section>
  ),
  SheetDescription: ({ children }: { children?: ReactNode }) => (
    <p>{children}</p>
  ),
  SheetFooter: ({ children }: { children?: ReactNode }) => (
    <footer>{children}</footer>
  ),
  SheetHeader: ({ children }: { children?: ReactNode }) => (
    <header>{children}</header>
  ),
  SheetTitle: ({ children }: { children?: ReactNode }) => <h2>{children}</h2>,
}));

vi.mock("#/features/jobs/jobs-server", () => ({
  getCurrentServerJobDetail: mockedGetCurrentServerJobDetail,
}));

describe("job detail route", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it(
    "loads the job detail payload for the server-first route",
    {
      timeout: 10_000,
    },
    async () => {
      const detail = buildDetail();
      mockedGetCurrentServerJobDetail.mockResolvedValue(detail);

      const { loadJobDetailRouteData } =
        await import("./_app._org.jobs.$jobId");

      await expect(loadJobDetailRouteData(workItemId)).resolves.toStrictEqual(
        detail
      );
      expect(mockedGetCurrentServerJobDetail).toHaveBeenCalledWith(workItemId);
    }
  );

  it(
    "fails fast on an invalid job id before calling the server helper",
    {
      timeout: 10_000,
    },
    async () => {
      const { loadJobDetailRouteData } =
        await import("./_app._org.jobs.$jobId");

      expect(() =>
        loadJobDetailRouteData("not-a-job-id" as WorkItemIdType)
      ).toThrow(/Universally Unique Identifier/);
      expect(mockedGetCurrentServerJobDetail).not.toHaveBeenCalled();
    }
  );

  it(
    "short-circuits detail loading while active organization sync is pending",
    {
      timeout: 10_000,
    },
    async () => {
      const { loadJobDetailRouteData } =
        await import("./_app._org.jobs.$jobId");

      await expect(
        loadJobDetailRouteData(workItemId, {
          activeOrganizationSync: {
            required: true,
            targetOrganizationId: organizationId,
          },
        })
      ).resolves.toBeNull();
      expect(mockedGetCurrentServerJobDetail).not.toHaveBeenCalled();
    }
  );

  it(
    "renders the nested detail route from loader data and parent-seeded lookups on first paint",
    {
      timeout: 10_000,
    },
    async () => {
      const { JobsDetailRouteContent, JobsRouteContent } =
        await import("#/features/jobs/jobs-route-content");

      render(
        <JobsRouteContent
          activeOrganizationId={organizationId}
          activeOrganizationName="Acme Field Ops"
          list={{
            items: [
              {
                assigneeId: actorUserId,
                contactId,
                createdAt: "2026-04-23T10:00:00.000Z",
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
          }}
          options={{
            contacts: [
              {
                id: contactId,
                name: "Pat Contact",
                siteIds: [siteId],
              },
            ],
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
                addressLine1: "Depot Road",
                country: "IE",
                county: "Dublin",
                eircode: "D01 X2X2",
                geocodedAt: "2026-04-27T10:00:00.000Z",
                geocodingProvider: "stub",
                id: siteId,
                latitude: 53.3498,
                longitude: -6.2603,
                name: "Depot",
                serviceAreaId,
                serviceAreaName: "North",
              },
            ],
          }}
          viewer={{
            role: "owner",
            userId: actorUserId,
          }}
        >
          <JobsDetailRouteContent
            initialDetail={buildDetail()}
            viewer={{
              role: "owner",
              userId: actorUserId,
            }}
          />
        </JobsRouteContent>
      );

      expect(
        screen.getByRole("heading", { name: "Inspect boiler" })
      ).toBeInTheDocument();
      expect(screen.getAllByText("Taylor Owner").length).toBeGreaterThan(0);
      expect(screen.getAllByText("Depot").length).toBeGreaterThan(0);
      expect(screen.getAllByText("Pat Contact").length).toBeGreaterThan(0);
      expect(
        screen.getByText("Checked the burner and reset the controls.")
      ).toBeInTheDocument();
    }
  );
});

function buildDetail() {
  return {
    activity: [
      {
        actorUserId,
        createdAt: "2026-04-23T10:00:00.000Z",
        id: "66666666-6666-4666-8666-666666666666" as ActivityIdType,
        payload: {
          eventType: "job_created" as const,
          kind: "job" as const,
          priority: "medium" as const,
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
    job: {
      assigneeId: actorUserId,
      contactId,
      createdAt: "2026-04-23T10:00:00.000Z",
      createdByUserId: actorUserId,
      id: workItemId,
      kind: "job" as const,
      priority: "medium" as const,
      siteId,
      status: "in_progress" as const,
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
