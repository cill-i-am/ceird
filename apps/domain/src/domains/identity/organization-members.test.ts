import { decodeOrganizationId, decodeUserId } from "@ceird/identity-core";
import { Effect, Layer } from "effect";
import { HttpServerRequest } from "effect/unstable/http";

import { OrganizationAuthorization } from "../organizations/authorization.js";
import { CurrentOrganizationActor } from "../organizations/current-actor.js";
import type { OrganizationActor } from "../organizations/current-actor.js";
import type { AuthenticationSessionResult } from "./authentication/auth-boundary-utils.js";
import { withOrganizationSecurityAuditEventRecorder } from "./authentication/auth-oauth-policy.js";
import { Authentication } from "./authentication/auth.js";
import {
  DEFAULT_AUTH_DATABASE_URL,
  makeAuthenticationConfig,
} from "./authentication/config.js";
import {
  makeOrganizationAuthRequestHeaders,
  mapOrganizationInvitationPayload,
  mapOrganizationInvitationRow,
  mapOrganizationMemberRemovalPayload,
  mapOrganizationMemberRow,
  OrganizationMembersRepository,
  OrganizationMembersService,
} from "./organization-members.js";

interface CapturedOrganizationAuthRequest {
  readonly body: unknown;
  readonly method: string;
  readonly pathname: string;
}

interface CapturedAuthSecurityAuditEvent {
  readonly actorUserId?: string | null;
  readonly eventType: string;
  readonly metadata?: Record<string, unknown>;
  readonly organizationId?: string | null;
  readonly sessionId?: string | null;
}

describe("organization member identity mapping", () => {
  it("routes Ceird invite creation through the Better Auth organization handler", async () => {
    const requests: CapturedOrganizationAuthRequest[] = [];
    const result = await runInviteMemberServiceWithHandler(async (request) => {
      requests.push({
        body: await request.json(),
        method: request.method,
        pathname: new URL(request.url).pathname,
      });

      return Response.json(makeNativeInvitationPayload());
    });

    expect(requests).toStrictEqual([
      {
        body: {
          email: "pending@example.com",
          organizationId: "org_123",
          role: "member",
        },
        method: "POST",
        pathname: "/api/auth/organization/invite-member",
      },
    ]);
    expect(result.invitation).toStrictEqual({
      createdAt: "2026-04-01T09:30:00.000Z",
      email: "pending@example.com",
      expiresAt: "2026-04-12T09:30:00.000Z",
      id: "inv_123",
      organizationId: "org_123",
      role: "member",
      status: "pending",
    });
  });

  it("propagates invite rate-limit failures from the Better Auth handler path", async () => {
    await expect(
      runInviteMemberServiceWithHandler(() =>
        Promise.resolve(
          Response.json(
            {
              code: "AUTH_RATE_LIMIT_EXCEEDED",
              message: "Too many organization invitations.",
            },
            {
              status: 429,
              statusText: "Too Many Requests",
            }
          )
        )
      )
    ).rejects.toMatchObject({
      code: "AUTH_RATE_LIMIT_EXCEEDED",
      message: "Too many organization invitations.",
      status: 429,
    });
  });

  it("lets resend invites traverse the Better Auth organization audit wrapper", async () => {
    const auditEvents: CapturedAuthSecurityAuditEvent[] = [];
    const handler = withOrganizationSecurityAuditEventRecorder(
      () => Promise.resolve(Response.json(makeNativeInvitationPayload())),
      {
        authConfig: makeAuthenticationConfig({
          baseUrl: "https://api.ceird.example/api/auth",
          databaseUrl: DEFAULT_AUTH_DATABASE_URL,
          secret: "0123456789abcdef0123456789abcdef",
        }),
        database: makeOrganizationInviteAuditDatabase(auditEvents),
        resolveSession: () => Promise.resolve(makeAuthenticationSession()),
      }
    );

    await runInviteMemberServiceWithHandler(handler, { resend: true });

    expect(auditEvents).toContainEqual(
      expect.objectContaining({
        actorUserId: "user_owner",
        eventType: "organization_invitation_resent",
        organizationId: "org_123",
        sessionId: "session_123",
        metadata: expect.objectContaining({
          invitationEmailMasked: "p***@e***.com",
          role: "member",
          source: "better_auth_organization_endpoint",
        }),
      })
    );
  });

  it("scrubs body transport headers from synthetic Better Auth requests", () => {
    const headers = makeOrganizationAuthRequestHeaders({
      accept: "text/html",
      "accept-encoding": "gzip, br",
      "cdn-loop": "cloudflare",
      "cf-connecting-ip": "203.0.113.10",
      "cf-ipcountry": "US",
      "cf-ray": "ray-value",
      connection: "keep-alive",
      "content-encoding": "gzip",
      "content-length": "17",
      "content-md5": "f1b2d2f924e986ac86fdf7b36c94bcdf32beec15",
      "content-type": "text/plain",
      cookie: "better-auth.session_token=session-value",
      host: "api.pr-248.ceird.app",
      origin: "https://app.pr-248.ceird.app",
      "transfer-encoding": "chunked",
      "x-forwarded-for": "198.51.100.20",
      "x-forwarded-host": "api.pr-248.ceird.app",
      "x-request-id": "request-id",
    });

    expect(headers.get("accept")).toBe("application/json");
    expect(headers.get("accept-encoding")).toBeNull();
    expect(headers.get("cdn-loop")).toBeNull();
    expect(headers.get("cf-connecting-ip")).toBeNull();
    expect(headers.get("cf-ipcountry")).toBeNull();
    expect(headers.get("cf-ray")).toBeNull();
    expect(headers.get("connection")).toBeNull();
    expect(headers.get("content-encoding")).toBeNull();
    expect(headers.get("content-length")).toBeNull();
    expect(headers.get("content-md5")).toBeNull();
    expect(headers.get("content-type")).toBe("application/json");
    expect(headers.get("cookie")).toBe(
      "better-auth.session_token=session-value"
    );
    expect(headers.get("host")).toBeNull();
    expect(headers.get("origin")).toBe("https://app.pr-248.ceird.app");
    expect(headers.get("transfer-encoding")).toBeNull();
    expect(headers.get("x-forwarded-for")).toBe("198.51.100.20");
    expect(headers.get("x-forwarded-host")).toBe("api.pr-248.ceird.app");
    expect(headers.get("x-request-id")).toBe("request-id");
  });

  it("maps joined member rows into a safe member DTO", () => {
    expect(
      mapOrganizationMemberRow({
        created_at: new Date("2026-04-01T09:30:00.000Z"),
        email: "owner@example.com",
        id: "mem_owner",
        name: "Owner Example",
        organization_id: "org_123",
        role: "owner",
        user_id: "user_owner",
      })
    ).toStrictEqual({
      createdAt: "2026-04-01T09:30:00.000Z",
      email: "owner@example.com",
      id: "mem_owner",
      name: "Owner Example",
      organizationId: "org_123",
      role: "owner",
      userId: "user_owner",
    });
  });

  it("rejects member rows outside the Ceird identity contract", () => {
    expect(() =>
      mapOrganizationMemberRow({
        created_at: new Date("2026-04-01T09:30:00.000Z"),
        email: "owner@example.com",
        id: "mem_owner",
        name: "Owner Example",
        organization_id: "org_123",
        role: "billing-manager",
        user_id: "user_owner",
      })
    ).toThrow(/Expected/);
  });

  it("maps Better Auth invitation rows into a safe invitation DTO", () => {
    expect(
      mapOrganizationInvitationRow({
        created_at: new Date("2026-04-01T09:30:00.000Z"),
        email: "pending@example.com",
        expires_at: new Date("2026-04-12T09:30:00.000Z"),
        id: "inv_123",
        organization_id: "org_123",
        role: "member",
        status: "pending",
      })
    ).toStrictEqual({
      createdAt: "2026-04-01T09:30:00.000Z",
      email: "pending@example.com",
      expiresAt: "2026-04-12T09:30:00.000Z",
      id: "inv_123",
      organizationId: "org_123",
      role: "member",
      status: "pending",
    });
  });

  it("maps Better Auth invitation mutation payloads into a safe invitation DTO", () => {
    expect(
      mapOrganizationInvitationPayload({
        createdAt: new Date("2026-04-01T09:30:00.000Z"),
        email: "pending@example.com",
        expiresAt: new Date("2026-04-12T09:30:00.000Z"),
        id: "inv_123",
        inviterId: "user_owner",
        organizationId: "org_123",
        role: "member",
        status: "pending",
        teamId: null,
      })
    ).toStrictEqual({
      createdAt: "2026-04-01T09:30:00.000Z",
      email: "pending@example.com",
      expiresAt: "2026-04-12T09:30:00.000Z",
      id: "inv_123",
      organizationId: "org_123",
      role: "member",
      status: "pending",
    });
  });

  it("rejects Better Auth invitation mutation payloads with unknown fields", () => {
    expect(() =>
      mapOrganizationInvitationPayload({
        createdAt: "2026-04-01T09:30:00.000Z",
        email: "pending@example.com",
        expiresAt: "2026-04-12T09:30:00.000Z",
        id: "inv_123",
        inviterId: "user_owner",
        organizationId: "org_123",
        role: "member",
        status: "pending",
        teamId: null,
        unmodeledBetterAuthField: true,
      })
    ).toThrow(/Unexpected key/);
  });

  it("rejects invitation rows with unsupported statuses", () => {
    expect(() =>
      mapOrganizationInvitationRow({
        created_at: new Date("2026-04-01T09:30:00.000Z"),
        email: "pending@example.com",
        expires_at: new Date("2026-04-12T09:30:00.000Z"),
        id: "inv_123",
        organization_id: "org_123",
        role: "member",
        status: "expired",
      })
    ).toThrow(/Expected/);
  });

  it("rejects owner invitation rows outside the Ceird invitation contract", () => {
    expect(() =>
      mapOrganizationInvitationRow({
        created_at: new Date("2026-04-01T09:30:00.000Z"),
        email: "owner@example.com",
        expires_at: new Date("2026-04-12T09:30:00.000Z"),
        id: "inv_123",
        organization_id: "org_123",
        role: "owner",
        status: "pending",
      })
    ).toThrow(/Expected/);
  });

  it("maps Better Auth member removal payloads into a removed member id", () => {
    expect(
      mapOrganizationMemberRemovalPayload({
        member: {
          createdAt: "2026-04-01T09:30:00.000Z",
          id: "mem_member",
          organizationId: "org_123",
          role: "member",
          teamId: null,
          userId: "user_member",
        },
      })
    ).toBe("mem_member");
  });

  it("rejects unmodeled Better Auth member removal payload fields", () => {
    expect(() =>
      mapOrganizationMemberRemovalPayload({
        member: {
          createdAt: "2026-04-01T09:30:00.000Z",
          id: "mem_member",
          organizationId: "org_123",
          role: "member",
          teamId: null,
          user: {
            email: "member@example.com",
            id: "user_member",
          },
          userId: "user_member",
        },
      })
    ).toThrow(/Unexpected key/);
  });
});

function makeNativeInvitationPayload() {
  return {
    createdAt: "2026-04-01T09:30:00.000Z",
    email: "pending@example.com",
    expiresAt: "2026-04-12T09:30:00.000Z",
    id: "inv_123",
    inviterId: "user_owner",
    organizationId: "org_123",
    role: "member",
    status: "pending",
    teamId: null,
  };
}

function makeOrganizationActor(): OrganizationActor {
  return {
    organizationId: decodeOrganizationId("org_123"),
    role: "owner",
    userId: decodeUserId("user_owner"),
  };
}

async function runInviteMemberServiceWithHandler(
  handler: (request: Request) => Promise<Response>,
  options: {
    readonly resend?: boolean;
  } = {}
) {
  const dependenciesLayer = Layer.mergeAll(
    Layer.succeed(
      Authentication,
      Authentication.of({
        api: {
          getSession: () => Promise.resolve(null),
        },
        handler,
        options: {
          plugins: [],
        },
      })
    ),
    Layer.succeed(
      CurrentOrganizationActor,
      CurrentOrganizationActor.of({
        get: () => Effect.succeed(makeOrganizationActor()),
      })
    ),
    Layer.succeed(
      OrganizationAuthorization,
      OrganizationAuthorization.of({
        ensureCanCreateSite: () => Effect.void,
        ensureCanManageConfiguration: () => Effect.void,
        ensureCanManageLabels: () => Effect.void,
        ensureCanViewOrganizationData: () => Effect.void,
        ensureCanViewOrganizationSecurityActivity: () => Effect.void,
      })
    ),
    Layer.succeed(
      OrganizationMembersRepository,
      OrganizationMembersRepository.of({
        getMember: () => Effect.die(new Error("getMember was not expected")),
        listInvitations: () =>
          Effect.die(new Error("listInvitations was not expected")),
        listMembers: () =>
          Effect.die(new Error("listMembers was not expected")),
      })
    )
  );
  const layer = Layer.merge(
    OrganizationMembersService.DefaultWithoutDependencies.pipe(
      Layer.provide(dependenciesLayer)
    ),
    Layer.succeed(
      HttpServerRequest.HttpServerRequest,
      makeTestHttpServerRequest()
    )
  );

  return await Effect.runPromise(
    Effect.gen(function* () {
      const service = yield* OrganizationMembersService;

      return yield* service.invite({
        email: "pending@example.com",
        ...(options.resend === undefined ? {} : { resend: options.resend }),
        role: "member",
      });
    }).pipe(Effect.provide(layer))
  );
}

function makeTestHttpServerRequest(): HttpServerRequest.HttpServerRequest {
  const request = new Request(
    "https://api.ceird.example/organization/invitations",
    {
      headers: {
        cookie: "better-auth.session_token=session_123",
        origin: "https://app.ceird.example",
      },
    }
  );

  return {
    headers: request.headers,
    url: request.url,
  } as unknown as HttpServerRequest.HttpServerRequest;
}

function makeAuthenticationSession(): AuthenticationSessionResult {
  const now = new Date("2026-04-01T09:30:00.000Z");

  return {
    session: {
      activeOrganizationId: "org_123",
      createdAt: now,
      expiresAt: new Date("2026-04-01T10:30:00.000Z"),
      id: "session_123",
      token: "session_token_123",
      updatedAt: now,
      userId: "user_owner",
    },
    user: {
      createdAt: now,
      email: "owner@example.com",
      emailVerified: true,
      id: "user_owner",
      name: "Owner Example",
      twoFactorEnabled: false,
      updatedAt: now,
    },
  };
}

function makeOrganizationInviteAuditDatabase(
  events: CapturedAuthSecurityAuditEvent[]
): Parameters<
  typeof withOrganizationSecurityAuditEventRecorder
>[1]["database"] {
  return {
    insert: () => ({
      values: (event: CapturedAuthSecurityAuditEvent) => {
        events.push(event);
        return Promise.resolve();
      },
    }),
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () =>
            Promise.resolve([
              {
                email: "pending@example.com",
                organizationId: "org_123",
                role: "member",
              },
            ]),
        }),
      }),
    }),
  } as unknown as Parameters<
    typeof withOrganizationSecurityAuditEventRecorder
  >[1]["database"];
}
