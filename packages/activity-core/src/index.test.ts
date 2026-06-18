import { describe, expect, it } from "@effect/vitest";
import { Schema } from "effect";

import {
  ACTIVITY_EVENT_TYPES,
  ACTIVITY_FEED_MAX_EVENTS_PER_ORG,
  ACTIVITY_FEED_RETENTION_DAYS,
  ProductActivityEventSchema,
} from "./index.js";

describe("activity core contracts", () => {
  it("decodes a product-safe global activity event", () => {
    const event = Schema.decodeUnknownSync(ProductActivityEventSchema)({
      actorId: "11111111-1111-4111-8111-111111111111",
      createdAt: "2026-06-15T12:00:00.000Z",
      display: {
        detail: "Priority changed from low to urgent.",
        route: {
          href: "/jobs",
          label: "Open jobs",
        },
        summary: "Job priority changed",
      },
      eventType: "job.priority_changed",
      id: "22222222-2222-4222-8222-222222222222",
      organizationId: "org_123",
      retainedUntil: "2026-07-15T12:00:00.000Z",
      sourceId: "33333333-3333-4333-8333-333333333333",
      sourceType: "job_activity",
      status: "synced",
      targetId: "44444444-4444-4444-8444-444444444444",
      targetType: "job",
    });

    expect(event).toMatchObject({
      actorId: "11111111-1111-4111-8111-111111111111",
      eventType: "job.priority_changed",
      status: "synced",
      targetType: "job",
    });
  });

  it("rejects auth-shaped extras at the event boundary", () => {
    expect(() =>
      Schema.decodeUnknownSync(ProductActivityEventSchema)({
        actorId: "11111111-1111-4111-8111-111111111111",
        createdAt: "2026-06-15T12:00:00.000Z",
        display: {
          summary: "Job created",
        },
        email: "person@example.com",
        eventType: "job.created",
        id: "22222222-2222-4222-8222-222222222222",
        organizationId: "org_123",
        retainedUntil: "2026-07-15T12:00:00.000Z",
        sourceId: "33333333-3333-4333-8333-333333333333",
        sourceType: "job_activity",
        status: "synced",
        targetId: "44444444-4444-4444-8444-444444444444",
        targetType: "job",
      })
    ).toThrow();
  });

  it("documents the shipped v1 event taxonomy and bounded feed window", () => {
    expect(ACTIVITY_EVENT_TYPES).toStrictEqual([
      "agent.product_effect",
      "comment.created",
      "job.assignee_changed",
      "job.blocked_reason_changed",
      "job.contact_changed",
      "job.coordinator_changed",
      "job.created",
      "job.label_added",
      "job.label_removed",
      "job.priority_changed",
      "job.reopened",
      "job.site_changed",
      "job.status_changed",
      "job.visit_logged",
      "label.archived",
      "label.created",
      "label.updated",
      "site.comment_created",
      "site.created",
      "site.label_added",
      "site.label_removed",
      "site.updated",
    ]);
    expect(ACTIVITY_FEED_RETENTION_DAYS).toBe(30);
    expect(ACTIVITY_FEED_MAX_EVENTS_PER_ORG).toBe(5000);
  });
});
