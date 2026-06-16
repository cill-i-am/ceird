import { describe, expect, it } from "@effect/vitest";
import { Schema } from "effect";

import {
  ACTIVITY_EVENTS_SYNC_WHERE,
  ACTIVE_LABELS_SYNC_WHERE,
  isSyncInternalPath,
  makeSyncShapeAuthorizationPath,
  SyncShapeAuthorizationSchema,
  SYNC_SHAPE_NAMES,
} from "./sync.js";

describe("domain sync boundary contracts", () => {
  it("declares the internal domain authorization boundary", () => {
    expect(makeSyncShapeAuthorizationPath("jobs")).toBe(
      "/sync/internal/shapes/jobs/authorize"
    );
    expect(
      isSyncInternalPath("/sync/internal/shapes/jobs/authorize")
    ).toBeTruthy();
    expect(isSyncInternalPath("/sync/internal/shapes")).toBeTruthy();
    expect(isSyncInternalPath("/jobs")).toBeFalsy();
  });

  it("decodes the active labels Electric shape definition", () => {
    const authorization = Schema.decodeUnknownSync(
      SyncShapeAuthorizationSchema
    )({
      organizationId: "org_123",
      params: {
        "1": "org_123",
      },
      shape: "labels",
      scope: "organization",
      table: "labels",
      userId: "user_123",
      where: ACTIVE_LABELS_SYNC_WHERE,
    });

    expect(authorization).toStrictEqual({
      organizationId: "org_123",
      params: {
        "1": "org_123",
      },
      shape: "labels",
      scope: "organization",
      table: "labels",
      userId: "user_123",
      where: "organization_id = $1 AND archived_at IS NULL",
    });
  });

  it("decodes authorized Electric shape definitions", () => {
    const authorization = Schema.decodeUnknownSync(
      SyncShapeAuthorizationSchema
    )({
      organizationId: "org_123",
      params: {
        "1": "org_123",
      },
      shape: "jobs",
      scope: "organization",
      table: "work_items",
      userId: "user_123",
      where: "organization_id = $1",
    });

    expect(authorization).toStrictEqual({
      organizationId: "org_123",
      params: {
        "1": "org_123",
      },
      shape: "jobs",
      scope: "organization",
      table: "work_items",
      userId: "user_123",
      where: "organization_id = $1",
    });
  });

  it("decodes the bounded activity events Electric shape definition", () => {
    const authorization = Schema.decodeUnknownSync(
      SyncShapeAuthorizationSchema
    )({
      organizationId: "org_123",
      params: {
        "1": "org_123",
        "2": "2026-06-16T00:00:00.000Z",
      },
      shape: "activity-events",
      scope: "organization",
      table: "activity_events",
      userId: "user_123",
      where: ACTIVITY_EVENTS_SYNC_WHERE,
    });

    expect(authorization).toStrictEqual({
      organizationId: "org_123",
      params: {
        "1": "org_123",
        "2": "2026-06-16T00:00:00.000Z",
      },
      shape: "activity-events",
      scope: "organization",
      table: "activity_events",
      userId: "user_123",
      where: "organization_id = $1 AND retained_until > $2",
    });
  });

  it("rejects unbounded activity events shape definitions", () => {
    expect(() =>
      Schema.decodeUnknownSync(SyncShapeAuthorizationSchema)({
        organizationId: "org_123",
        params: {
          "1": "org_123",
        },
        shape: "activity-events",
        scope: "organization",
        table: "activity_events",
        userId: "user_123",
        where: "organization_id = $1",
      })
    ).toThrow();
  });

  it("decodes per-user authorized Electric shape definitions", () => {
    expect(
      Schema.decodeUnknownSync(SyncShapeAuthorizationSchema)({
        organizationId: "org_123",
        params: {
          "1": "org_123",
          "2": "user_123",
        },
        shape: "agent-action-runs",
        scope: "organization-user",
        table: "agent_action_runs",
        userId: "user_123",
        where: "organization_id = $1 AND user_id = $2",
      })
    ).toMatchObject({
      params: {
        "1": "org_123",
        "2": "user_123",
      },
      scope: "organization-user",
    });
  });

  it("rejects scope and parameter mismatches", () => {
    expect(() =>
      Schema.decodeUnknownSync(SyncShapeAuthorizationSchema)({
        organizationId: "org_123",
        params: {
          "1": "org_123",
        },
        shape: "agent-action-runs",
        scope: "organization-user",
        table: "agent_action_runs",
        userId: "user_123",
        where: "organization_id = $1 AND user_id = $2",
      })
    ).toThrow();
  });

  it("keeps shape names explicit for the public sync API", () => {
    expect(SYNC_SHAPE_NAMES).toContain("activity-events");
    expect(SYNC_SHAPE_NAMES).toContain("jobs");
    expect(SYNC_SHAPE_NAMES).toContain("site-active-job-summaries");
    expect(SYNC_SHAPE_NAMES).toContain("site-comment-bodies");
    expect(SYNC_SHAPE_NAMES).toContain("sites");
    expect(SYNC_SHAPE_NAMES).toContain("agent-action-runs");
    expect(SYNC_SHAPE_NAMES).toContain("product-activity-actors");
    expect(SYNC_SHAPE_NAMES).toContain("product-member-actor-summaries");
    expect(SYNC_SHAPE_NAMES).not.toContain("product-activity-actor-sources");
  });
});
