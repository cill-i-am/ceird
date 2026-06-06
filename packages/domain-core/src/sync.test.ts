import { describe, expect, it } from "@effect/vitest";
import { Schema } from "effect";

import {
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
    expect(SYNC_SHAPE_NAMES).toContain("jobs");
    expect(SYNC_SHAPE_NAMES).toContain("sites");
    expect(SYNC_SHAPE_NAMES).toContain("agent-action-runs");
  });
});
