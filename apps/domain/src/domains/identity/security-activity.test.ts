import type { OrganizationSecurityActivityCursor } from "@ceird/identity-core";
import { describe, expect, it } from "@effect/vitest";
import { Schema } from "effect";

import { OrganizationSecurityActivityRowSchema } from "./persistence-schemas.js";
import {
  decodeOrganizationSecurityActivityCursor,
  encodeOrganizationSecurityActivityCursor,
  mapOrganizationSecurityActivityRow,
} from "./security-activity.js";

const decodeActivityRow = Schema.decodeUnknownSync(
  OrganizationSecurityActivityRowSchema
);
const auditMetadataSource = {
  outcome: "succeeded",
  source: "better_auth_organization_plugin",
};

describe("organization security activity mapping", () => {
  it("maps role-change audit rows into safe read-model items", () => {
    expect(
      mapOrganizationSecurityActivityRow(
        decodeActivityRow({
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
        })
      )
    ).toStrictEqual({
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
});
