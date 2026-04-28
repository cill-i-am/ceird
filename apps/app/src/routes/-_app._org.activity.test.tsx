/* oxlint-disable vitest/prefer-import-in-mock */
import { isRedirect } from "@tanstack/react-router";
import { decodeOrganizationId } from "@task-tracker/identity-core";
import type {
  OrganizationId,
  OrganizationRole,
} from "@task-tracker/identity-core";
import type { OrganizationActivityQuery } from "@task-tracker/jobs-core";

import type * as OrganizationAccess from "#/features/organizations/organization-access";

type RoleLookupMock = (
  organizationId: OrganizationId
) => Promise<{ role: OrganizationRole }>;
type ActivityLookupMock = (
  query?: OrganizationActivityQuery
) => Promise<unknown>;
type JobOptionsLookupMock = () => Promise<unknown>;

const organizationId = decodeOrganizationId("org_123");

const {
  mockedGetCurrentOrganizationMemberRole,
  mockedGetCurrentServerJobOptions,
  mockedListCurrentServerOrganizationActivity,
} = vi.hoisted(() => ({
  mockedGetCurrentOrganizationMemberRole: vi.fn<RoleLookupMock>(),
  mockedGetCurrentServerJobOptions: vi.fn<JobOptionsLookupMock>(),
  mockedListCurrentServerOrganizationActivity: vi.fn<ActivityLookupMock>(),
}));

vi.mock("#/features/jobs/jobs-server", () => ({
  getCurrentServerJobOptions: mockedGetCurrentServerJobOptions,
  listCurrentServerOrganizationActivity:
    mockedListCurrentServerOrganizationActivity,
}));

vi.mock(import("#/features/organizations/organization-access"), async () => {
  const actual = await vi.importActual<typeof OrganizationAccess>(
    "#/features/organizations/organization-access"
  );

  return {
    ...actual,
    getCurrentOrganizationMemberRole: mockedGetCurrentOrganizationMemberRole,
  };
});

describe("activity route loader", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it.each<OrganizationRole>(["owner", "admin"])(
    "loads organization activity and options for %s users with filters",
    {
      timeout: 10_000,
    },
    async (role) => {
      const activity = {
        items: [],
        nextCursor: undefined,
      };
      const options = {
        contacts: [],
        members: [],
        regions: [],
        sites: [],
      };
      mockedGetCurrentOrganizationMemberRole.mockResolvedValue({ role });
      mockedListCurrentServerOrganizationActivity.mockResolvedValue(activity);
      mockedGetCurrentServerJobOptions.mockResolvedValue(options);

      const { decodeActivitySearch, loadActivityRouteData } =
        await import("./_app._org.activity");
      const search = decodeActivitySearch({
        actorUserId: "user_taylor",
        eventType: "job_created",
        fromDate: "2026-04-01",
        jobTitle: "Boiler",
        toDate: "2026-04-28",
      });

      await expect(
        loadActivityRouteData(
          {
            activeOrganizationId: organizationId,
            activeOrganizationSync: {
              required: false,
              targetOrganizationId: organizationId,
            },
          },
          search
        )
      ).resolves.toStrictEqual({
        activity,
        options,
      });
      expect(mockedGetCurrentOrganizationMemberRole).toHaveBeenCalledWith(
        organizationId
      );
      expect(mockedListCurrentServerOrganizationActivity).toHaveBeenCalledWith(
        search
      );
      expect(mockedGetCurrentServerJobOptions).toHaveBeenCalledOnce();
    }
  );

  it(
    "redirects members away from organization activity",
    {
      timeout: 10_000,
    },
    async () => {
      mockedGetCurrentOrganizationMemberRole.mockResolvedValue({
        role: "member",
      });

      const { loadActivityRouteData } = await import("./_app._org.activity");
      const result = loadActivityRouteData(
        {
          activeOrganizationId: organizationId,
          activeOrganizationSync: {
            required: false,
            targetOrganizationId: organizationId,
          },
        },
        {}
      );

      await expect(result).rejects.toMatchObject({
        options: { to: "/" },
      });
      await expect(result).rejects.toSatisfy(isRedirect);
      expect(
        mockedListCurrentServerOrganizationActivity
      ).not.toHaveBeenCalled();
      expect(mockedGetCurrentServerJobOptions).not.toHaveBeenCalled();
    }
  );

  it(
    "short-circuits while active organization sync is pending",
    {
      timeout: 10_000,
    },
    async () => {
      const { loadActivityRouteData } = await import("./_app._org.activity");

      await expect(
        loadActivityRouteData(
          {
            activeOrganizationId: organizationId,
            activeOrganizationSync: {
              required: true,
              targetOrganizationId: organizationId,
            },
          },
          {}
        )
      ).resolves.toStrictEqual({
        activity: {
          items: [],
          nextCursor: undefined,
        },
        options: {
          contacts: [],
          members: [],
          regions: [],
          sites: [],
        },
      });
      expect(mockedGetCurrentOrganizationMemberRole).not.toHaveBeenCalled();
      expect(
        mockedListCurrentServerOrganizationActivity
      ).not.toHaveBeenCalled();
      expect(mockedGetCurrentServerJobOptions).not.toHaveBeenCalled();
    }
  );

  it(
    "uses stable validated search fields as route loader deps",
    {
      timeout: 10_000,
    },
    async () => {
      const { decodeActivitySearch, getActivityRouteLoaderDeps } =
        await import("./_app._org.activity");
      const search = decodeActivitySearch({
        actorUserId: "user_taylor",
        eventType: "job_created",
        fromDate: "2026-04-01",
        jobTitle: "  Boiler  ",
        toDate: "2026-04-28",
        unknown: "ignored",
      });

      expect(getActivityRouteLoaderDeps(search)).toStrictEqual({
        actorUserId: "user_taylor",
        eventType: "job_created",
        fromDate: "2026-04-01",
        jobTitle: "Boiler",
        toDate: "2026-04-28",
      });
    }
  );

  it(
    "normalizes invalid activity search values",
    {
      timeout: 10_000,
    },
    async () => {
      const { decodeActivitySearch } = await import("./_app._org.activity");

      expect(
        decodeActivitySearch({
          actorUserId: "",
          eventType: "not_real",
          fromDate: "2026-02-31",
          ignored: "value",
          jobTitle: "   ",
          toDate: "tomorrow",
        })
      ).toStrictEqual({
        actorUserId: undefined,
        eventType: undefined,
        fromDate: undefined,
        jobTitle: undefined,
        toDate: undefined,
      });
      expect(
        decodeActivitySearch({
          actorUserId: "user_taylor",
          eventType: "job_created",
          fromDate: "2026-04-01",
          jobTitle: "  Boiler  ",
          toDate: "2026-04-28",
        })
      ).toStrictEqual({
        actorUserId: "user_taylor",
        eventType: "job_created",
        fromDate: "2026-04-01",
        jobTitle: "Boiler",
        toDate: "2026-04-28",
      });
    }
  );
});
