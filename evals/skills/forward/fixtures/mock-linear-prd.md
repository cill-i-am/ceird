# Mock Linear Project: Weekly Admin Activity Digest

## Problem Statement

Workspace admins miss important collaboration changes unless they manually
inspect multiple views.

## Goals

- Send a weekly admin-only digest.
- Include new comments, resolved threads, label changes, and unusually active
  sites.
- Let each workspace opt out.
- Reuse existing email delivery architecture.

## Non-Goals

- Custom schedules.
- Non-admin subscriptions.
- Analytics dashboards.

## Acceptance Criteria

- Admin receives a weekly digest for opted-in workspaces.
- Opted-out workspaces receive no digest.
- Digest content is generated from existing collaboration data.
- Email send path records enough evidence for debugging delivery failures.

## Risks

- Activity aggregation could cross workspace boundaries if queries are wrong.
- Email templates need design approval.
- Scheduling must not duplicate sends.

## Open Questions / HITL Decisions

- Final email layout approval.
- Recommended default for "unusually active" sites.
