import {
  OrganizationId,
  OrganizationSecurityActivityEventId,
  UserId,
} from "@ceird/identity-core";
import type { OrganizationSecurityActivityListResponse } from "@ceird/identity-core";
import { Schema } from "effect";
/* oxlint-disable unicorn/no-useless-undefined */
// @vitest-environment node

import { listCurrentServerOrganizationSecurityActivityDirect as listCurrentServerOrganizationSecurityActivity } from "./organization-security-server-ssr";

const { mockedGetRequestHeader } = vi.hoisted(() => ({
  mockedGetRequestHeader: vi.fn<(name: string) => string | undefined>(),
}));

vi.mock(import("@tanstack/react-start/server"), () => ({
  getRequestHeader: mockedGetRequestHeader,
}));

const organizationSecurityActivityResponse: OrganizationSecurityActivityListResponse =
  {
    items: [
      {
        actor: {
          email: "owner@example.com",
          id: Schema.decodeUnknownSync(UserId)("user_owner"),
          name: "Owner User",
        },
        createdAt: "2026-06-07T10:30:00.000Z",
        eventType: "organization_created",
        id: Schema.decodeUnknownSync(OrganizationSecurityActivityEventId)(
          "audit_123"
        ),
        organizationId: Schema.decodeUnknownSync(OrganizationId)("org_123"),
        summary: "Created Acme Field Ops.",
        target: {
          label: "Acme Field Ops",
          type: "organization",
        },
      },
    ],
  };

describe("server organization security helpers", () => {
  let originalApiOrigin: string | undefined;

  beforeEach(() => {
    originalApiOrigin = process.env.API_ORIGIN;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    if (originalApiOrigin === undefined) {
      // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
      delete process.env.API_ORIGIN;
    } else {
      process.env.API_ORIGIN = originalApiOrigin;
    }
  });

  it("forwards the current auth cookie when listing security activity", async () => {
    mockedGetRequestHeader.mockImplementation((name) =>
      name === "cookie" ? "better-auth.session_token=session-token" : undefined
    );
    process.env.API_ORIGIN = "https://api.example.com";

    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(Response.json(organizationSecurityActivityResponse));

    await expect(
      listCurrentServerOrganizationSecurityActivity({
        eventType: "organization_created",
        limit: 10,
      })
    ).resolves.toStrictEqual(organizationSecurityActivityResponse);

    const [url, requestInit] = fetchMock.mock.calls[0] ?? [];

    expect(String(url)).toBe(
      "https://api.example.com/organization/security/activity?eventType=organization_created&limit=10"
    );
    expect(requestInit?.method).toBe("GET");
    expect(requestInit?.headers).toMatchObject({
      cookie: "better-auth.session_token=session-token",
    });
  }, 1000);
});
