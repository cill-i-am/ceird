import { decodeOrganizationId } from "@ceird/identity-core";
import type { OrganizationRole } from "@ceird/identity-core";
import type { LabelsResponse } from "@ceird/labels-core";
import { isRedirect } from "@tanstack/react-router";

const organizationId = decodeOrganizationId("org_123");

const { mockedGetCurrentServerLabels } = vi.hoisted(() => ({
  mockedGetCurrentServerLabels: vi.fn<() => Promise<LabelsResponse>>(),
}));

vi.mock(import("#/features/api/app-api-server"), () => ({
  getCurrentServerLabels: mockedGetCurrentServerLabels,
}));

describe("labels settings route", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it.each<OrganizationRole>(["owner", "admin"])(
    "allows %s users to access labels settings",
    async (role) => {
      const { assertLabelsSettingsRouteAccess } =
        await import("./_app._org.organization.settings.labels");

      expect(() =>
        assertLabelsSettingsRouteAccess({
          activeOrganizationId: organizationId,
          activeOrganizationSync: {
            required: false,
            targetOrganizationId: organizationId,
          },
          currentOrganizationRole: role,
        })
      ).not.toThrow();
      expect(mockedGetCurrentServerLabels).not.toHaveBeenCalled();
    }
  );

  it.each<OrganizationRole>(["member", "external"])(
    "redirects %s users away from labels settings",
    async (role) => {
      const { assertLabelsSettingsRouteAccess } =
        await import("./_app._org.organization.settings.labels");
      let result: unknown;

      try {
        assertLabelsSettingsRouteAccess({
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

  it("defers role checks while active organization sync is pending", async () => {
    const { assertLabelsSettingsRouteAccess } =
      await import("./_app._org.organization.settings.labels");

    expect(() =>
      assertLabelsSettingsRouteAccess({
        activeOrganizationId: organizationId,
        activeOrganizationSync: {
          required: true,
          targetOrganizationId: organizationId,
        },
        currentOrganizationRole: undefined,
      })
    ).not.toThrow();
    expect(mockedGetCurrentServerLabels).not.toHaveBeenCalled();
  });
});
