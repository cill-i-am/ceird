/* oxlint-disable vitest/prefer-import-in-mock */
import { isRedirect } from "@tanstack/react-router";
import { decodeOrganizationId } from "@task-tracker/identity-core";
import type { OrganizationRole } from "@task-tracker/identity-core";

const organizationId = decodeOrganizationId("org_123");

describe("organization home route", () => {
  it.each<OrganizationRole>(["owner", "admin", "member"])(
    "keeps %s users on the organization home route",
    async (role) => {
      const { loadOrganizationHomeRoute } = await import("./_app._org.index");

      expect(
        loadOrganizationHomeRoute({
          activeOrganizationId: organizationId,
          activeOrganizationSync: {
            required: false,
            targetOrganizationId: organizationId,
          },
          currentOrganizationRole: role,
        })
      ).toBeUndefined();
    },
    10_000
  );

  it("redirects external users from organization home to jobs", async () => {
    const { loadOrganizationHomeRoute } = await import("./_app._org.index");
    let result: unknown;

    try {
      loadOrganizationHomeRoute({
        activeOrganizationId: organizationId,
        activeOrganizationSync: {
          required: false,
          targetOrganizationId: organizationId,
        },
        currentOrganizationRole: "external",
      });
    } catch (error) {
      result = error;
    }

    expect(result).toMatchObject({
      options: { to: "/jobs" },
    });
    expect(result).toSatisfy(isRedirect);
  }, 10_000);
});
