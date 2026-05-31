import type { OrganizationId, OrganizationRole } from "@ceird/identity-core";

import {
  createOrganizationDataScope,
  organizationDataQueryKey,
} from "./query-scope";

describe("data-plane query scope", () => {
  const scope = createOrganizationDataScope({
    organizationId: "org_123" as OrganizationId,
    role: "owner" satisfies OrganizationRole,
    userId: "user_123",
  });

  it("includes collection, organization, user, and role in query keys", () => {
    expect(organizationDataQueryKey("jobs", scope)).toStrictEqual([
      "jobs",
      "organization",
      "org_123",
      "user",
      "user_123",
      "role",
      "owner",
    ]);
  });

  it("keeps sibling collection roots from sharing unsafe prefixes", () => {
    const sitesKey = organizationDataQueryKey("sites", scope);
    const commentsKey = [
      ...organizationDataQueryKey("site-comments", scope),
      "site_123",
    ] as const;

    expect(commentsKey.slice(0, sitesKey.length)).not.toStrictEqual(sitesKey);
  });

  it("uses explicit unknown sentinels for missing user and role", () => {
    expect(
      organizationDataQueryKey(
        "sites",
        createOrganizationDataScope({
          organizationId: "org_123" as OrganizationId,
        })
      )
    ).toStrictEqual([
      "sites",
      "organization",
      "org_123",
      "user",
      "unknown",
      "role",
      "unknown",
    ]);
  });
});
