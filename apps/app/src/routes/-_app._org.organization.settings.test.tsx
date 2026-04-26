/* oxlint-disable vitest/prefer-import-in-mock */
import { isRedirect } from "@tanstack/react-router";

import type * as OrganizationAccess from "#/features/organizations/organization-access";

type RoleLookupMock = (organizationId: string) => Promise<{ role: string }>;

const { mockedGetCurrentOrganizationMemberRole } = vi.hoisted(() => ({
  mockedGetCurrentOrganizationMemberRole: vi.fn<RoleLookupMock>(),
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

describe("settings route loader", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it.each(["owner", "admin"])(
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
          activeOrganizationId: "org_123",
          activeOrganizationSync: {
            required: false,
            targetOrganizationId: "org_123",
          },
        })
      ).resolves.toBeUndefined();
      expect(mockedGetCurrentOrganizationMemberRole).toHaveBeenCalledWith(
        "org_123"
      );
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
        activeOrganizationId: "org_123",
        activeOrganizationSync: {
          required: false,
          targetOrganizationId: "org_123",
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
          activeOrganizationId: "org_123",
          activeOrganizationSync: {
            required: true,
            targetOrganizationId: "org_123",
          },
        })
      ).resolves.toBeUndefined();
      expect(mockedGetCurrentOrganizationMemberRole).not.toHaveBeenCalled();
    }
  );
});
