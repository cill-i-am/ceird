/* oxlint-disable vitest/prefer-import-in-mock */
import { isRedirect } from "@tanstack/react-router";
import { decodeOrganizationId } from "@task-tracker/identity-core";
import type { OrganizationRole } from "@task-tracker/identity-core";
import type {
  JobLabelIdType,
  JobLabelsResponse,
} from "@task-tracker/jobs-core";

const organizationId = decodeOrganizationId("org_123");

const { mockedGetCurrentServerJobLabels } = vi.hoisted(() => ({
  mockedGetCurrentServerJobLabels: vi.fn<() => Promise<JobLabelsResponse>>(),
}));

vi.mock(import("#/features/jobs/jobs-server"), () => ({
  getCurrentServerJobLabels: mockedGetCurrentServerJobLabels,
}));

describe("settings route loader", () => {
  beforeEach(() => {
    const jobLabels: JobLabelsResponse = {
      labels: [
        {
          id: "11111111-1111-4111-8111-111111111111" as JobLabelIdType,
          name: "Urgent",
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    };

    mockedGetCurrentServerJobLabels.mockResolvedValue(jobLabels);
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
      const { loadSettingsRoute } =
        await import("./_app._org.organization.settings");

      await expect(
        loadSettingsRoute({
          activeOrganizationId: organizationId,
          activeOrganizationSync: {
            required: false,
            targetOrganizationId: organizationId,
          },
          currentOrganizationRole: role,
        })
      ).resolves.toStrictEqual({
        jobLabels: [
          expect.objectContaining({
            name: "Urgent",
          }),
        ],
      });
      expect(mockedGetCurrentServerJobLabels).toHaveBeenCalledOnce();
    }
  );

  it.each<OrganizationRole>(["member", "external"])(
    "redirects %s users away from organization settings",
    {
      timeout: 10_000,
    },
    async (role) => {
      const { loadSettingsRoute } =
        await import("./_app._org.organization.settings");
      let result: unknown;

      try {
        loadSettingsRoute({
          activeOrganizationId: organizationId,
          activeOrganizationSync: {
            required: false,
            targetOrganizationId: organizationId,
          },
          currentOrganizationRole: role,
        });
      } catch (error) {
        result = error;
      }

      expect(result).toMatchObject({
        options: { to: "/" },
      });
      expect(result).toSatisfy(isRedirect);
      expect(mockedGetCurrentServerJobLabels).not.toHaveBeenCalled();
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

      expect(
        loadSettingsRoute({
          activeOrganizationId: organizationId,
          activeOrganizationSync: {
            required: true,
            targetOrganizationId: organizationId,
          },
          currentOrganizationRole: undefined,
        })
      ).toStrictEqual({
        jobLabels: [],
      });
      expect(mockedGetCurrentServerJobLabels).not.toHaveBeenCalled();
    }
  );
});
