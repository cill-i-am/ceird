import {
  decodeOrganizationId,
  OrganizationSecurityActivityQuerySchema,
  OrganizationSecurityActivityStorageError,
} from "@ceird/identity-core";
import type {
  OrganizationMemberId,
  OrganizationSecurityActivityCursor,
} from "@ceird/identity-core";
import { describe, expect, it } from "@effect/vitest";
import { Effect, Layer, Schema } from "effect";
import { HttpServerRequest } from "effect/unstable/http";
import { SqlClient } from "effect/unstable/sql";

import { OrganizationAuthorization } from "../organizations/authorization.js";
import { CurrentOrganizationActor } from "../organizations/current-actor.js";
import { OrganizationSessionIdentityInvalidError } from "../organizations/errors.js";
import {
  OrganizationSecurityActivityRowSchema,
  OrganizationSecurityAuditWriteSchema,
} from "./persistence-schemas.js";
import {
  decodeOrganizationSecurityActivityCursor,
  encodeOrganizationSecurityActivityCursor,
  mapOrganizationSecurityActivityRow,
  OrganizationSecurityActivityRepository,
  OrganizationSecurityActivityService,
} from "./security-activity.js";

const decodeActivityRow = Schema.decodeUnknownSync(
  OrganizationSecurityActivityRowSchema
);
const decodeOrganizationSecurityAuditWrite = Schema.decodeUnknownSync(
  OrganizationSecurityAuditWriteSchema
);
const decodeSecurityActivityQuery = Schema.decodeUnknownSync(
  OrganizationSecurityActivityQuerySchema
);
const auditMetadataSource = {
  outcome: "succeeded",
  source: "better_auth_organization_plugin",
};

describe("organization security activity mapping", () => {
  it("maps role-change audit rows into safe read-model items", () => {
    const row = decodeActivityRow({
      actor_email: "owner@example.com",
      actor_name: "Owner User",
      actor_user_id: "user_owner",
      created_at: new Date("2026-06-07T10:30:00.000Z"),
      created_at_cursor: "2026-06-07T10:30:00.000000Z",
      event_type: "organization_member_role_updated",
      id: "audit_123",
      metadata: {
        ...auditMetadataSource,
        memberId: "member_123",
        previousRole: "member",
        role: "admin",
        targetUserId: "user_member",
      },
      organization_id: "org_123",
      organization_name: "Acme Field Ops",
      target_email: "member@example.com",
      target_member_id: "member_123",
      target_name: "Taylor Member",
      target_user_id: "user_member",
    });
    const targetMemberId: Schema.Schema.Type<
      typeof OrganizationMemberId
    > | null = row.target_member_id;

    expect(targetMemberId).toBe("member_123");
    expect(mapOrganizationSecurityActivityRow(row)).toStrictEqual({
      actor: {
        email: "owner@example.com",
        id: "user_owner",
        name: "Owner User",
      },
      createdAt: "2026-06-07T10:30:00.000Z",
      eventType: "organization_member_role_updated",
      id: "audit_123",
      organizationId: "org_123",
      roleChange: {
        after: "admin",
        before: "member",
      },
      summary: "Changed Taylor Member from Member to Admin.",
      target: {
        label: "Taylor Member",
        memberId: "member_123",
        type: "member",
        userId: "user_member",
      },
    });
  });

  it("maps invitation rows without exposing raw invitation email provenance", () => {
    const item = mapOrganizationSecurityActivityRow(
      decodeActivityRow({
        actor_email: "owner@example.com",
        actor_name: "Owner User",
        actor_user_id: "user_owner",
        created_at: new Date("2026-06-07T11:00:00.000Z"),
        created_at_cursor: "2026-06-07T11:00:00.000000Z",
        event_type: "organization_invitation_created",
        id: "audit_invite",
        metadata: {
          ...auditMetadataSource,
          invitationEmailMasked: "m***@e***.com",
          role: "member",
          targetUserId: null,
        },
        organization_id: "org_123",
        organization_name: "Acme Field Ops",
        target_email: null,
        target_member_id: null,
        target_name: null,
        target_user_id: null,
      })
    );

    expect(item).toMatchObject({
      summary: "Invited m***@e***.com.",
      target: {
        label: "m***@e***.com",
        type: "invitation",
      },
    });
    expect(item.roleChange).toBeUndefined();
    expect(JSON.stringify(item)).not.toContain("member@example.com");
  });

  it("does not emit role-change badges for member removal role metadata", () => {
    const item = mapOrganizationSecurityActivityRow(
      decodeActivityRow({
        actor_email: "owner@example.com",
        actor_name: "Owner User",
        actor_user_id: "user_owner",
        created_at: new Date("2026-06-07T11:30:00.000Z"),
        created_at_cursor: "2026-06-07T11:30:00.000000Z",
        event_type: "organization_member_removed",
        id: "audit_removed",
        metadata: {
          ...auditMetadataSource,
          memberId: "member_123",
          previousRole: null,
          role: "admin",
          targetUserId: "user_member",
        },
        organization_id: "org_123",
        organization_name: "Acme Field Ops",
        target_email: null,
        target_member_id: null,
        target_name: null,
        target_user_id: null,
      })
    );

    expect(item.roleChange).toBeUndefined();
    expect(item.target).toStrictEqual({
      label: "member_123",
      memberId: "member_123",
      type: "member",
      userId: undefined,
    });
  });

  it("does not trust unscoped target user metadata for member PII", () => {
    const item = mapOrganizationSecurityActivityRow(
      decodeActivityRow({
        actor_email: "owner@example.com",
        actor_name: "Owner User",
        actor_user_id: "user_owner",
        created_at: new Date("2026-06-07T11:45:00.000Z"),
        created_at_cursor: "2026-06-07T11:45:00.000000Z",
        event_type: "organization_member_role_updated",
        id: "audit_malformed_target",
        metadata: {
          ...auditMetadataSource,
          memberId: "member_123",
          previousRole: "member",
          role: "admin",
          targetUserId: "user_from_other_org",
        },
        organization_id: "org_123",
        organization_name: "Acme Field Ops",
        target_email: "other@example.com",
        target_member_id: null,
        target_name: "Other Org User",
        target_user_id: null,
      })
    );

    expect(item.target).toStrictEqual({
      label: "member_123",
      memberId: "member_123",
      type: "member",
      userId: undefined,
    });
    expect(JSON.stringify(item)).not.toContain("Other Org User");
    expect(JSON.stringify(item)).not.toContain("other@example.com");
    expect(JSON.stringify(item)).not.toContain("user_from_other_org");
  });

  it("rejects organization-active-changed rows at the repository boundary", () => {
    expect(() =>
      decodeActivityRow({
        actor_email: "owner@example.com",
        actor_name: "Owner User",
        actor_user_id: "user_owner",
        created_at: new Date("2026-06-07T12:00:00.000Z"),
        created_at_cursor: "2026-06-07T12:00:00.000000Z",
        event_type: "organization_active_changed",
        id: "audit_active",
        metadata: auditMetadataSource,
        organization_id: "org_123",
        organization_name: "Acme Field Ops",
        target_email: null,
        target_member_id: null,
        target_name: null,
        target_user_id: null,
      })
    ).toThrow();
  });

  it("rejects malformed event metadata at the repository boundary", () => {
    expect(() =>
      decodeActivityRow({
        actor_email: "owner@example.com",
        actor_name: "Owner User",
        actor_user_id: "user_owner",
        created_at: new Date("2026-06-07T11:30:00.000Z"),
        created_at_cursor: "2026-06-07T11:30:00.000000Z",
        event_type: "organization_member_role_updated",
        id: "audit_bad_metadata",
        metadata: {
          ...auditMetadataSource,
          memberId: "member_123",
          previousRole: "not-a-role",
          role: "admin",
          targetUserId: "user_member",
        },
        organization_id: "org_123",
        organization_name: "Acme Field Ops",
        target_email: null,
        target_member_id: "member_123",
        target_name: "Taylor Member",
        target_user_id: "user_member",
      })
    ).toThrow(/previousRole/u);
  });

  it("rejects organization-created rows when member target columns are projected", () => {
    expect(() =>
      decodeActivityRow({
        actor_email: "owner@example.com",
        actor_name: "Owner User",
        actor_user_id: "user_owner",
        created_at: new Date("2026-06-07T10:30:00.000Z"),
        created_at_cursor: "2026-06-07T10:30:00.000000Z",
        event_type: "organization_created",
        id: "audit_created_joined_target",
        metadata: {
          ...auditMetadataSource,
          memberId: "member_owner",
          previousRole: null,
          role: "owner",
          targetUserId: "user_owner",
        },
        organization_id: "org_123",
        organization_name: "Acme Field Ops",
        target_email: "owner@example.com",
        target_member_id: "member_owner",
        target_name: "Owner User",
        target_user_id: "user_owner",
      })
    ).toThrow();
  });

  it("rejects raw persisted invitation emails at the repository boundary", () => {
    expect(() =>
      decodeActivityRow({
        actor_email: "owner@example.com",
        actor_name: "Owner User",
        actor_user_id: "user_owner",
        created_at: new Date("2026-06-07T11:00:00.000Z"),
        created_at_cursor: "2026-06-07T11:00:00.000000Z",
        event_type: "organization_invitation_created",
        id: "audit_raw_email",
        metadata: {
          ...auditMetadataSource,
          invitationEmailMasked: "member@example.com",
          role: "member",
          targetUserId: null,
        },
        organization_id: "org_123",
        organization_name: "Acme Field Ops",
        target_email: null,
        target_member_id: null,
        target_name: null,
        target_user_id: null,
      })
    ).toThrow(/masked invitation email/u);
  });

  it.each([
    ["outcome", { source: "better_auth_organization_plugin" }],
    ["source", { outcome: "succeeded" }],
    [
      "extra",
      {
        ...auditMetadataSource,
        extra: true,
      },
    ],
  ])("rejects %s metadata contract violations", (_label, metadata) => {
    expect(() =>
      decodeActivityRow({
        actor_email: "owner@example.com",
        actor_name: "Owner User",
        actor_user_id: "user_owner",
        created_at: new Date("2026-06-07T11:00:00.000Z"),
        created_at_cursor: "2026-06-07T11:00:00.000000Z",
        event_type: "organization_updated",
        id: "audit_bad_contract",
        metadata: {
          ...metadata,
          updatedFields: ["name"],
        },
        organization_id: "org_123",
        organization_name: "Acme Field Ops",
        target_email: null,
        target_member_id: null,
        target_name: null,
        target_user_id: null,
      })
    ).toThrow();
  });
});

describe("organization security activity cursors", () => {
  it("preserves database timestamp precision in cursor state", () => {
    const row = decodeActivityRow({
      actor_email: "owner@example.com",
      actor_name: "Owner User",
      actor_user_id: "user_owner",
      created_at: new Date("2026-06-07T10:30:00.123Z"),
      created_at_cursor: "2026-06-07T10:30:00.123456Z",
      event_type: "organization_created",
      id: "audit_123",
      metadata: {
        ...auditMetadataSource,
        memberId: "member_owner",
        previousRole: null,
        role: "owner",
        targetUserId: "user_owner",
      },
      organization_id: "org_123",
      organization_name: "Acme Field Ops",
      target_email: null,
      target_member_id: null,
      target_name: null,
      target_user_id: null,
    });
    const cursor = encodeOrganizationSecurityActivityCursor(row);

    expect(decodeOrganizationSecurityActivityCursor(cursor)).toStrictEqual({
      createdAt: "2026-06-07T10:30:00.123456Z",
      id: "audit_123",
    });
  });

  it("rejects semantically invalid cursor timestamps", () => {
    const cursor = Buffer.from(
      JSON.stringify({
        createdAt: "2026-02-31T10:30:00.123456Z",
        id: "audit_123",
      })
    ).toString("base64url") as OrganizationSecurityActivityCursor;

    expect(() => decodeOrganizationSecurityActivityCursor(cursor)).toThrow(
      /UTC timestamp cursor/u
    );
  });

  it("requires database-formatted microsecond cursor timestamps", () => {
    const cursor = Buffer.from(
      JSON.stringify({
        createdAt: "2026-06-07T10:30:00.123Z",
        id: "audit_123",
      })
    ).toString("base64url") as OrganizationSecurityActivityCursor;

    expect(() => decodeOrganizationSecurityActivityCursor(cursor)).toThrow(
      /UTC timestamp cursor/u
    );
  });
});

describe("organization security audit writes", () => {
  it("normalizes nullable DB insert columns at the schema boundary", () => {
    expect(
      decodeOrganizationSecurityAuditWrite({
        actorUserId: "user_owner",
        eventType: "organization_invitation_created",
        metadata: {
          ...auditMetadataSource,
          invitationEmailMasked: "m***@e***.com",
          role: "member",
        },
        organizationId: "org_123",
      })
    ).toStrictEqual({
      actorUserId: "user_owner",
      eventType: "organization_invitation_created",
      metadata: {
        ...auditMetadataSource,
        invitationEmailMasked: "m***@e***.com",
        role: "member",
        targetUserId: null,
      },
      oauthClientId: null,
      organizationId: "org_123",
      scopes: null,
      sessionId: null,
      sourceIp: null,
      userAgent: null,
    });
  });

  it.each([
    [
      "missing organization id",
      {
        actorUserId: "user_owner",
        eventType: "organization_updated",
        metadata: {
          ...auditMetadataSource,
          updatedFields: ["name"],
        },
        organizationId: null,
      },
    ],
    [
      "empty updated fields",
      {
        actorUserId: "user_owner",
        eventType: "organization_updated",
        metadata: {
          ...auditMetadataSource,
          updatedFields: [],
        },
        organizationId: "org_123",
      },
    ],
    [
      "missing invitation email",
      {
        actorUserId: "user_owner",
        eventType: "organization_invitation_created",
        metadata: {
          ...auditMetadataSource,
          invitationEmailMasked: null,
          role: "member",
        },
        organizationId: "org_123",
      },
    ],
    [
      "partial invitation acceptance",
      {
        actorUserId: "user_member",
        eventType: "organization_invitation_accepted",
        metadata: {
          ...auditMetadataSource,
          invitationEmailMasked: "m***@e***.com",
          memberId: "member_accepted",
          role: "member",
          targetUserId: null,
        },
        organizationId: "org_123",
      },
    ],
    [
      "partial role update",
      {
        actorUserId: "user_owner",
        eventType: "organization_member_role_updated",
        metadata: {
          ...auditMetadataSource,
          memberId: "member_123",
          previousRole: null,
          role: "admin",
          targetUserId: "user_member",
        },
        organizationId: "org_123",
      },
    ],
    [
      "partial member removal",
      {
        actorUserId: "user_owner",
        eventType: "organization_member_removed",
        metadata: {
          ...auditMetadataSource,
          memberId: "member_123",
          role: "admin",
          targetUserId: null,
        },
        organizationId: "org_123",
      },
    ],
    [
      "active change without either organization",
      {
        actorUserId: "user_owner",
        eventType: "organization_active_changed",
        metadata: {
          ...auditMetadataSource,
          activeOrganizationId: null,
          previousOrganizationId: null,
        },
        organizationId: "org_123",
      },
    ],
  ])("rejects %s", (_label, input) => {
    expect(() => decodeOrganizationSecurityAuditWrite(input)).toThrow();
  });
});

describe("organization security activity repository", () => {
  it("uses the schema-owned default list limit", () => {
    expect(decodeSecurityActivityQuery({})).toStrictEqual({
      limit: 50,
    });
  });

  it("lists organization-created rows with creator member metadata after target projection", async () => {
    const response = await Effect.runPromise(
      runRepositoryList([
        {
          actor_email: "owner@example.com",
          actor_name: "Owner User",
          actor_user_id: "user_owner",
          created_at: new Date("2026-06-07T10:30:00.000Z"),
          created_at_cursor: "2026-06-07T10:30:00.000000Z",
          event_type: "organization_created",
          id: "audit_created",
          metadata: {
            ...auditMetadataSource,
            memberId: "member_owner",
            previousRole: null,
            role: "owner",
            targetUserId: "user_owner",
          },
          organization_id: "org_123",
          organization_name: "Acme Field Ops",
          target_email: null,
          target_member_id: null,
          target_name: null,
          target_user_id: null,
        },
      ])
    );

    expect(response.items).toStrictEqual([
      expect.objectContaining({
        eventType: "organization_created",
        summary: "Created Acme Field Ops.",
        target: {
          label: "Acme Field Ops",
          type: "organization",
        },
      }),
    ]);
  });

  it("fails invalid persisted rows through a typed storage error", async () => {
    const error = await Effect.runPromise(
      Effect.flip(
        runRepositoryList([
          {
            actor_email: "owner@example.com",
            actor_name: "Owner User",
            actor_user_id: "user_owner",
            created_at: new Date("2026-06-07T12:00:00.000Z"),
            created_at_cursor: "2026-06-07T12:00:00.000000Z",
            event_type: "organization_active_changed",
            id: "audit_active",
            metadata: auditMetadataSource,
            organization_id: "org_123",
            organization_name: "Acme Field Ops",
            target_email: null,
            target_member_id: null,
            target_name: null,
            target_user_id: null,
          },
        ])
      )
    );

    expect(error).toBeInstanceOf(OrganizationSecurityActivityStorageError);
    expect(error.message).toBe(
      "Organization security activity row decode failed"
    );
  });

  it.each([
    [
      "invitation metadata with a null masked email",
      {
        actor_email: "owner@example.com",
        actor_name: "Owner User",
        actor_user_id: "user_owner",
        created_at: new Date("2026-06-07T12:00:00.000Z"),
        created_at_cursor: "2026-06-07T12:00:00.000000Z",
        event_type: "organization_invitation_created",
        id: "audit_bad_invitation",
        metadata: {
          ...auditMetadataSource,
          invitationEmailMasked: null,
          role: "member",
          targetUserId: null,
        },
        organization_id: "org_123",
        organization_name: "Acme Field Ops",
        target_email: null,
        target_member_id: null,
        target_name: null,
        target_user_id: null,
      },
    ],
    [
      "role update metadata with a null previous role",
      {
        actor_email: "owner@example.com",
        actor_name: "Owner User",
        actor_user_id: "user_owner",
        created_at: new Date("2026-06-07T12:00:00.000Z"),
        created_at_cursor: "2026-06-07T12:00:00.000000Z",
        event_type: "organization_member_role_updated",
        id: "audit_bad_role_update",
        metadata: {
          ...auditMetadataSource,
          memberId: "member_123",
          previousRole: null,
          role: "admin",
          targetUserId: "user_member",
        },
        organization_id: "org_123",
        organization_name: "Acme Field Ops",
        target_email: "member@example.com",
        target_member_id: "member_123",
        target_name: "Taylor Member",
        target_user_id: "user_member",
      },
    ],
    [
      "organization update metadata with an arbitrary field",
      {
        actor_email: "owner@example.com",
        actor_name: "Owner User",
        actor_user_id: "user_owner",
        created_at: new Date("2026-06-07T12:00:00.000Z"),
        created_at_cursor: "2026-06-07T12:00:00.000000Z",
        event_type: "organization_updated",
        id: "audit_bad_updated_field",
        metadata: {
          ...auditMetadataSource,
          updatedFields: ["slug"],
        },
        organization_id: "org_123",
        organization_name: "Acme Field Ops",
        target_email: null,
        target_member_id: null,
        target_name: null,
        target_user_id: null,
      },
    ],
  ])("fails %s through repository decode", async (_label, row) => {
    const error = await Effect.runPromise(
      Effect.flip(runRepositoryList([row]))
    );

    expect(error).toBeInstanceOf(OrganizationSecurityActivityStorageError);
    expect(error.message).toBe(
      "Organization security activity row decode failed"
    );
  });
});

describe("organization security activity service", () => {
  it("maps malformed session identity to a storage boundary error", async () => {
    const error = await Effect.runPromise(
      Effect.flip(
        Effect.gen(function* verifyMalformedSessionIdentity() {
          const service = yield* OrganizationSecurityActivityService;
          return yield* service.list(decodeSecurityActivityQuery({}));
        }).pipe(
          Effect.provide(
            OrganizationSecurityActivityService.DefaultWithoutDependencies
          ),
          Effect.provide(OrganizationAuthorization.Default),
          Effect.provide(
            Layer.succeed(
              CurrentOrganizationActor,
              CurrentOrganizationActor.of({
                get: () =>
                  Effect.fail(
                    new OrganizationSessionIdentityInvalidError({
                      cause: "Expected a non-empty user id",
                      field: "userId",
                      message: "Session user id is invalid",
                    })
                  ),
              })
            )
          ),
          Effect.provide(
            Layer.succeed(
              OrganizationSecurityActivityRepository,
              OrganizationSecurityActivityRepository.of({
                list: () =>
                  Effect.die(
                    "Repository should not run when session identity is malformed"
                  ),
              })
            )
          ),
          Effect.provide(
            Layer.succeed(
              HttpServerRequest.HttpServerRequest,
              {} as HttpServerRequest.HttpServerRequest
            )
          )
        )
      )
    );

    expect(error).toBeInstanceOf(OrganizationSecurityActivityStorageError);
    expect(error.message).toBe("Session user id is invalid");
  });
});

function runRepositoryList(rows: readonly Record<string, unknown>[]) {
  return Effect.gen(function* runSecurityActivityRepositoryList() {
    const repository = yield* OrganizationSecurityActivityRepository;

    return yield* repository.list(
      decodeOrganizationId("org_123"),
      decodeSecurityActivityQuery({})
    );
  }).pipe(
    Effect.provide(OrganizationSecurityActivityRepository.Default),
    Effect.provide(
      Layer.succeed(SqlClient.SqlClient, makeSecurityActivitySqlClient(rows))
    )
  );
}

function makeSecurityActivitySqlClient(
  rows: readonly Record<string, unknown>[]
): SqlClient.SqlClient {
  const sql = Object.assign(<Row>() => Effect.succeed([...rows] as Row[]), {
    and: (clauses: readonly unknown[]) => clauses,
    in: (values: readonly unknown[]) => values,
    withTransaction: <Value, Error, Requirements>(
      effect: Effect.Effect<Value, Error, Requirements>
    ) => effect,
  });

  return sql as unknown as SqlClient.SqlClient;
}
