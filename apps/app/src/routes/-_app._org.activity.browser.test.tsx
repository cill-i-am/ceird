import { decodeOrganizationId } from "@ceird/identity-core";
import type { OrganizationRole } from "@ceird/identity-core";
/* oxlint-disable vitest/prefer-import-in-mock */
import { isRedirect } from "@tanstack/react-router";

const organizationId = decodeOrganizationId("org_123");

describe("activity route access and search", () => {
  it.each<OrganizationRole>(["owner", "admin", "member"])(
    "allows %s users to view organization activity",
    {
      timeout: 10_000,
    },
    async (role) => {
      const { assertActivityRouteAccess } =
        await import("#/features/activity/activity-route-loader");

      expect(() =>
        assertActivityRouteAccess({
          activeOrganizationId: organizationId,
          activeOrganizationSync: {
            required: false,
            targetOrganizationId: organizationId,
          },
          currentOrganizationRole: role,
        })
      ).not.toThrow();
    }
  );

  it(
    "redirects external users away from organization activity",
    {
      timeout: 10_000,
    },
    async () => {
      const { assertActivityRouteAccess } =
        await import("#/features/activity/activity-route-loader");

      let thrown: unknown;

      try {
        assertActivityRouteAccess({
          activeOrganizationId: organizationId,
          activeOrganizationSync: {
            required: false,
            targetOrganizationId: organizationId,
          },
          currentOrganizationRole: "external",
        });
      } catch (error) {
        thrown = error;
      }

      expect(thrown).toMatchObject({ options: { to: "/jobs" } });
      expect(thrown).toSatisfy(isRedirect);
    }
  );

  it(
    "short-circuits while active organization sync is pending",
    {
      timeout: 10_000,
    },
    async () => {
      const { assertActivityRouteAccess } =
        await import("#/features/activity/activity-route-loader");

      expect(() =>
        assertActivityRouteAccess({
          activeOrganizationId: organizationId,
          activeOrganizationSync: {
            required: true,
            targetOrganizationId: organizationId,
          },
        })
      ).not.toThrow();
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
        eventType: "job.created",
        ignored: "value",
        status: "pending",
        targetType: "job",
      });

      expect(getActivityRouteLoaderDeps(search)).toStrictEqual({
        eventType: "job.created",
        status: "pending",
        targetType: "job",
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
          eventType: "not_real",
          ignored: "value",
          status: "later",
          targetType: "member",
        })
      ).toStrictEqual({
        eventType: undefined,
        status: undefined,
        targetType: undefined,
      });
      expect(
        decodeActivitySearch({
          eventType: "site.updated",
          status: "synced",
          targetType: "site",
        })
      ).toStrictEqual({
        eventType: "site.updated",
        status: "synced",
        targetType: "site",
      });
    }
  );
});
