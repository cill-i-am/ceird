import {
  decodeOrganizationId,
  OrganizationSecurityActivityCursor as OrganizationSecurityActivityCursorSchema,
} from "@ceird/identity-core";
import type {
  OrganizationRole,
  OrganizationSecurityActivityQuery,
} from "@ceird/identity-core";
/* oxlint-disable vitest/prefer-import-in-mock */
import { isRedirect } from "@tanstack/react-router";
import { Schema } from "effect";

import type { WorkspaceSheet } from "#/features/workspace-sheets/workspace-sheet-search";

type SecurityActivityLookupMock = (
  query?: OrganizationSecurityActivityQuery
) => Promise<unknown>;

const organizationId = decodeOrganizationId("org_123");
const cursor = Schema.decodeUnknownSync(
  OrganizationSecurityActivityCursorSchema
)("cursor_123");

const { mockedListCurrentServerOrganizationSecurityActivity } = vi.hoisted(
  () => ({
    mockedListCurrentServerOrganizationSecurityActivity:
      vi.fn<SecurityActivityLookupMock>(),
  })
);

vi.mock(
  "#/features/organization-security/organization-security-server",
  () => ({
    listCurrentServerOrganizationSecurityActivity:
      mockedListCurrentServerOrganizationSecurityActivity,
  })
);

describe("organization security activity route loader", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it.each<OrganizationRole>(["owner", "admin"])(
    "loads organization security activity for %s users with filters",
    {
      timeout: 10_000,
    },
    async (role) => {
      const activity = {
        items: [],
        nextCursor: undefined,
      };
      mockedListCurrentServerOrganizationSecurityActivity.mockResolvedValue(
        activity
      );

      const [
        {
          decodeOrganizationSecurityActivitySearch,
          getOrganizationSecurityActivityRouteLoaderDeps,
        },
        { loadOrganizationSecurityActivityRouteData },
      ] = await Promise.all([
        import("./_app._org.organization.security"),
        import("#/features/organization-security/organization-security-route-loader"),
      ]);
      const search = decodeOrganizationSecurityActivitySearch({
        actorUserId: "user_owner",
        cursor,
        eventType: "organization_member_role_updated",
        fromDate: "2026-06-01",
        targetSearch: "  Taylor  ",
        targetType: "member",
        toDate: "2026-06-07",
      });

      await expect(
        loadOrganizationSecurityActivityRouteData(
          {
            activeOrganizationId: organizationId,
            activeOrganizationSync: {
              required: false,
              targetOrganizationId: organizationId,
            },
            currentOrganizationRole: role,
          },
          getOrganizationSecurityActivityRouteLoaderDeps(search)
        )
      ).resolves.toStrictEqual({
        activity,
      });
      expect(
        mockedListCurrentServerOrganizationSecurityActivity
      ).toHaveBeenCalledWith({
        actorUserId: "user_owner",
        cursor,
        eventType: "organization_member_role_updated",
        fromDate: "2026-06-01",
        limit: 50,
        targetSearch: "Taylor",
        targetType: "member",
        toDate: "2026-06-07",
      });
    }
  );

  it.each<OrganizationRole>(["member", "external"])(
    "redirects %s users away from organization security activity",
    {
      timeout: 10_000,
    },
    async (role) => {
      const { loadOrganizationSecurityActivityRouteData } =
        await import("#/features/organization-security/organization-security-route-loader");
      const result = loadOrganizationSecurityActivityRouteData(
        {
          activeOrganizationId: organizationId,
          activeOrganizationSync: {
            required: false,
            targetOrganizationId: organizationId,
          },
          currentOrganizationRole: role,
        },
        {}
      );

      await expect(result).rejects.toMatchObject({
        options: { to: "/" },
      });
      await expect(result).rejects.toSatisfy(isRedirect);
      expect(
        mockedListCurrentServerOrganizationSecurityActivity
      ).not.toHaveBeenCalled();
    }
  );

  it(
    "short-circuits while active organization sync is pending",
    {
      timeout: 10_000,
    },
    async () => {
      const { loadOrganizationSecurityActivityRouteData } =
        await import("#/features/organization-security/organization-security-route-loader");

      await expect(
        loadOrganizationSecurityActivityRouteData(
          {
            activeOrganizationId: organizationId,
            activeOrganizationSync: {
              required: true,
              targetOrganizationId: organizationId,
            },
          },
          {}
        )
      ).resolves.toStrictEqual({
        activity: {
          items: [],
          nextCursor: undefined,
        },
      });
      expect(
        mockedListCurrentServerOrganizationSecurityActivity
      ).not.toHaveBeenCalled();
    }
  );

  it(
    "rejects invalid security activity search values",
    {
      timeout: 10_000,
    },
    async () => {
      const { decodeOrganizationSecurityActivitySearch } =
        await import("./_app._org.organization.security");

      expect(() =>
        decodeOrganizationSecurityActivitySearch({
          actorUserId: "",
          cursor: "",
          eventType: "organization_active_changed",
          fromDate: "2026-02-31",
          targetSearch: "   ",
          targetType: "session",
          toDate: "tomorrow",
        })
      ).toThrow(/Expected/);
    }
  );

  it("preserves workspace sheet search while changing security filters", async () => {
    const { mergeOrganizationSecurityActivitySearch } =
      await import("./_app._org.organization.security");
    const sheet = {
      kind: "site.detail",
      siteId: "00000000-0000-4000-8000-000000000001",
    } as WorkspaceSheet;

    expect(
      mergeOrganizationSecurityActivitySearch(
        {
          cursor,
          eventType: "organization_created",
          limit: 50,
          sheets: [sheet],
        },
        {
          targetSearch: "Taylor",
        }
      )
    ).toStrictEqual({
      actorUserId: undefined,
      cursor: undefined,
      eventType: undefined,
      fromDate: undefined,
      limit: 50,
      sheets: [sheet],
      targetSearch: "Taylor",
      targetType: undefined,
      toDate: undefined,
    });
  });
});
