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
- show pending invitation expiry metadata on the `/members` page
- report organization invitation delivery failures through the shared auth
  email observability path

## Multi-Organization Switching

Implemented behavior:

- the authenticated sidebar shows the active organization on organization
  routes
- users with multiple organizations can switch explicitly through Better Auth's
  native organization client APIs
- switching invalidates TanStack Router state synchronously so organization
  data and role-scoped navigation refresh together
- the switcher handles loading, empty, single-organization, failed-list, and
  failed-switch states

Remaining follow-up:

- consider richer organization search if accounts commonly belong to many
  organizations

## Workspace And Domain Data

The first organizations slice adds the tenant boundary, not the domain model.

Later work can add:

- workspaces under the active organization if product needs it
- organization-owned tasks, projects, or field workflows
- richer authorization once domain actions require it
