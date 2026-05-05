import { decodeOrganizationId } from "@ceird/identity-core";
import type { OrganizationRole } from "@ceird/identity-core";
/* oxlint-disable vitest/prefer-import-in-mock */
import { isRedirect } from "@tanstack/react-router";

import type { ActiveOrganizationSync } from "#/features/organizations/organization-access";
import { decodeOrganizationViewerUserId } from "#/features/organizations/organization-viewer";

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

  it("builds members page props with the current user id and access refresh", async () => {
    const { createOrganizationMembersPageProps } =
      await import("./_app._org.members");
    const onCurrentMemberAccessChanged = vi.fn<() => void>();

    expect(
      createOrganizationMembersPageProps({
        activeOrganizationId: decodeOrganizationId("org_123"),
        currentMemberRole: "admin",
        currentUserId: decodeOrganizationViewerUserId("user_123"),
        onCurrentMemberAccessChanged,
        session: {
          user: {
            email: "admin@example.com",
            name: "Admin Example",
          },
        },
      })
    ).toStrictEqual({
      activeOrganizationId: "org_123",
      currentMember: {
        email: "admin@example.com",
        name: "Admin Example",
        role: "admin",
      },
      currentUserId: "user_123",
      onCurrentMemberAccessChanged,
    });
  }, 10_000);
});
