import type { OrganizationRole } from "@ceird/identity-core";
/* oxlint-disable vitest/prefer-import-in-mock */
import { isRedirect } from "@tanstack/react-router";

import type { ActiveOrganizationSync } from "#/features/organizations/organization-access";

const readySync: ActiveOrganizationSync = {
  required: false,
  targetOrganizationId: null,
};

describe("members route loader", () => {
  it.each<OrganizationRole>(["owner", "admin"])(
    "allows %s users to load organization members",
    async (role) => {
      const { loadMembersRouteData } = await import("./_app._org.members");

      expect(
        loadMembersRouteData({
          activeOrganizationSync: readySync,
          currentOrganizationRole: role,
        })
      ).toStrictEqual({
        currentMemberRole: role,
      });
    },
    10_000
  );

  it.each<OrganizationRole>(["member", "external"])(
    "redirects %s users away from organization members",
    async (role) => {
      const { loadMembersRouteData } = await import("./_app._org.members");
      let result: unknown;

      try {
        loadMembersRouteData({
          activeOrganizationSync: readySync,
          currentOrganizationRole: role,
        });
      } catch (error) {
        result = error;
      }

      expect(result).toMatchObject({
        options: { to: "/" },
      });
      expect(result).toSatisfy(isRedirect);
    },
    10_000
  );

  it("keeps members unavailable after switching to an external organization", async () => {
    const { loadMembersRouteData } = await import("./_app._org.members");
    let result: unknown;

    try {
      loadMembersRouteData({
        activeOrganizationSync: readySync,
        currentOrganizationRole: "external",
      });
    } catch (error) {
      result = error;
    }

    expect(result).toMatchObject({
      options: { to: "/" },
    });
    expect(result).toSatisfy(isRedirect);
  });

  it("short-circuits while active organization sync is pending", async () => {
    const { loadMembersRouteData } = await import("./_app._org.members");

    expect(
      loadMembersRouteData({
        activeOrganizationSync: {
          required: true,
          targetOrganizationId: null,
        },
      })
    ).toStrictEqual({
      currentMemberRole: undefined,
    });
  }, 10_000);
});
