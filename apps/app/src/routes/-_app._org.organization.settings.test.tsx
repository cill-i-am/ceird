/* oxlint-disable vitest/prefer-import-in-mock */
import { isRedirect } from "@tanstack/react-router";
import { decodeOrganizationId } from "@task-tracker/identity-core";
import type {
  OrganizationId,
  OrganizationRole,
} from "@task-tracker/identity-core";
import type {
  JobLabelIdType,
  JobOptionsResponse,
} from "@task-tracker/jobs-core";

import type * as JobsServer from "#/features/jobs/jobs-server";
import type * as OrganizationAccess from "#/features/organizations/organization-access";

type RoleLookupMock = (
  organizationId: OrganizationId
) => Promise<{ role: OrganizationRole }>;
const organizationId = decodeOrganizationId("org_123");

const {
  mockedGetCurrentOrganizationMemberRole,
  mockedGetCurrentServerJobOptions,
} = vi.hoisted(() => ({
  mockedGetCurrentOrganizationMemberRole: vi.fn<RoleLookupMock>(),
  mockedGetCurrentServerJobOptions: vi.fn<() => Promise<JobOptionsResponse>>(),
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

vi.mock(import("#/features/jobs/jobs-server"), async () => {
  const actual = await vi.importActual<typeof JobsServer>(
    "#/features/jobs/jobs-server"
  );

  return {
    ...actual,
    getCurrentServerJobOptions: mockedGetCurrentServerJobOptions,
  };
});

describe("settings route loader", () => {
  beforeEach(() => {
    const jobOptions: JobOptionsResponse = {
      contacts: [],
      labels: [
        {
          id: "11111111-1111-4111-8111-111111111111" as JobLabelIdType,
          name: "Urgent",
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
      members: [],
      regions: [],
      sites: [],
    };

    mockedGetCurrentServerJobOptions.mockResolvedValue(jobOptions);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it.each<OrganizationRole>(["owner", "admin"])(
    "allows %s users to load organization settings",
    {
      timeout: 10_000,
    },
    async (role) => {
      mockedGetCurrentOrganizationMemberRole.mockResolvedValue({
        role,
      });

      const { loadSettingsRoute } =
        await import("./_app._org.organization.settings");

      await expect(
        loadSettingsRoute({
          activeOrganizationId: organizationId,
          activeOrganizationSync: {
            required: false,
            targetOrganizationId: organizationId,
          },
        })
      ).resolves.toStrictEqual({
        jobLabels: [
          expect.objectContaining({
            name: "Urgent",
          }),
        ],
      });
      expect(mockedGetCurrentOrganizationMemberRole).toHaveBeenCalledWith(
        organizationId
      );
      expect(mockedGetCurrentServerJobOptions).toHaveBeenCalledOnce();
    }
  );

  it(
    "redirects members away from organization settings",
    {
      timeout: 10_000,
    },
    async () => {
      mockedGetCurrentOrganizationMemberRole.mockResolvedValue({
        role: "member",
      });

      const { loadSettingsRoute } =
        await import("./_app._org.organization.settings");
      const result = loadSettingsRoute({
        activeOrganizationId: organizationId,
        activeOrganizationSync: {
          required: false,
          targetOrganizationId: organizationId,
        },
      });

      await expect(result).rejects.toMatchObject({
        options: { to: "/" },
      });
      await expect(result).rejects.toSatisfy(isRedirect);
    }
  );

  it(
    "defers role checks while active organization sync is pending",
    {
      timeout: 10_000,
    },
    async () => {
      const { loadSettingsRoute } =
        await import("./_app._org.organization.settings");

      await expect(
        loadSettingsRoute({
          activeOrganizationId: organizationId,
          activeOrganizationSync: {
            required: true,
            targetOrganizationId: organizationId,
          },
        })
      ).resolves.toStrictEqual({
        jobLabels: [],
      });
      expect(mockedGetCurrentOrganizationMemberRole).not.toHaveBeenCalled();
      expect(mockedGetCurrentServerJobOptions).not.toHaveBeenCalled();
    }
  );
});
