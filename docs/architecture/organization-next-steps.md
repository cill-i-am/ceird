# Organization Next Steps

This document tracks follow-up work after the first organizations slice.

## Next Product Steps

1. Invite acceptance
2. Organization switching for users who belong to multiple organizations
3. Workspace and domain data under the active organization

## Invite Acceptance

The first organizations slice intentionally does not implement invitations.
When invitations arrive:

- support both existing-user and new-user invite acceptance
- do not auto-create a personal organization for invited users
- set the invited organization active after acceptance

## Multi-Organization Switching

The first organizations slice assumes one meaningful organization context in the
UI at a time.

When multi-org support arrives:

- add explicit organization switching in the app shell
- stop relying on single-org fallback behavior
- preserve role scoping per organization

## Workspace And Domain Data

The first organizations slice adds the tenant boundary, not the domain model.

Later work can add:

- workspaces under the active organization if product needs it
- organization-owned tasks, projects, or field workflows
- richer authorization once domain actions require it
