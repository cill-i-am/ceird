# Organization Next Steps

This document tracks follow-up work after the first organizations slice and the
organization invitations follow-up.

## Next Product Steps

1. Organization switching for users who belong to multiple organizations
2. Workspace and domain data under the active organization
3. Role-specific organization management polish such as invitation revocation
   and richer member administration

## Invite Acceptance

Organization invitations are now implemented with Better Auth-backed delivery
and acceptance:

- support both existing-user and new-user invite acceptance
- avoid auto-creating a personal organization for invited users by returning
  them to the invitation after auth
- set the invited organization active after acceptance
- expose authenticated member invitation management from the `/members` page
- allow pending invitations to be resent or canceled from the `/members` page

Follow-up improvements for this slice:

- expose more invitation metadata such as expiry timestamps in the UI
- add stronger operational observability around invitation delivery failures

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
