import { decodeOrganizationId } from "@ceird/identity-core";
import type { OrganizationRole } from "@ceird/identity-core";
import type { LabelIdType, LabelsResponse } from "@ceird/labels-core";
/* oxlint-disable vitest/prefer-import-in-mock */
import { isRedirect } from "@tanstack/react-router";

const organizationId = decodeOrganizationId("org_123");
const switchedOrganizationId = decodeOrganizationId("org_next");

const { mockedGetCurrentServerLabels } = vi.hoisted(() => ({
  mockedGetCurrentServerLabels: vi.fn<() => Promise<LabelsResponse>>(),
}));

vi.mock(import("#/features/api/app-api-server"), () => ({
  getCurrentServerLabels: mockedGetCurrentServerLabels,
}));

describe("settings route loader", () => {
  beforeEach(() => {
    const organizationLabels: LabelsResponse = {
      labels: [
        {
          id: "11111111-1111-4111-8111-111111111111" as LabelIdType,
          name: "Urgent",
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    };

    mockedGetCurrentServerLabels.mockResolvedValue(organizationLabels);
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
      const { assertSettingsRouteAccess } =
        await import("./_app._org.organization.settings");
      const context = {
        activeOrganizationId: organizationId,
        activeOrganizationSync: {
          required: false,
          targetOrganizationId: organizationId,
        },
        currentOrganizationRole: role,
      } as const;

      expect(() => assertSettingsRouteAccess(context)).not.toThrow();

      await expect(loadSettingsRoute(context)).resolves.toStrictEqual({
        organizationLabels: [
          expect.objectContaining({
            name: "Urgent",
          }),
        ],
      });
      expect(mockedGetCurrentServerLabels).toHaveBeenCalledOnce();
    }
  );

  it.each<OrganizationRole>(["member", "external"])(
    "redirects %s users away from organization settings",
    {
      timeout: 10_000,
    },
    async (role) => {
      const { assertSettingsRouteAccess } =
        await import("./_app._org.organization.settings");
      let result: unknown;

      try {
        assertSettingsRouteAccess({
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
      expect(mockedGetCurrentServerLabels).not.toHaveBeenCalled();
    }
  );

  it.each<OrganizationRole>(["member", "external"])(
    "keeps organization settings unavailable after switching to a %s organization",
    {
      timeout: 10_000,
    },
    async (role) => {
      const { assertSettingsRouteAccess } =
        await import("./_app._org.organization.settings");
      let result: unknown;

      try {
        assertSettingsRouteAccess({
          activeOrganizationId: switchedOrganizationId,
          activeOrganizationSync: {
            required: false,
            targetOrganizationId: switchedOrganizationId,
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
      expect(mockedGetCurrentServerLabels).not.toHaveBeenCalled();
    }
  );

  it.each<OrganizationRole>(["owner", "admin"])(
    "keeps organization settings available after switching to a %s organization",
    {
      timeout: 10_000,
    },
    async (role) => {
      const { assertSettingsRouteAccess } =
        await import("./_app._org.organization.settings");

      expect(() =>
        assertSettingsRouteAccess({
          activeOrganizationId: switchedOrganizationId,
          activeOrganizationSync: {
            required: false,
            targetOrganizationId: switchedOrganizationId,
          },
          currentOrganizationRole: role,
        })
      ).not.toThrow();
      expect(mockedGetCurrentServerLabels).not.toHaveBeenCalled();
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
      const { assertSettingsRouteAccess } =
        await import("./_app._org.organization.settings");
      const context = {
        activeOrganizationId: organizationId,
        activeOrganizationSync: {
          required: true,
          targetOrganizationId: organizationId,
        },
        currentOrganizationRole: undefined,
      } as const;

      expect(() => assertSettingsRouteAccess(context)).not.toThrow();
      expect(loadSettingsRoute(context)).toStrictEqual({
        organizationLabels: [],
      });
      expect(mockedGetCurrentServerLabels).not.toHaveBeenCalled();
    }
  );
});
