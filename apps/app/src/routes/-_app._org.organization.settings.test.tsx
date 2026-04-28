/* oxlint-disable vitest/prefer-import-in-mock */
import { isRedirect } from "@tanstack/react-router";
import { decodeOrganizationId } from "@task-tracker/identity-core";
import type {
  OrganizationId,
  OrganizationRole,
} from "@task-tracker/identity-core";

import type * as OrganizationAccess from "#/features/organizations/organization-access";

type RoleLookupMock = (
  organizationId: OrganizationId
) => Promise<{ role: OrganizationRole }>;
const organizationId = decodeOrganizationId("org_123");

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

  it.each<OrganizationRole>(["owner", "admin"])(
    "allows %s users to load organization settings",
    {
      timeout: 10_000,
    },
    async (role) => {
      const { loadSettingsRoute } =
        await import("./_app._org.organization.settings");

      expect(
        loadSettingsRoute({
          activeOrganizationId: organizationId,
          activeOrganizationSync: {
            required: false,
            targetOrganizationId: organizationId,
          },
          currentOrganizationRole: role,
        })
      ).toBeUndefined();
      expect(mockedGetCurrentOrganizationMemberRole).not.toHaveBeenCalled();
    }
  );

  it(
    "redirects members away from organization settings",
    {
      timeout: 10_000,
    },
    async () => {
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
          currentOrganizationRole: "member",
        });
      } catch (error) {
        result = error;
      }

      expect(result).toMatchObject({
        options: { to: "/" },
      });
      expect(result).toSatisfy(isRedirect);
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
      ).toBeUndefined();
      expect(mockedGetCurrentOrganizationMemberRole).not.toHaveBeenCalled();
    }
  );
});
